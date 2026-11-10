import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { z } from 'zod';
import type { MeterDevice, MeterError } from '@mira/shared';

/**
 * Lokaler, ausschließlich lesender Zugriff auf einen Shelly der Generation 2 oder neuer
 * (RPC über HTTP). Es gibt bewusst nur GET-Abfragen von Status und Geräteinfo –
 * keine Schaltbefehle, keine Zähler-Resets, keine Konfiguration.
 *
 * - Eine einzige, wiederverwendete Verbindung (Keep-Alive, höchstens ein Socket).
 * - Zeitlimit je Anfrage; eine hängende Antwort blockiert nichts außer dieser Abfrage.
 * - Anmeldung: HTTP-Digest (SHA-256, Benutzer `admin`), wie vom Shelly verlangt.
 */

export class ShellyError extends Error {
  readonly code: MeterError;
  constructor(code: MeterError, message: string) {
    super(message);
    this.code = code;
  }
}

/** Ein Messwert, wie ihn der Shelly liefert */
export interface MeterReading {
  /** Zeitpunkt der Antwort (UTC, ms) */
  ts: number;
  powerW: number;
  voltageV: number | null;
  currentA: number | null;
  /** kumulierter Zählerstand in Wh */
  energyTotalWh: number | null;
}

const MAX_BODY = 256 * 1024;

const deviceInfoSchema = z.object({
  id: z.string().max(128),
  model: z.string().max(64),
  gen: z.number().int(),
  fw_id: z.string().max(128).optional(),
  ver: z.string().max(64).optional(),
  app: z.string().max(64).optional(),
  auth_en: z.boolean().optional(),
});

const meterStatusSchema = z.object({
  apower: z.number(),
  voltage: z.number().nullable().optional(),
  current: z.number().nullable().optional(),
  aenergy: z.object({ total: z.number() }).optional(),
});

const COMPONENT = /^(pm1|switch):(\d+)$/;

/** RPC-Methode zur Messkomponente, z. B. `pm1:0` → `PM1.GetStatus?id=0` */
export function statusPath(component: string): string {
  const m = COMPONENT.exec(component);
  if (!m) throw new ShellyError('no_meter', `Unbekannte Messkomponente ${component}`);
  const method = m[1] === 'pm1' ? 'PM1.GetStatus' : 'Switch.GetStatus';
  return `/rpc/${method}?id=${m[2]}`;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  algorithm: string;
  qop: string | null;
  nc: number;
}

function parseChallenge(header: string | undefined): DigestChallenge | null {
  if (!header || !/^Digest /i.test(header)) return null;
  const params = Object.fromEntries(
    [...header.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]),
  );
  if (!params.realm || !params.nonce) return null;
  return { realm: params.realm, nonce: params.nonce, algorithm: (params.algorithm ?? 'SHA-256').toUpperCase(), qop: params.qop ? 'auth' : null, nc: 0 };
}

function hash(algorithm: string, value: string): string {
  return createHash(algorithm === 'MD5' ? 'md5' : 'sha256').update(value).digest('hex');
}

export interface ShellyClientOptions {
  /** z. B. `http://192.0.2.20` */
  baseUrl: string;
  password?: string;
  timeoutMs: number;
}

export class ShellyClient {
  private readonly base: URL;
  private readonly password: string | undefined;
  private readonly timeoutMs: number;
  private readonly agent: http.Agent;
  private challenge: DigestChallenge | null = null;

  constructor(options: ShellyClientOptions) {
    this.base = new URL(options.baseUrl);
    this.password = options.password;
    this.timeoutMs = options.timeoutMs;
    this.agent = new http.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, keepAliveMsecs: 5_000 });
  }

  /** Geräteinfo (`GET /shelly`, ohne Anmeldung). Gen1-Geräte werden abgelehnt. */
  async deviceInfo(): Promise<z.infer<typeof deviceInfoSchema>> {
    const body = await this.get('/shelly');
    const parsed = deviceInfoSchema.safeParse(body);
    if (!parsed.success) {
      const gen1 = typeof body === 'object' && body !== null && 'type' in body;
      throw new ShellyError(gen1 ? 'unsupported_device' : 'invalid_response', gen1 ? 'Shelly der Generation 1 wird nicht unterstützt' : 'Unerwartete Geräteinfo');
    }
    if (parsed.data.gen < 2) throw new ShellyError('unsupported_device', `Shelly der Generation ${parsed.data.gen} wird nicht unterstützt`);
    return parsed.data;
  }

  /** Erste Messkomponente mit Leistungswert (`pm1:N` bevorzugt, sonst `switch:N`). */
  async detectComponent(): Promise<string> {
    const body = await this.get('/rpc/Shelly.GetStatus');
    if (typeof body !== 'object' || body === null) throw new ShellyError('invalid_response', 'Unerwarteter Gerätestatus');
    const candidates = Object.entries(body)
      .filter(([key, value]) => COMPONENT.test(key) && typeof value === 'object' && value !== null && typeof (value as { apower?: unknown }).apower === 'number')
      .map(([key]) => key)
      .sort((a, b) => Number(b.startsWith('pm1')) - Number(a.startsWith('pm1')) || a.localeCompare(b));
    if (!candidates.length) throw new ShellyError('no_meter', 'Der Shelly meldet keine Messkomponente mit Leistungswert');
    return candidates[0];
  }

  /** Geräteinfo und Messkomponente für die Anzeige */
  async identify(forcedComponent?: string): Promise<MeterDevice> {
    const info = await this.deviceInfo();
    const component = forcedComponent ?? (await this.detectComponent());
    return { id: info.id, model: info.model, generation: info.gen, firmware: info.ver ?? info.fw_id ?? null, component };
  }

  /** Aktueller Messwert der Komponente */
  async read(component: string): Promise<MeterReading> {
    const body = await this.get(statusPath(component));
    const parsed = meterStatusSchema.safeParse(body);
    if (!parsed.success || !Number.isFinite(parsed.data.apower)) throw new ShellyError('invalid_response', 'Antwort enthält keinen gültigen Leistungswert');
    const s = parsed.data;
    return {
      ts: Date.now(),
      powerW: s.apower,
      voltageV: s.voltage ?? null,
      currentA: s.current ?? null,
      energyTotalWh: s.aenergy?.total ?? null,
    };
  }

  close(): void {
    this.agent.destroy();
  }

  private authorization(path: string): string | undefined {
    const c = this.challenge;
    if (!c || !this.password) return undefined;
    c.nc += 1;
    const nc = c.nc.toString(16).padStart(8, '0');
    const cnonce = randomBytes(8).toString('hex');
    const ha1 = hash(c.algorithm, `admin:${c.realm}:${this.password}`);
    const ha2 = hash(c.algorithm, `GET:${path}`);
    const response = c.qop ? hash(c.algorithm, `${ha1}:${c.nonce}:${nc}:${cnonce}:${c.qop}:${ha2}`) : hash(c.algorithm, `${ha1}:${c.nonce}:${ha2}`);
    const parts = [`username="admin"`, `realm="${c.realm}"`, `nonce="${c.nonce}"`, `uri="${path}"`, `algorithm=${c.algorithm}`, `response="${response}"`];
    if (c.qop) parts.push(`qop=${c.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    return `Digest ${parts.join(', ')}`;
  }

  /** GET mit JSON-Antwort; bei 401 genau ein neuer Versuch mit frischer Digest-Challenge. */
  private async get(path: string): Promise<unknown> {
    let res = await this.request(path, this.authorization(path));
    if (res.status === 401) {
      if (!this.password) throw new ShellyError('unauthorized', 'Der Shelly verlangt ein Passwort (LOGGER_SHELLY_PASSWORD_FILE)');
      this.challenge = parseChallenge(res.authenticate);
      if (!this.challenge) throw new ShellyError('unauthorized', 'Unbekanntes Anmeldeverfahren des Shelly');
      res = await this.request(path, this.authorization(path));
      if (res.status === 401) throw new ShellyError('unauthorized', 'Passwort wurde vom Shelly abgelehnt');
    }
    if (res.status !== 200) throw new ShellyError('invalid_response', `Unerwarteter Status ${res.status}`);
    try {
      return JSON.parse(res.body);
    } catch {
      throw new ShellyError('invalid_response', 'Antwort ist kein gültiges JSON');
    }
  }

  private request(path: string, authorization: string | undefined): Promise<{ status: number; body: string; authenticate?: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err: ShellyError | null, value?: { status: number; body: string; authenticate?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value!);
      };
      const req = http.request(
        {
          protocol: this.base.protocol,
          hostname: this.base.hostname,
          port: this.base.port || 80,
          path,
          method: 'GET',
          agent: this.agent,
          headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY) {
              req.destroy();
              done(new ShellyError('invalid_response', 'Antwort zu groß'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            done(null, {
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
              authenticate: res.headers['www-authenticate'],
            }),
          );
          res.on('error', (err) => done(new ShellyError('unreachable', err.message)));
        },
      );
      const timer = setTimeout(() => {
        req.destroy();
        done(new ShellyError('timeout', `Keine Antwort innerhalb von ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      req.on('error', (err) => done(new ShellyError('unreachable', err.message)));
      req.end();
    });
  }
}
