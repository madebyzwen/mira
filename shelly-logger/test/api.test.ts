import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumptionResponseSchema,
  databaseStatsResponseSchema,
  liveResponseSchema,
  loggerHealthSchema,
  powerHistoryResponseSchema,
} from '@mira/shared';
import type { LoggerConfig } from '../src/config.ts';
import { createShellyLogger, type ShellyLogger } from '../src/logger.ts';
import { FakeShelly } from './fakeShelly.ts';

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-api-'));
  cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function config(url: string, dataDir: string, overrides: Partial<LoggerConfig> = {}): LoggerConfig {
  return {
    shelly: { url },
    pollIntervalMs: 200,
    requestTimeoutMs: 150,
    staleAfterMs: 1000,
    maxPowerW: 3680,
    timeZone: 'Europe/Berlin',
    dataDir,
    dbFile: path.join(dataDir, 'shelly-logger.db'),
    host: '127.0.0.1',
    port: 0,
    backup: { time: '03:45', keep: 7 },
    logLevel: 'silent',
    ...overrides,
  };
}

async function start(cfg: LoggerConfig): Promise<ShellyLogger> {
  const logger = createShellyLogger(cfg, { logger: false, version: '0.1.0-test' });
  await logger.app.ready();
  logger.start();
  let stopped = false;
  const original = logger.stop.bind(logger);
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await original();
    await logger.app.close();
  };
  (logger as { stop: () => Promise<void> }).stop = stop;
  cleanup.push(stop);
  return logger;
}

async function shelly(options: ConstructorParameters<typeof FakeShelly>[0] = {}) {
  const s = new FakeShelly(options);
  await s.listen();
  cleanup.push(() => s.close());
  return s;
}

const get = (logger: ShellyLogger, url: string, token?: string) =>
  logger.app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('Interne Lese-API', () => {
  it('liefert Health, Live-Werte, Verbrauch, Verlauf und Datenbankstatistik im vereinbarten Format', async () => {
    const s = await shelly({ powerW: 110 });
    const logger = await start(config(s.url, tempDir()));
    await sleep(700);

    const health = loggerHealthSchema.parse((await get(logger, '/health')).json());
    expect(health).toMatchObject({ status: 'ok', version: '0.1.0-test', meter: { state: 'online', lastError: null } });
    expect(health.poller.pollsLastMinute).toBeGreaterThanOrEqual(2);

    const live = liveResponseSchema.parse((await get(logger, '/api/v1/live')).json());
    expect(live).toMatchObject({ state: 'online', powerW: 110, pollIntervalMs: 200, device: { component: 'pm1:0', generation: 3 } });
    expect(live.ageMs).toBeLessThan(1000);

    for (const period of ['day', 'week', 'month', 'year']) {
      const res = await get(logger, `/api/v1/consumption?period=${period}`);
      expect(res.statusCode).toBe(200);
      consumptionResponseSchema.parse(res.json());
    }
    expect((await get(logger, '/api/v1/consumption?period=month&date=2026-02-15')).json()).toMatchObject({ complete: true, from: '2026-01-31T23:00:00.000Z' });
    powerHistoryResponseSchema.parse((await get(logger, '/api/v1/history?range=24h')).json());
    databaseStatsResponseSchema.parse((await get(logger, '/api/v1/database/stats')).json());
  });

  it('lehnt ungültige Anfragen und alles außer GET ab', async () => {
    const s = await shelly();
    const logger = await start(config(s.url, tempDir()));
    expect((await get(logger, '/api/v1/consumption?period=decade')).statusCode).toBe(400);
    expect((await get(logger, '/api/v1/consumption?period=day&date=2026-02-30')).statusCode).toBe(400);
    expect((await get(logger, '/api/v1/history?range=1y')).statusCode).toBe(400);
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      expect((await logger.app.inject({ method, url: '/api/v1/live' })).statusCode).toBe(405);
    }
  });

  it('mit Token: alles außer /health nur mit gültigem Bearer-Token', async () => {
    const s = await shelly();
    const logger = await start(config(s.url, tempDir(), { apiToken: 'interner-schluessel-1234567890' }));
    expect((await get(logger, '/health')).statusCode).toBe(200);
    expect((await get(logger, '/api/v1/live')).statusCode).toBe(401);
    expect((await get(logger, '/api/v1/live', 'falsch')).statusCode).toBe(401);
    expect((await get(logger, '/api/v1/live', 'interner-schluessel-1234567890')).statusCode).toBe(200);
  });

  it('Token verlangt, aber nicht nutzbar: API gesperrt (außer /health), die Messung läuft weiter (S-06)', async () => {
    const s = await shelly({ powerW: 50 });
    const logger = await start(config(s.url, tempDir(), { apiTokenError: 'LOGGER_API_TOKEN_FILE: Datei fehlt' }));
    await sleep(500);
    expect((await get(logger, '/health')).statusCode).toBe(200);
    expect((await get(logger, '/health?probe=1')).statusCode).toBe(200);
    for (const url of ['/api/v1/live', '/api/v1/consumption?period=day', '/api/v1/history?range=1h', '/api/v1/database/stats']) {
      expect((await get(logger, url)).statusCode, url).toBe(401);
      expect((await get(logger, url, 'irgendein-token-aaaaaaaaaaaaaaaaaaaaaaaaa')).statusCode, url).toBe(401);
    }
    // gemessen wird trotzdem
    expect(logger.poller.live()).toMatchObject({ state: 'online', powerW: 50 });
  });

  it('Live-Abfragen brauchen keine Datenbank (kommen aus dem Speicher)', async () => {
    const s = await shelly({ powerW: 77 });
    const logger = await start(config(s.url, tempDir()));
    await sleep(500);
    await logger.poller.stop();
    logger.store.close(); // Datenbank weg – Live-Antwort muss trotzdem kommen
    const res = await get(logger, '/api/v1/live');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ powerW: 77 });
  });

  it('läuft bei nicht erreichbarem Shelly weiter und meldet den Zustand, statt Werte zu erfinden', async () => {
    const s = await shelly();
    const logger = await start(config(s.url, tempDir()));
    await sleep(500);
    s.hang = true;
    await sleep(1_600);
    const live = (await get(logger, '/api/v1/live')).json();
    expect(live.state).toBe('offline');
    expect(live.lastError).toBe('timeout');
    expect(live.ageMs).toBeGreaterThan(1000);
    expect((await get(logger, '/health')).json()).toMatchObject({ status: 'ok', meter: { state: 'offline' } });
  });

  it('Neustart: Messdaten bleiben erhalten, Verbrauch wird nicht doppelt gezählt; Sicherung ist eine eigenständige Datei', async () => {
    const s = await shelly({ powerW: 3600 }); // 1 Wh je Sekunde
    const dir = tempDir();
    const a = await start(config(s.url, dir));
    await sleep(1_500);
    await a.stop(); // schreibt das laufende Intervall
    const firstDay = (() => {
      const r = createShellyLogger(config(s.url, dir), { logger: false });
      const v = r.reports.consumption('day');
      r.store.close();
      return v;
    })();
    expect(firstDay.measuredWh).toBeGreaterThan(0.5);

    await sleep(1_500); // Pause länger als die Lückengrenze (staleAfterMs 1 s)
    const b = await start(config(s.url, dir));
    await sleep(1_500);
    await b.stop();
    const c = createShellyLogger(config(s.url, dir), { logger: false });
    cleanup.push(() => c.store.close());
    const day = c.reports.consumption('day');
    const counterProgress = s.counterWh - 12_345.678;
    // Verbucht = tatsächlicher Zählerfortschritt (gemessen + ggf. rekonstruiert): nichts doppelt, nichts verloren.
    // Toleranz: Zeit vor der ersten und nach der letzten Messung (≈ 1 Wh/s bei 3600 W).
    expect(day.energyWh).toBeLessThanOrEqual(counterProgress + 0.01);
    expect(day.energyWh).toBeGreaterThan(counterProgress - 1.0);
    expect(day.energyWh).toBeGreaterThan(firstDay.energyWh);
    const stats = c.reports.refreshDatabaseStats();
    expect(stats.samples).toBeGreaterThanOrEqual(1);
    expect(stats.bytes.total).toBeGreaterThan(0);

    const backup = await c.store.backup(path.join(dir, 'backups'), 7);
    expect(fs.existsSync(backup.file)).toBe(true);
    expect(fs.existsSync(`${backup.file}-wal`)).toBe(false);
  });
});
