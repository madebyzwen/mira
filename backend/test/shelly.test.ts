import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  apiErrorSchema,
  energyPricesResponseSchema,
  shellyConsumptionResponseSchema,
  shellyStatusResponseSchema,
  shellySummaryResponseSchema,
  systemsListResponseSchema,
  type ConsumptionResponse,
} from '@mira/shared';
import { buildApp } from '../app.ts';
import { openDatabase } from '../core/db/database.ts';
import { runMigrations } from '../core/db/migrations.ts';
import { coreMigrations } from '../core/db/coreMigrations.ts';
import { systemsMigrations } from '../modules/systems/migrations.ts';
import { SystemsModule } from '../modules/systems/index.ts';
import { EnergyPrices } from '../modules/systems/shelly/energyPrices.ts';
import type { LoggerClient } from '../modules/systems/shelly/loggerClient.ts';
import { COMPLETE_PERIOD_TTL_MS, ShellyService } from '../modules/systems/shelly/shellyService.ts';
import { createShellyLogger } from '../../shelly-logger/src/logger.ts';
import type { LoggerConfig } from '../../shelly-logger/src/config.ts';
import { FakeShelly } from '../../shelly-logger/test/fakeShelly.ts';
import { loginCookie, tempDir, testConfig } from './helpers.ts';

const cleanup: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Echter Shelly-Logger (in-process) gegen einen simulierten Shelly */
async function startLogger(powerW = 360, extra: Partial<LoggerConfig> = {}) {
  const shelly = new FakeShelly({ powerW });
  await shelly.listen();
  cleanup.push(() => shelly.close());
  const dir = tempDir();
  const cfg: LoggerConfig = {
    shelly: { url: shelly.url },
    pollIntervalMs: 200,
    requestTimeoutMs: 150,
    staleAfterMs: 1000,
    maxPowerW: 3680,
    timeZone: 'Europe/Berlin',
    dataDir: dir,
    dbFile: path.join(dir, 'shelly-logger.db'),
    host: '127.0.0.1',
    port: 0,
    backup: { time: '03:45', keep: 7 },
    logLevel: 'silent',
    ...extra,
  };
  const logger = createShellyLogger(cfg, { logger: false, version: '0.1.1' });
  await logger.app.listen({ host: '127.0.0.1', port: 0 });
  logger.start();
  cleanup.push(async () => {
    await logger.stop();
    await logger.app.close();
  });
  return { url: `http://127.0.0.1:${(logger.app.server.address() as AddressInfo).port}`, shelly, logger };
}

async function startMira(loggerUrl?: string, tokenFile?: string) {
  const config = testConfig();
  if (loggerUrl) config.shellyLogger = { url: loggerUrl, tokenFile };
  const systems = new SystemsModule();
  const { app, db } = await buildApp(config, { logger: false, modules: [systems] });
  await app.ready();
  cleanup.push(() => app.close());
  const cookie = await loginCookie(app);
  const get = (url: string) => app.inject({ method: 'GET', url, cookies: { mira_session: cookie } });
  const send = (method: 'POST' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as object, cookies: { mira_session: cookie } });
  return { app, db, get, send, systems };
}

describe('Shelly Plug in MIRA (über den Shelly-Logger)', () => {
  it('reicht den Live-Wert des Loggers durch und führt den Shelly in der Systemliste', async () => {
    const logger = await startLogger(87.5);
    await sleep(600);
    const { get, systems } = await startMira(logger.url);
    const status = shellyStatusResponseSchema.parse((await get('/api/v1/systems/shelly-plug')).json());
    expect(status.logger).toMatchObject({ configured: true, reachable: true, version: '0.1.1', lastError: null });
    expect(status.live).toMatchObject({ state: 'online', powerW: 87.5, device: { component: 'pm1:0' } });
    expect(status.system).toMatchObject({ slug: 'shelly-plug', kind: 'power_meter', status: { state: 'online' } });
    await systems.shelly!.status();
    const list = systemsListResponseSchema.parse((await get('/api/v1/systems')).json());
    expect(list.systems.map((s) => s.slug)).toEqual(['ai-server', 'shelly-plug']);
    expect(list.systems[1].status.state).toBe('online');
  });

  it('Verbrauch mit Kosten aus dem Strompreis in MIRA; Zusammenfassung heute/Woche/Monat/Jahr', async () => {
    const logger = await startLogger(3600); // 1 Wh je Sekunde
    await sleep(1_200);
    const { get, send } = await startMira(logger.url);
    const noPrice = shellyConsumptionResponseSchema.parse((await get('/api/v1/systems/shelly-plug/consumption?period=day')).json());
    expect(noPrice.energyWh).toBeGreaterThan(0);
    expect(noPrice).toMatchObject({ costEur: null, costComplete: false });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    const prices = energyPricesResponseSchema.parse((await send('POST', '/api/v1/systems/shelly-plug/prices', { validFrom: '2026-01-01', centsPerKwh: 30 })).json());
    expect(prices.currentPriceCents).toBe(30);
    const day = shellyConsumptionResponseSchema.parse((await get('/api/v1/systems/shelly-plug/consumption?period=day')).json());
    expect(day.costComplete).toBe(true);
    expect(day.costEur).toBeCloseTo((day.energyWh / 1000) * 0.3, 4);

    const summary = shellySummaryResponseSchema.parse((await get('/api/v1/systems/shelly-plug/summary')).json());
    expect(summary.currentPriceCents).toBe(30);
    expect(Object.keys(summary.periods).sort()).toEqual(['day', 'month', 'week', 'year']);
    expect(summary.periods.year.energyWh).toBeGreaterThanOrEqual(summary.periods.day.energyWh);
    expect(summary.periods.year.costEur).toBeCloseTo((summary.periods.year.energyWh / 1000) * 0.3, 4);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect((await get('/api/v1/systems/shelly-plug/history?range=1h')).json().points).toHaveLength(60);
    expect((await get('/api/v1/systems/shelly-plug/database')).json()).toHaveProperty('samples');
  });

  it('Strompreise: Prüfung, gleicher Tag ersetzt, Löschen, Audit-Log, nur angemeldet', async () => {
    const { app, db, send, get } = await startMira();
    expect((await app.inject({ method: 'GET', url: '/api/v1/systems/shelly-plug/prices' })).statusCode).toBe(401);
    expect((await send('POST', '/api/v1/systems/shelly-plug/prices', { validFrom: '2026-13-01', centsPerKwh: 30 })).statusCode).toBe(400);
    expect((await send('POST', '/api/v1/systems/shelly-plug/prices', { validFrom: '2026-01-01', centsPerKwh: -1 })).statusCode).toBe(400);
    await send('POST', '/api/v1/systems/shelly-plug/prices', { validFrom: '2026-01-01', centsPerKwh: 30 });
    await send('POST', '/api/v1/systems/shelly-plug/prices', { validFrom: '2026-01-01', centsPerKwh: 31.5 });
    const list = energyPricesResponseSchema.parse((await get('/api/v1/systems/shelly-plug/prices')).json());
    expect(list.prices).toHaveLength(1);
    expect(list.prices[0]).toMatchObject({ validFrom: '2026-01-01', centsPerKwh: 31.5 });
    expect((await send('DELETE', `/api/v1/systems/shelly-plug/prices/${list.prices[0].id}`)).json().prices).toEqual([]);
    expect((await send('DELETE', '/api/v1/systems/shelly-plug/prices/999')).statusCode).toBe(404);
    expect(db.prepare("SELECT action FROM audit_log WHERE module = 'systems' ORDER BY id").all()).toEqual([
      { action: 'energy_price.set' },
      { action: 'energy_price.set' },
      { action: 'energy_price.delete' },
    ]);
  });

  it('Logger nicht eingerichtet oder nicht erreichbar: klarer Zustand statt alter Werte', async () => {
    const a = await startMira();
    const notConfigured = shellyStatusResponseSchema.parse((await a.get('/api/v1/systems/shelly-plug')).json());
    expect(notConfigured).toMatchObject({ logger: { configured: false, reachable: false, lastError: 'not_configured' }, live: null, system: { status: { state: 'unknown' } } });
    const err = await a.get('/api/v1/systems/shelly-plug/summary');
    expect(err.statusCode).toBe(503);
    expect(apiErrorSchema.parse(err.json()).error).toMatchObject({ code: 'service_unavailable', details: { reason: 'not_configured' } });

    const b = await startMira('http://127.0.0.1:9');
    const down = shellyStatusResponseSchema.parse((await b.get('/api/v1/systems/shelly-plug')).json());
    expect(down).toMatchObject({ logger: { configured: true, reachable: false, lastError: 'unreachable' }, live: null, system: { status: { state: 'offline' } } });
    expect((await b.get('/api/v1/systems/shelly-plug/consumption?period=day')).statusCode).toBe(503);
  });
});

describe('Token zwischen MIRA und Shelly-Logger (S-06)', () => {
  const TOKEN = 'b'.repeat(64);
  const tokenFile = (content?: string) => {
    const f = path.join(tempDir(), 'shelly_logger_token.txt');
    if (content !== undefined) fs.writeFileSync(f, content);
    return f;
  };

  it('gleiches Token auf beiden Seiten: verbunden', async () => {
    const logger = await startLogger(100, { apiToken: TOKEN });
    await sleep(400);
    const { get } = await startMira(logger.url, tokenFile(`${TOKEN}\n`));
    const status = shellyStatusResponseSchema.parse((await get('/api/v1/systems/shelly-plug')).json());
    expect(status.logger).toMatchObject({ reachable: true, lastError: null });
    expect((await get('/api/v1/systems/shelly-plug/summary')).statusCode).toBe(200);
  });

  it('Logger verlangt ein Token, MIRA hat keines: klarer Zustand „Token abgelehnt“', async () => {
    const logger = await startLogger(100, { apiToken: TOKEN });
    const { get } = await startMira(logger.url, tokenFile());
    const status = shellyStatusResponseSchema.parse((await get('/api/v1/systems/shelly-plug')).json());
    expect(status.logger).toMatchObject({ configured: true, reachable: false, lastError: 'unauthorized' });
  });

  it('Umstellung in sicherer Reihenfolge: MIRA sendet das Token schon, bevor der Logger es verlangt', async () => {
    const logger = await startLogger(100);
    await sleep(400);
    const { get } = await startMira(logger.url, tokenFile(TOKEN));
    const status = shellyStatusResponseSchema.parse((await get('/api/v1/systems/shelly-plug')).json());
    expect(status.logger).toMatchObject({ reachable: true, lastError: null });
  });

  it('fehlende Token-Datei in MIRA trennt einen Logger ohne Token nicht', async () => {
    const logger = await startLogger(100);
    await sleep(400);
    const { get } = await startMira(logger.url, tokenFile());
    const status = shellyStatusResponseSchema.parse((await get('/api/v1/systems/shelly-plug')).json());
    expect(status.logger).toMatchObject({ configured: true, reachable: true });
  });
});

describe('Kosten mit Gültigkeitsdatum', () => {
  function prices() {
    const db = openDatabase(':memory:');
    runMigrations(db, [coreMigrations, { module: 'systems', migrations: systemsMigrations }]);
    return new EnergyPrices(db);
  }

  it('je Tag der an diesem Tag gültige Preis; Tage ohne Preis machen die Kosten unvollständig', () => {
    const p = prices();
    p.set('2026-11-01', 30);
    p.set('2026-11-15', 40);
    expect(p.priceOn('2026-10-31')).toBeNull();
    expect(p.priceOn('2026-11-14')).toBe(30);
    expect(p.priceOn('2026-11-15')).toBe(40);
    expect(p.cost([{ day: '2026-11-14', energyWh: 1000 }, { day: '2026-11-15', energyWh: 1000 }])).toEqual({ costEur: 0.7, costComplete: true });
    expect(p.cost([{ day: '2026-10-31', energyWh: 1000 }, { day: '2026-11-01', energyWh: 1000 }])).toEqual({ costEur: 0.3, costComplete: false });
    expect(p.cost([{ day: '2026-10-31', energyWh: 0 }])).toEqual({ costEur: null, costComplete: true });
  });

  it('Jahr: Preiswechsel mitten im Monat wird tagesgenau berücksichtigt', async () => {
    const p = prices();
    p.set('2026-11-01', 30);
    p.set('2026-11-15', 40);
    const dayItem = (label: string, wh: number) => ({ label, from: '', to: '', energyWh: wh, measuredWh: wh, reconstructedWh: 0, coverage: 1 });
    const year: ConsumptionResponse = {
      period: 'year', timezone: 'Europe/Berlin', from: '2025-12-31T23:00:00.000Z', to: '2026-12-31T23:00:00.000Z', complete: false,
      energyWh: 3000, measuredWh: 3000, reconstructedWh: 0, coverage: 0.1,
      breakdown: Array.from({ length: 12 }, (_, m) => dayItem(`2026-${String(m + 1).padStart(2, '0')}`, m === 10 ? 3000 : 0)),
    };
    const november: ConsumptionResponse = { ...year, period: 'month', breakdown: [dayItem('2026-11-10', 1000), dayItem('2026-11-20', 2000)] };
    const calls: string[] = [];
    const stub = {
      consumption: async (period: string, date?: string) => {
        calls.push(`${period}:${date ?? ''}`);
        return period === 'year' ? year : november;
      },
      close: () => undefined,
    } as unknown as LoggerClient;
    const service = new ShellyService({ client: stub, prices: p, system: { slug: 'shelly-plug', name: 'Shelly Plug', description: '' }, log: Fastify({ logger: false }).log });
    const r = await service.consumption('year');
    // 1 kWh zu 30 ct + 2 kWh zu 40 ct
    expect(r.costEur).toBeCloseTo(1.1, 6);
    expect(r.breakdown[10]).toMatchObject({ label: '2026-11', costComplete: true });
    expect(r.breakdown[10].costEur).toBeCloseTo(1.1, 6);
    expect(r.breakdown[0]).toMatchObject({ costEur: null, costComplete: true });
    expect(calls).toEqual(['year:', 'month:2026-11-01']); // nur Monate mit Verbrauch
  });

  it('abgeschlossene Zeiträume: nachträglich rekonstruierte Energie erscheint mit aktualisierten Kosten (F-01)', async () => {
    const p = prices();
    p.set('2026-01-01', 30);
    const clock = { now: Date.parse('2026-11-12T10:00:00Z') };
    const dayItem = (label: string, wh: number) => ({ label, from: '', to: '', energyWh: wh, measuredWh: wh, reconstructedWh: 0, coverage: 1 });
    // abgeschlossener Tag 10.11.: zuerst 1 kWh, nach der Rekonstruktion eines Ausfalls über Mitternacht 1,5 kWh
    let reconstructed = 0;
    const day = (): ConsumptionResponse => ({
      period: 'day', timezone: 'Europe/Berlin', from: '2026-11-09T23:00:00.000Z', to: '2026-11-10T23:00:00.000Z', complete: true,
      energyWh: 1000 + reconstructed, measuredWh: 1000, reconstructedWh: reconstructed, coverage: 0.9, breakdown: [],
    });
    const october = (): ConsumptionResponse => ({
      period: 'month', timezone: 'Europe/Berlin', from: '2026-09-30T22:00:00.000Z', to: '2026-10-31T23:00:00.000Z', complete: true,
      energyWh: 2000 + reconstructed, measuredWh: 2000, reconstructedWh: reconstructed, coverage: 1, breakdown: [dayItem('2026-10-31', 2000 + reconstructed)],
    });
    const year = (): ConsumptionResponse => ({
      period: 'year', timezone: 'Europe/Berlin', from: '2025-12-31T23:00:00.000Z', to: '2026-12-31T23:00:00.000Z', complete: false,
      energyWh: 2000 + reconstructed, measuredWh: 2000, reconstructedWh: reconstructed, coverage: 0.1,
      breakdown: Array.from({ length: 12 }, (_, m) => dayItem(`2026-${String(m + 1).padStart(2, '0')}`, m === 9 ? 2000 + reconstructed : 0)),
    });
    let calls = 0;
    const stub = {
      consumption: async (period: string) => {
        calls += 1;
        return period === 'day' ? day() : period === 'month' ? october() : year();
      },
      close: () => undefined,
    } as unknown as LoggerClient;
    const service = new ShellyService({ client: stub, prices: p, system: { slug: 'shelly-plug', name: 'Shelly Plug', description: '' }, log: Fastify({ logger: false }).log, now: () => clock.now });

    const first = await service.consumption('day', '2026-11-10');
    expect(first).toMatchObject({ energyWh: 1000, costEur: 0.3 });
    const firstYear = await service.consumption('year');
    expect(firstYear.breakdown[9].costEur).toBeCloseTo(0.6, 6);

    // Der Logger rekonstruiert nachträglich 500 Wh
    reconstructed = 500;
    clock.now += 10_000;
    expect((await service.consumption('day', '2026-11-10')).energyWh).toBe(1000); // kurz zwischengespeichert
    clock.now += COMPLETE_PERIOD_TTL_MS;
    const updated = await service.consumption('day', '2026-11-10');
    expect(updated).toMatchObject({ energyWh: 1500, reconstructedWh: 500, costEur: 0.45 });
    // Jahreskosten: Monatssumme des abgeschlossenen Oktobers ebenfalls neu gelesen
    const updatedYear = await service.consumption('year');
    expect(updatedYear.breakdown[9].costEur).toBeCloseTo(0.75, 6);
    expect(updatedYear.costEur).toBeCloseTo(0.75, 6);
    // Tag, Jahr + Oktober, Tag (neu), Jahr + Oktober (neu)
    expect(calls).toBe(6);
  });
});
