import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@mira/shared';
import type { Db } from '../db/database.ts';

/** Öffentlicher Health-Check für Docker und Monitoring – gibt keine internen Details preis. */
export function registerHealth(app: FastifyInstance, db: Db, version: string): void {
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    let database: HealthResponse['database'] = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      database = 'error';
    }
    if (database !== 'ok') reply.status(503);
    return { status: database === 'ok' ? 'ok' : 'degraded', version, database };
  });
}
