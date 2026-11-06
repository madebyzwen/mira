import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { AuditLog } from './core/audit.ts';
import { registerAuth } from './core/auth/authPlugin.ts';
import { SessionStore } from './core/auth/sessions.ts';
import { UserRepository, bootstrapAdmin } from './core/auth/users.ts';
import type { AppConfig } from './core/config.ts';
import { openDatabase, type Db } from './core/db/database.ts';
import { coreMigrations } from './core/db/coreMigrations.ts';
import { runMigrations } from './core/db/migrations.ts';
import { registerErrorHandling } from './core/errors.ts';
import { registerFrontend } from './core/http/frontend.ts';
import { registerHealth } from './core/http/health.ts';
import { registerSecurity } from './core/http/security.ts';
import { backupDatabase } from './core/backup.ts';
import { Scheduler } from './core/scheduler.ts';
import type { CoreContext, MiraModule } from './core/module.ts';
import { createModules } from './modules/index.ts';


export interface BuildOptions {
  modules?: MiraModule[];
  logger?: FastifyServerOptions['logger'];
}

export interface MiraApp {
  app: FastifyInstance;
  db: Db;
}

/**
 * Baut die komplette Anwendung: Datenbank + Migrationen, Core-Dienste,
 * Anmeldung, Fachmodule und Auslieferung der Weboberfläche.
 * Wird von `server.ts` und von den Tests verwendet.
 */
export async function buildApp(config: AppConfig, options: BuildOptions = {}): Promise<MiraApp> {
  const modules = options.modules ?? createModules();

  const db = openDatabase(config.dbFile);
  runMigrations(db, [coreMigrations, ...modules.map((m) => ({ module: m.name, migrations: m.migrations }))]);

  const app = Fastify({
    logger: options.logger ?? {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });

  const audit = new AuditLog(db);
  const users = new UserRepository(db);
  const sessions = new SessionStore(db, config.sessionTtlMs);

  await bootstrapAdmin(users, config.admin, app.log);

  await app.register(fastifyCookie);
  registerErrorHandling(app);
  registerSecurity(app);
  registerHealth(app, db, config.version);
  registerAuth(app, { config, users, sessions, audit });

  const scheduler = new Scheduler(app.log);
  const ctx: CoreContext = { config, db, audit, scheduler };
  for (const module of modules) {
    await module.registerRoutes(app, ctx);
  }

  await registerFrontend(app, config.staticDir);

  // Wartung: abgelaufene Sessions und alte Audit-Einträge entfernen
  scheduler.every(
    'core.wartung',
    60 * 60 * 1000,
    () => {
      const expiredSessions = sessions.pruneExpired();
      const oldAudit = audit.pruneOlderThan(config.auditRetentionDays);
      if (expiredSessions || oldAudit) app.log.info({ expiredSessions, oldAudit }, 'Wartung durchgeführt');
    },
    { runNow: true },
  );

  // Tägliche Sicherung der Datenbank (nicht für In-Memory-Datenbanken in Tests)
  if (config.dbFile !== ':memory:') {
    scheduler.dailyAt('core.sicherung', config.backup.time, async () => {
      const result = await backupDatabase(db, config.dataDir, config.backup.keep);
      app.log.info({ file: result.file, bytes: result.bytes, removed: result.removed }, 'Datenbank gesichert');
    });
  }

  app.addHook('onReady', async () => scheduler.start());
  app.addHook('onClose', async () => {
    scheduler.stop();
    db.close();
  });

  return { app, db };
}
