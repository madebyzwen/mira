import { createHash, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'node:net';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ODIN_API_VERSION, type OdinHealth, type SystemInfo, type SystemMetrics } from '@mira/shared';
import type { OdinApiConfig } from './config.ts';
import type { Host } from './host.ts';

export interface ServerOptions {
  config: OdinApiConfig;
  tls: { key: Buffer | string; cert: Buffer | string };
  /** SHA-256 des Tokens als Hex */
  tokenHash: string;
  host: Host;
  /** Paketversion – wird in `/v1/health` gemeldet, damit MIRA auf Updates hinweisen kann */
  version?: string;
  logger?: FastifyServerOptions['logger'];
}

/** `::ffff:10.0.0.1` → `10.0.0.1` */
export function normalizeAddress(address: string | undefined): string {
  if (!address) return '';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function tokenMatches(header: string | undefined, expectedHex: string): boolean {
  const match = header?.match(/^Bearer\s+(\S+)$/);
  if (!match) return false;
  const actual = createHash('sha256').update(match[1]).digest();
  const expected = Buffer.from(expectedHex.trim(), 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

/**
 * HTTPS-Server der Odin-API.
 * Schutzebenen: (1) nur erlaubte Client-IPs dürfen überhaupt verbinden,
 * (2) TLS, (3) Bearer-Token auf jeder Anfrage, (4) ausschließlich lesende Endpunkte.
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  const { config, tls, tokenHash, host } = options;
  const allowed = new Set(config.allowedClients.map(normalizeAddress));

  const app = Fastify({
    https: { key: tls.key, cert: tls.cert, minVersion: 'TLSv1.2' },
    logger: options.logger ?? { level: 'info' },
    bodyLimit: 1024,
  });

  // Routinemäßige Abfragen (alle paar Sekunden) nicht protokollieren – nur Warnungen und Fehler
  const quiet = { logLevel: 'warn' } as const;

  // (1) Verbindungen von nicht erlaubten Adressen noch vor dem TLS-Handshake trennen
  app.server.on('connection', (socket: Socket) => {
    const ip = normalizeAddress(socket.remoteAddress);
    if (!allowed.has(ip)) {
      app.log.warn({ ip }, 'Verbindung von nicht erlaubter Adresse abgelehnt');
      socket.destroy();
    }
  });

  // (3) Token-Prüfung für alle Anfragen
  app.addHook('onRequest', async (request, reply) => {
    if (!tokenMatches(request.headers.authorization, tokenHash)) {
      request.log.warn({ ip: normalizeAddress(request.ip), url: request.url }, 'Anfrage ohne gültiges Token');
      return reply.status(401).send(errorBody('unauthorized', 'Ungültiges oder fehlendes Token.'));
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send(errorBody('not_found', 'Nicht gefunden.')));
  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err }, 'Fehler beim Lesen der Systemdaten');
    return reply.status(500).send(errorBody('internal_error', 'Systemdaten konnten nicht gelesen werden.'));
  });

  app.get('/v1/health', quiet, async (): Promise<OdinHealth> => {
    const info = await host.info();
    const health: OdinHealth = { status: 'ok', apiVersion: ODIN_API_VERSION, hostname: info.hostname };
    if (options.version) health.version = options.version;
    return health;
  });
  app.get('/v1/system/info', quiet, async (): Promise<SystemInfo> => host.info());
  app.get('/v1/system/metrics', quiet, async (): Promise<SystemMetrics> => host.metrics());

  return app;
}
