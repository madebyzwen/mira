import https from 'node:https';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import type { z } from 'zod';
import {
  odinHealthSchema,
  systemInfoSchema,
  systemMetricsSchema,
  type ConnectionError,
  type OdinHealth,
  type SystemInfo,
  type SystemMetrics,
} from '@mira/shared';

export class OdinClientError extends Error {
  readonly code: ConnectionError;

  constructor(code: ConnectionError, message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizeFingerprint(value: string): string {
  return value.replace(/[^0-9a-f]/gi, '').toUpperCase();
}

export interface OdinClientOptions {
  url: string;
  certFingerprint: string;
  token: string;
  timeoutMs?: number;
}

/**
 * HTTPS-Agent mit **Zertifikats-Pinning** und offener Verbindung (Keep-Alive).
 * Eine neue TLS-Verbindung wird erst an Anfragen übergeben, nachdem der
 * SHA-256-Fingerprint des Servers geprüft wurde – ein fremder Server bekommt
 * daher nie ein Token zu sehen. Danach wird die Verbindung wiederverwendet.
 */
class PinnedAgent extends https.Agent {
  private readonly fingerprint: string;

  constructor(fingerprint: string) {
    super({ keepAlive: true, keepAliveMsecs: 10_000, maxSockets: 1, maxFreeSockets: 1, timeout: 30_000 });
    this.fingerprint = fingerprint;
  }

  override createConnection(options: https.RequestOptions, callback?: (err: Error | null, stream: Duplex) => void): undefined {
    const done = callback ?? (() => {});
    const host = (options.hostname ?? options.host ?? '').replace(/^\[|\]$/g, '');
    const socket = tls.connect({
      host,
      port: Number(options.port ?? 443),
      // Vertrauen entsteht ausschließlich über den festgelegten Fingerprint (unten)
      rejectUnauthorized: false,
      servername: net.isIP(host) ? undefined : host,
      ALPNProtocols: ['http/1.1'],
    });
    const onError = (err: Error) => done(new OdinClientError('unreachable', err.message), socket);
    socket.once('error', onError);
    socket.once('secureConnect', () => {
      socket.off('error', onError);
      const actual = normalizeFingerprint(socket.getPeerCertificate().fingerprint256 ?? '');
      if (actual !== this.fingerprint) {
        socket.destroy();
        done(new OdinClientError('certificate_mismatch', 'Zertifikat von Odin stimmt nicht mit dem hinterlegten Fingerprint überein'), socket);
        return;
      }
      done(null, socket);
    });
    return undefined;
  }
}

/** Client für die Odin-API (HTTPS, festgelegtes Zertifikat, Token). */
export class OdinClient {
  private readonly url: URL;
  private readonly fingerprint: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly agent: PinnedAgent;

  constructor(options: OdinClientOptions) {
    this.url = new URL(options.url);
    this.fingerprint = normalizeFingerprint(options.certFingerprint);
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.agent = new PinnedAgent(this.fingerprint);
  }

  get endpoint(): string {
    return this.url.host;
  }

  health(): Promise<OdinHealth> {
    return this.get('/v1/health', odinHealthSchema);
  }

  info(): Promise<SystemInfo> {
    return this.get('/v1/system/info', systemInfoSchema);
  }

  metrics(): Promise<SystemMetrics> {
    return this.get('/v1/system/metrics', systemMetricsSchema);
  }

  /** Offene Verbindung schließen (z. B. beim Beenden von MIRA). */
  close(): void {
    this.agent.destroy();
  }

  private async get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = https.request(
          {
            host: this.url.hostname,
            port: Number(this.url.port || 443),
            path,
            method: 'GET',
            agent: this.agent,
            headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' },
            signal: controller.signal,
          },
          (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              data += chunk;
              if (data.length > 1_000_000) req.destroy(new OdinClientError('invalid_response', 'Antwort zu groß'));
            });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
            res.on('error', reject);
          },
        );
        req.on('error', (err) => reject(controller.signal.aborted ? new OdinClientError('timeout', 'Zeitüberschreitung') : err));
        req.end();
      });

      if (status === 401) throw new OdinClientError('unauthorized', 'Token wurde von Odin abgelehnt');
      if (status !== 200) throw new OdinClientError('invalid_response', `Unerwarteter Status ${status}`);
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        throw new OdinClientError('invalid_response', 'Antwort ist kein gültiges JSON');
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new OdinClientError('invalid_response', 'Antwort entspricht nicht dem Vertrag');
      return parsed.data;
    } catch (err) {
      if (err instanceof OdinClientError) throw err;
      if (controller.signal.aborted) throw new OdinClientError('timeout', 'Zeitüberschreitung');
      throw new OdinClientError('unreachable', err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }
}
