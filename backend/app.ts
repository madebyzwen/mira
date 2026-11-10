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
import { NotificationStore } from './core/notifications.ts';
import { SettingsStore } from './core/settings.ts';
import { createGithubFetcher, type ReleaseFetcher } from './core/updates/github.ts';
import { registerNotificationRoutes } from './core/updates/routes.ts';
import { UpdateService } from './core/updates/updateService.ts';
import type { CoreContext, MiraModule } from './core/module.ts';
import { createModules } from './modules/index.ts';

export interface BuildOptions {
  modules?: MiraModule[];
  logger?: FastifyServerOptions['logger'];
  /** Für Tests: Abfrage bei GitHub ersetzen */
  fetchRelease?: ReleaseFetcher;
  /** Für Tests: Uhr der Update-Prüfung ersetzen */
  now?: () => Date;
  /** Für Tests: Sperrfrist der Prüfung von Hand */
  manualCheckIntervalMs?: number;
}

export interface MiraApp {
  app: FastifyInstance;
  db: Db;
  updates: UpdateService;
  notifications: NotificationStore;
}

/** Gelesene bzw. ausgeblendete Benachrichtigungen werden nach dieser Frist gelöscht. */
const NOTIFICATION_RETENTION_DAYS = 90;

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
  const settings = new SettingsStore(db);
  const notifications = new NotificationStore(db, options.now);
  const updates = new UpdateService({
    settings,
    notifications,
    log: app.log,
    enabled: config.updateCheck.enabled,
    scheduleTime: config.updateCheck.time,
    miraVersion: config.version,
    fetchRelease: options.fetchRelease ?? createGithubFetcher(config.version),
    manualCheckIntervalMs: options.manualCheckIntervalMs,
    now: options.now,
  });
  // Nach einem Update von MIRA erledigte Meldung sofort entfernen – ohne Abfrage bei GitHub
  updates.reconcile();
  registerNotificationRoutes(app, { notifications, updates, audit });

  const ctx: CoreContext = { config, db, audit, scheduler, settings, notifications, updates };
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
      const oldNotifications = notifications.pruneOlderThan(NOTIFICATION_RETENTION_DAYS);
      if (expiredSessions || oldAudit || oldNotifications) app.log.info({ expiredSessions, oldAudit, oldNotifications }, 'Wartung durchgeführt');
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

  // Tägliche Update-Prüfung (MIRA und MIRA-Agent in einer Abfrage)
  if (config.updateCheck.enabled) {
    scheduler.dailyAt('core.update_pruefung', config.updateCheck.time, () => updates.checkScheduled());
  }

  app.addHook('onReady', async () => scheduler.start());
  app.addHook('onClose', async () => {
    scheduler.stop();
    db.close();
  });

  return { app, db, updates, notifications };
}
