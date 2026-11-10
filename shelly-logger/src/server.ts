import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  LOGGER_API_VERSION,
  consumptionQuerySchema,
  powerHistoryQuerySchema,
  type ConsumptionResponse,
  type DatabaseStatsResponse,
  type LiveResponse,
  type LoggerHealth,
  type PowerHistoryResponse,
} from '@mira/shared';
import type { Poller } from './poller.ts';
import type { Reports } from './reports.ts';
import { isValidDayKey } from './time.ts';

export interface AppOptions {
  /** gesetzt = Bearer-Token für alle Endpunkte außer /health */
  apiToken?: string;
  logger?: boolean | { level: string };
}

export interface RouteOptions {
  poller: Poller;
  reports: Reports;
  version: string;
  startedAt?: number;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** CPU-Anteil des Prozesses seit der letzten Abfrage */
function cpuSampler() {
  let last = { usage: process.cpuUsage(), at: process.hrtime.bigint() };
  return (): number | null => {
    const usage = process.cpuUsage();
    const at = process.hrtime.bigint();
    const elapsedUs = Number(at - last.at) / 1000;
    const usedUs = usage.user - last.usage.user + usage.system - last.usage.system;
    last = { usage, at };
    return elapsedUs > 0 ? Number(((usedUs / elapsedUs) * 100).toFixed(2)) : null;
  };
}

/** Fastify-Instanz mit Zugriffsschutz (nur GET, optional Token) und Fehlerbehandlung. */
export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const expected = options.apiToken ? digest(options.apiToken) : null;

  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return reply.code(405).send({ error: 'method_not_allowed' });
    if (!expected || request.url === '/health') return;
    const m = request.headers.authorization?.match(/^Bearer\s+(\S+)$/);
    if (!m || !timingSafeEqual(digest(m[1]), expected)) return reply.code(401).send({ error: 'unauthorized' });
  });

  app.setErrorHandler((err, _request, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error({ err }, 'Fehler in der API');
    void reply.code(status).send({ error: status === 400 ? 'invalid_request' : 'internal_error', message: status === 400 && err instanceof Error ? err.message : undefined });
  });
  return app;
}

/**
 * Interne, ausschließlich lesende HTTP-API. Live-Werte kommen aus dem Speicher,
 * Auswertungen aus Zwischenspeichern – keine Anfrage löst eine Abfrage am Shelly aus.
 * Es gibt keine Schalt-, Lösch- oder Verwaltungsfunktionen.
 */
export function registerRoutes(app: FastifyInstance, options: RouteOptions): void {
  const { poller, reports } = options;
  const startedAt = options.startedAt ?? Date.now();
  const cpu = cpuSampler();
  // Keine Protokollzeile je Anfrage (MIRA fragt sekündlich ab) – nur Warnungen und Fehler
  const quiet = { logLevel: 'warn' } as const;

  app.get('/health', quiet, async (): Promise<LoggerHealth> => {
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      apiVersion: LOGGER_API_VERSION,
      version: options.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      meter: { state: poller.state(), lastError: poller.lastErrorCode },
      poller: poller.stats(),
      process: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, cpuPercent: cpu() },
    };
  });

  app.get('/api/v1/live', quiet, async (): Promise<LiveResponse> => poller.live());

  app.get('/api/v1/consumption', quiet, async (request, reply): Promise<ConsumptionResponse | undefined> => {
    const parsed = consumptionQuerySchema.safeParse(request.query);
    if (!parsed.success || (parsed.data.date && !isValidDayKey(parsed.data.date))) {
      void reply.code(400).send({ error: 'invalid_request', message: 'period=day|week|month|year, optional date=JJJJ-MM-TT' });
      return;
    }
    return reports.consumption(parsed.data.period, parsed.data.date);
  });

  app.get('/api/v1/history', quiet, async (request, reply): Promise<PowerHistoryResponse | undefined> => {
    const parsed = powerHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      void reply.code(400).send({ error: 'invalid_request', message: 'range=1h|24h|7d|30d' });
      return;
    }
    return reports.history(parsed.data.range);
  });

  app.get('/api/v1/database/stats', quiet, async (): Promise<DatabaseStatsResponse> => reports.databaseStats());
}

/** Server mit Routen in einem Schritt (z. B. für Tests). */
export function buildServer(options: AppOptions & RouteOptions): FastifyInstance {
  const app = createApp(options);
  registerRoutes(app, options);
  return app;
}
