import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { loadConfig } from '../src/config.ts';
import { Poller } from '../src/poller.ts';
import { ShellyClient, ShellyError, statusPath, type MeterReading } from '../src/shelly/client.ts';
import { FakeShelly } from './fakeShelly.ts';

const log = Fastify({ logger: false }).log;
const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fake(options: ConstructorParameters<typeof FakeShelly>[0] = {}) {
  const shelly = new FakeShelly(options);
  await shelly.listen();
  cleanup.push(() => shelly.close());
  return shelly;
}

function client(shelly: FakeShelly, options: { password?: string; timeoutMs?: number } = {}) {
  const c = new ShellyClient({ baseUrl: shelly.url, password: options.password, timeoutMs: options.timeoutMs ?? 800 });
  cleanup.push(() => c.close());
  return c;
}

describe('Shelly-Client (lokal, nur lesend)', () => {
  it('erkennt Gen3 Plug PM mit PM1-Komponente und liest Leistung, Spannung, Strom, Zähler', async () => {
    const shelly = await fake({ powerW: 87.5 });
    const c = client(shelly);
    const device = await c.identify();
    expect(device).toMatchObject({ model: 'S3PM-001PCEU16', generation: 3, component: 'pm1:0' });
    const r = await c.read(device.component);
    expect(r).toMatchObject({ powerW: 87.5, voltageV: 230.4 });
    expect(r.currentA).toBeCloseTo(87.5 / 230.4, 2);
    expect(r.energyTotalWh).toBeGreaterThan(12_345);
    expect(statusPath('pm1:0')).toBe('/rpc/PM1.GetStatus?id=0');
  });

  it('unterstützt auch Geräte mit Relais (Switch-Komponente), ohne zu schalten', async () => {
    const shelly = await fake({ component: 'switch' });
    const c = client(shelly);
    const device = await c.identify();
    expect(device.component).toBe('switch:0');
    expect((await c.read(device.component)).powerW).toBe(120);
    expect(statusPath('switch:0')).toBe('/rpc/Switch.GetStatus?id=0');
  });

  it('lehnt Geräte der Generation 1 ab', async () => {
    const shelly = await fake({ gen1: true });
    await expect(client(shelly).identify()).rejects.toMatchObject({ code: 'unsupported_device' });
  });

  it('meldet sich per Digest (SHA-256) an; falsches oder fehlendes Passwort wird erkannt', async () => {
    const shelly = await fake({ password: 'geheim' });
    expect((await client(shelly, { password: 'geheim' }).identify()).component).toBe('pm1:0');
    await expect(client(shelly, { password: 'falsch' }).detectComponent()).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(client(shelly).detectComponent()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('nutzt eine einzige Verbindung für viele Abfragen (Keep-Alive)', async () => {
    const shelly = await fake();
    const c = client(shelly);
    for (let i = 0; i < 10; i++) await c.read('pm1:0');
    expect(shelly.connections).toBe(1);
  });

  it('bricht hängende Antworten nach dem Zeitlimit ab', async () => {
    const shelly = await fake();
    shelly.hang = true;
    const started = Date.now();
    const err = await client(shelly, { timeoutMs: 150 }).read('pm1:0').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShellyError);
    expect((err as ShellyError).code).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('meldet Fehlerantworten und nicht erreichbare Geräte', async () => {
    const shelly = await fake();
    shelly.failStatus = 500;
    await expect(client(shelly).read('pm1:0')).rejects.toMatchObject({ code: 'invalid_response' });
    const offline = new ShellyClient({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 500 });
    await expect(offline.read('pm1:0')).rejects.toMatchObject({ code: 'unreachable' });
    offline.close();
  });
});

describe('Abfrage-Takt', () => {
  function poller(shelly: FakeShelly, options: { intervalMs: number; timeoutMs?: number; staleAfterMs?: number }) {
    const readings: MeterReading[] = [];
    const p = new Poller({
      client: client(shelly, { timeoutMs: options.timeoutMs ?? 800 }),
      intervalMs: options.intervalMs,
      staleAfterMs: options.staleAfterMs ?? 5000,
      log,
      onReading: (r) => readings.push(r),
    });
    cleanup.push(() => p.stop());
    return { p, readings };
  }

  it('fragt im Standard alle 1000 ms ab', async () => {
    expect(loadConfig({ LOGGER_SHELLY_URL: 'http://192.0.2.20' }).pollIntervalMs).toBe(1000);
    const shelly = await fake();
    const { p, readings } = poller(shelly, { intervalMs: 1000 });
    p.start();
    await sleep(3_300);
    await p.stop();
    expect(readings.length).toBeGreaterThanOrEqual(3);
    expect(readings.length).toBeLessThanOrEqual(5);
    const gaps = readings.slice(1).map((r, i) => r.ts - readings[i].ts);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(950);
  });

  it('lässt sich ohne Codeänderung auf 2000 ms umstellen', async () => {
    expect(loadConfig({ LOGGER_SHELLY_URL: 'http://192.0.2.20', LOGGER_POLL_INTERVAL_MS: '2000' }).pollIntervalMs).toBe(2000);
    const shelly = await fake();
    const { p, readings } = poller(shelly, { intervalMs: 2000 });
    p.start();
    await sleep(4_300);
    await p.stop();
    expect(readings.length).toBeGreaterThanOrEqual(2);
    expect(readings.length).toBeLessThanOrEqual(3);
    expect(readings[1].ts - readings[0].ts).toBeGreaterThanOrEqual(1950);
  });

  it('fragt nie parallel ab – auch wenn der Shelly langsamer antwortet als das Intervall', async () => {
    const shelly = await fake();
    shelly.delayMs = 250;
    const { p, readings } = poller(shelly, { intervalMs: 100 });
    p.start();
    await sleep(1_500);
    await p.stop();
    expect(shelly.maxConcurrent).toBe(1);
    expect(p.maxConcurrent).toBe(1);
    expect(readings.length).toBeGreaterThanOrEqual(3);
  });

  it('hängender Shelly: Abfrage wird abgebrochen, Zustand „offline“, danach Erholung ohne Zusatzversuche', async () => {
    const shelly = await fake();
    const { p } = poller(shelly, { intervalMs: 200, timeoutMs: 150, staleAfterMs: 400 });
    p.start();
    await sleep(500);
    expect(p.state()).toBe('online');
    shelly.hang = true;
    const before = shelly.requests;
    await sleep(1_200);
    expect(p.state()).toBe('offline');
    expect(p.live().lastError).toBe('timeout');
    // höchstens eine Abfrage je Intervall (kein Wiederholungssturm)
    expect(shelly.requests - before).toBeLessThanOrEqual(Math.ceil(1_200 / 200) + 1);
    shelly.hang = false;
    await sleep(600);
    expect(p.state()).toBe('online');
    expect(p.live().lastError).toBeNull();
  });

  it('alte Werte werden nie als aktuelle Live-Messung ausgegeben', async () => {
    const shelly = await fake({ powerW: 95 });
    const { p } = poller(shelly, { intervalMs: 200, staleAfterMs: 1000 });
    await p.tick();
    const live = p.live();
    expect(live).toMatchObject({ state: 'online', powerW: 95 });
    const measuredAt = Date.parse(live.measuredAt!);
    const later = p.live(measuredAt + 1_001);
    expect(later.state).toBe('stale');
    expect(later.ageMs).toBe(1_001);
    expect(later.measuredAt).toBe(live.measuredAt);
  });

  it('KI-Server im Ruhezustand: geringe Leistung ist eine gültige Messung, kein Fehler', async () => {
    const shelly = await fake({ powerW: 1.8 });
    const { p, readings } = poller(shelly, { intervalMs: 200 });
    await p.tick();
    expect(p.state()).toBe('online');
    expect(readings[0].powerW).toBe(1.8);
    shelly.setPower(0);
    await p.tick();
    expect(p.live()).toMatchObject({ state: 'online', powerW: 0, lastError: null });
  });

  it('protokolliert und zählt Abfragen der letzten Minute', async () => {
    const shelly = await fake();
    const { p } = poller(shelly, { intervalMs: 100 });
    for (let i = 0; i < 5; i++) await p.tick();
    shelly.failStatus = 500;
    await p.tick();
    const s = p.stats();
    expect(s).toMatchObject({ intervalMs: 100, pollsLastMinute: 6, failuresLastMinute: 1 });
    expect(s.responseMs.p50).not.toBeNull();
  });
});
