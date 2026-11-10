import type { FastifyInstance } from 'fastify';
import type { AuditLog } from './audit.ts';
import type { AppConfig } from './config.ts';
import type { Db } from './db/database.ts';
import type { Migration } from './db/migrations.ts';
import type { NotificationStore } from './notifications.ts';
import type { Scheduler } from './scheduler.ts';
import type { SettingsStore } from './settings.ts';
import type { UpdateService } from './updates/updateService.ts';

/** Dienste des Core, die Fachmodule nutzen dürfen. */
export interface CoreContext {
  config: AppConfig;
  db: Db;
  audit: AuditLog;
  /** Hintergrundaufgaben – laufen erst, wenn MIRA vollständig bereit ist */
  scheduler: Scheduler;
  settings: SettingsStore;
  notifications: NotificationStore;
  /** Update-Prüfung – Module melden installierte Versionen ihrer Komponenten (z. B. des Agents auf dem KI-Server) */
  updates: UpdateService;
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
