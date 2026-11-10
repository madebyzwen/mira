import http from 'node:http';
import type { z } from 'zod';
import {
  consumptionResponseSchema,
  databaseStatsResponseSchema,
  liveResponseSchema,
  loggerHealthSchema,
  powerHistoryResponseSchema,
  type ConsumptionPeriod,
  type ConsumptionResponse,
  type DatabaseStatsResponse,
  type HistoryRange,
  type LiveResponse,
  type LoggerConnectionError,
  type LoggerHealth,
  type PowerHistoryResponse,
} from '@mira/shared';

export class LoggerClientError extends Error {
  readonly code: LoggerConnectionError;
  constructor(code: LoggerConnectionError, message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_BODY = 2 * 1024 * 1024;

export interface LoggerClientOptions {
  /** z. B. `http://mira-shelly-logger:8090` */
  url: string;
  token?: string;
  timeoutMs?: number;
}

/**
 * Zugriff auf die interne Lese-API des Shelly-Loggers (ADR 0010). Nur GET,
 * kurze Zeitlimits, jede Antwort wird gegen die gemeinsamen Verträge geprüft.
 * Eine wiederverwendete Verbindung (Keep-Alive) für die sekündliche Live-Abfrage.
 */
export class LoggerClient {
  private readonly base: URL;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly agent = new http.Agent({ keepAlive: true, maxSockets: 4, keepAliveMsecs: 5_000 });

  constructor(options: LoggerClientOptions) {
    this.base = new URL(options.url);
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 1_500;
  }

  /** host:port für die Anzeige */
  get endpoint(): string {
    return this.base.host;
  }

  health(): Promise<LoggerHealth> {
    return this.get('/health', loggerHealthSchema);
  }

  live(): Promise<LiveResponse> {
    return this.get('/api/v1/live', liveResponseSchema);
  }

  consumption(period: ConsumptionPeriod, date?: string): Promise<ConsumptionResponse> {
    const q = new URLSearchParams({ period, ...(date ? { date } : {}) });
    return this.get(`/api/v1/consumption?${q}`, consumptionResponseSchema);
  }

  history(range: HistoryRange): Promise<PowerHistoryResponse> {
    return this.get(`/api/v1/history?range=${range}`, powerHistoryResponseSchema);
  }

  databaseStats(): Promise<DatabaseStatsResponse> {
    return this.get('/api/v1/database/stats', databaseStatsResponseSchema);
  }

  close(): void {
    this.agent.destroy();
  }

  private get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err: LoggerClientError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      const req = http.request(
        {
          hostname: this.base.hostname,
          port: this.base.port || 80,
          path,
          method: 'GET',
          agent: this.agent,
          headers: { Accept: 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > MAX_BODY) {
              req.destroy();
              fail(new LoggerClientError('invalid_response', 'Antwort zu groß'));
            } else chunks.push(c);
          });
          res.on('end', () => {
            if (settled) return;
            if (res.statusCode === 401) return fail(new LoggerClientError('unauthorized', 'Token wurde vom Logger abgelehnt'));
            if (res.statusCode !== 200) return fail(new LoggerClientError('invalid_response', `Unerwarteter Status ${res.statusCode}`));
            let body: unknown;
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              return fail(new LoggerClientError('invalid_response', 'Antwort ist kein gültiges JSON'));
            }
            const parsed = schema.safeParse(body);
            if (!parsed.success) return fail(new LoggerClientError('invalid_response', 'Antwort entspricht nicht dem Vertrag'));
            settled = true;
            clearTimeout(timer);
            resolve(parsed.data);
          });
          res.on('error', (err) => fail(new LoggerClientError('unreachable', err.message)));
        },
      );
      const timer = setTimeout(() => {
        req.destroy();
        fail(new LoggerClientError('timeout', `Keine Antwort innerhalb von ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      req.on('error', (err) => fail(new LoggerClientError('unreachable', err.message)));
      req.end();
    });
  }
}
