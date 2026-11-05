import https from 'node:https';
import net from 'node:net';
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
 * Client für die Odin-API mit **Zertifikats-Pinning**: Die TLS-Verbindung wird
 * zuerst aufgebaut und der SHA-256-Fingerprint geprüft. Erst danach wird die
 * HTTP-Anfrage samt Token über genau diese Verbindung gesendet – ein fremder
 * Server bekommt das Token nie zu sehen.
 */
export class OdinClient {
  private readonly url: URL;
  private readonly fingerprint: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: OdinClientOptions) {
    this.url = new URL(options.url);
    this.fingerprint = normalizeFingerprint(options.certFingerprint);
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 5000;
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

  private async connect(signal: AbortSignal): Promise<tls.TLSSocket> {
    const host = this.url.hostname.replace(/^\[|\]$/g, '');
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host,
        port: Number(this.url.port || 443),
        // Vertrauen entsteht ausschließlich über den festgelegten Fingerprint (unten)
        rejectUnauthorized: false,
        servername: net.isIP(host) ? undefined : host,
        ALPNProtocols: ['http/1.1'],
      });
      const fail = (err: Error) => {
        socket.destroy();
        reject(err);
      };
      signal.addEventListener('abort', () => fail(new OdinClientError('timeout', 'Zeitüberschreitung beim Verbindungsaufbau')), { once: true });
      socket.once('error', (err) => fail(new OdinClientError('unreachable', err.message)));
      socket.once('secureConnect', () => {
        const actual = normalizeFingerprint(socket.getPeerCertificate().fingerprint256 ?? '');
        if (actual !== this.fingerprint) {
          fail(new OdinClientError('certificate_mismatch', 'Zertifikat von Odin stimmt nicht mit dem hinterlegten Fingerprint überein'));
          return;
        }
        resolve(socket);
      });
    });
  }

  private async get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const socket = await this.connect(controller.signal);
      const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = https.request(
          {
            host: this.url.hostname,
            port: Number(this.url.port || 443),
            path,
            method: 'GET',
            // Ohne `agent` nutzt Node genau diese – bereits geprüfte – Verbindung
            createConnection: () => socket,
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
