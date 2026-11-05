import type { FastifyInstance } from 'fastify';
import type { AuditLog } from './audit.ts';
import type { AppConfig } from './config.ts';
import type { Db } from './db/database.ts';
import type { Migration } from './db/migrations.ts';

/** Dienste des Core, die Fachmodule nutzen dürfen. */
export interface CoreContext {
  config: AppConfig;
  db: Db;
  audit: AuditLog;
}

/**
 * Ein Fachmodul (Systeme, LLM, Agents, Dashboard).
 * Module werden statisch in `modules/index.ts` eingetragen – bewusst kein
 * dynamisches Plugin-System. Routen liegen unter `/api/v1/<name>/…` und sind
 * automatisch durch die Anmeldung geschützt.
 */
export interface MiraModule {
  name: string;
  migrations: Migration[];
  registerRoutes(app: FastifyInstance, ctx: CoreContext): void | Promise<void>;
}
