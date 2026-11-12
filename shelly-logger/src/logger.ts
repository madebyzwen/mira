import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Aggregator, BUCKET_MS } from './aggregator.ts';
import type { LoggerConfig } from './config.ts';
import { Poller } from './poller.ts';
import { Reports } from './reports.ts';
import { createApp, registerRoutes } from './server.ts';
import { ShellyClient } from './shelly/client.ts';
import { Store } from './store.ts';
import { nextLocalTime } from './time.ts';

export function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

export interface ShellyLogger {
  app: FastifyInstance;
  store: Store;
  poller: Poller;
  aggregator: Aggregator;
  reports: Reports;
  /** Abfrage, Verdichtung und Hintergrundaufgaben starten (API separat über `app.listen`) */
  start(): void;
  /** Geordnet beenden: Abfrage abwarten, laufendes Intervall schreiben, Datenbank schließen */
  stop(): Promise<void>;
}

/**
 * Baut den Logger aus der Konfiguration zusammen. Ein Prozess, ein Abfrage-Takt,
 * ein schreibender Zugriff auf die eigene SQLite-Datenbank.
 */
export function createShellyLogger(config: LoggerConfig, options: { logger?: boolean | { level: string }; version?: string } = {}): ShellyLogger {
  const store = new Store(config.dbFile, config.timeZone);
  const aggregator = new Aggregator({
    store,
    timeZone: config.timeZone,
    pollIntervalMs: config.pollIntervalMs,
    staleAfterMs: config.staleAfterMs,
    maxPowerW: config.maxPowerW,
  });
  const reports = new Reports(store, aggregator, config.timeZone);
  const client = new ShellyClient({ baseUrl: config.shelly.url, password: config.shelly.password, timeoutMs: config.requestTimeoutMs });

  // Ein Logger (Fastify/pino) für API, Abfrage und Hintergrundaufgaben
  const app = createApp({ apiToken: config.apiToken, apiTokenError: config.apiTokenError, logger: options.logger ?? { level: config.logLevel } });
  if (config.apiTokenError) {
    app.log.error({ reason: config.apiTokenError }, 'API-Token nicht nutzbar – die Lese-API ist bis zur Korrektur gesperrt (außer /health), die Messung läuft weiter');
  }
  const poller = new Poller({
    client,
    intervalMs: config.pollIntervalMs,
    staleAfterMs: config.staleAfterMs,
    component: config.shelly.component,
    log: app.log,
    onReading: (r) => aggregator.add(r),
    onDevice: (d) => aggregator.setDevice(d.id),
  });
  registerRoutes(app, { poller, reports, version: options.version ?? readVersion() });

  const timers: NodeJS.Timeout[] = [];
  const guard = (name: string, job: () => unknown) => async () => {
    try {
      await job();
    } catch (err) {
      app.log.error({ err, job: name }, 'Hintergrundaufgabe fehlgeschlagen');
    }
  };

  let stopped = false;
  const scheduleBackup = () => {
    if (stopped) return;
    const delay = nextLocalTime(config.backup.time, Date.now(), config.timeZone) - Date.now();
    const t = setTimeout(async () => {
      await guard('backup', async () => {
        const r = await store.backup(path.join(config.dataDir, 'backups'), config.backup.keep, Date.now(), config.backup.copyDir);
        app.log.info({ file: r.file, bytes: r.bytes, removed: r.removed, copy: r.copy }, 'Datenbank gesichert');
        if (r.copy && 'error' in r.copy) app.log.error({ reason: r.copy.error, dir: config.backup.copyDir }, 'Kopie der Sicherung auf das getrennte Ziel fehlgeschlagen');
      })();
      scheduleBackup();
    }, delay);
    t.unref();
    timers.push(t);
  };

  return {
    app,
    store,
    poller,
    aggregator,
    reports,
    start() {
      poller.start();
      // Intervalle kurz nach jeder :00/:30-Grenze schreiben
      const flush = guard('verdichtung', () => aggregator.flushDue(Date.now()));
      const firstDelay = BUCKET_MS - (Date.now() % BUCKET_MS) + 2_000;
      const t = setTimeout(() => {
        void flush();
        const i = setInterval(() => void flush(), BUCKET_MS);
        timers.push(i);
      }, firstDelay);
      timers.push(t);
      reports.refreshDatabaseStats();
      const s = setInterval(guard('datenbankstatistik', () => reports.refreshDatabaseStats()), 60_000);
      s.unref();
      timers.push(s);
      scheduleBackup();
    },
    async stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      await poller.stop();
      await guard('abschluss', () => aggregator.flushAll())();
      client.close();
      store.close();
    },
  };
}
