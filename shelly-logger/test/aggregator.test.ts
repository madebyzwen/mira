import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Aggregator, BUCKET_MS } from '../src/aggregator.ts';
import type { MeterReading } from '../src/shelly/client.ts';
import { Store } from '../src/store.ts';

const TZ = 'Europe/Berlin';
const t = (iso: string) => Date.parse(iso);
const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(options: { pollIntervalMs?: number; staleAfterMs?: number; file?: string } = {}) {
  const store = new Store(options.file ?? ':memory:', TZ);
  stores.push(store);
  const agg = new Aggregator({ store, timeZone: TZ, pollIntervalMs: options.pollIntervalMs ?? 1000, staleAfterMs: options.staleAfterMs ?? 5000, maxPowerW: 3680 });
  return { store, agg };
}

const reading = (ts: number, powerW: number, energyTotalWh: number | null, voltageV: number | null = 230): MeterReading => ({ ts, powerW, voltageV, currentA: powerW / 230, energyTotalWh });

/** Sekündliche Messungen mit konstanter Leistung; der Zähler läuft mit. */
function constant(agg: Aggregator, from: number, seconds: number, powerW: number, startWh: number): number {
  let wh = startWh;
  for (let i = 0; i < seconds; i++) {
    agg.add(reading(from + i * 1000, powerW, wh));
    wh += powerW / 3600;
  }
  return wh;
}

describe('30-Sekunden-Verdichtung', () => {
  it('schreibt je 30 s Mittel, Minimum, Maximum, Anzahl, Spannung und Energie aus dem Zähler', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    constant(agg, start, 30, 100, 1000);
    agg.add(reading(start + 30_000, 100, 1000 + (30 * 100) / 3600)); // erste Messung des nächsten Intervalls
    expect(agg.flushDue(start + 32_000)).toBe(1);

    const s = store.sample(start)!;
    expect(s).toMatchObject({ start, end: start + BUCKET_MS, sampleCount: 30, minW: 100, maxW: 100, avgVoltage: 230, quality: 'ok' });
    expect(s.avgW).toBeCloseTo(100, 6);
    expect(s.coveredMs).toBe(30_000);
    // 29 Zählerschritte innerhalb des ersten Intervalls (ohne vorherigen Stand)
    expect(s.energyWh).toBeCloseTo((29 * 100) / 3600, 6);
  });

  it('mittelt zeitgewichtet bei unregelmäßigen Abständen', () => {
    const { store, agg } = setup({ pollIntervalMs: 10_000, staleAfterMs: 30_000 });
    const start = t('2026-11-10T10:00:00Z');
    agg.add(reading(start, 100, 10));
    agg.add(reading(start + 5_000, 400, 10.14)); // nur 5 s lang
    agg.add(reading(start + 10_000, 100, 10.69)); // 20 s lang
    agg.flushDue(start + 40_000);
    const s = store.sample(start)!;
    // (100·5 + 400·5 + 100·20) / 30
    expect(s.avgW).toBeCloseTo((100 * 5 + 400 * 5 + 100 * 20) / 30, 6);
    expect(s.minW).toBe(100);
    expect(s.maxW).toBe(400);
    expect(s.energyWh).toBeCloseTo(0.69, 6);
  });

  it('die aktuelle Leistung wird nicht als Energie verbucht – Energie kommt nur aus dem Zähler', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    // hohe Leistung, aber der Zähler steht (z. B. Zähler eingefroren): Energie 0, nicht Leistung × Zeit
    for (let i = 0; i < 30; i++) agg.add(reading(start + i * 1000, 2000, 500));
    agg.flushDue(start + 40_000);
    expect(store.sample(start)!.energyWh).toBe(0);
  });

  it('fehlende Messwerte werden nie als 0 W oder 0 Wh gespeichert', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    constant(agg, start, 8, 100, 1000); // nur die ersten 8 s
    agg.flushDue(start + 60_000);
    const s = store.sample(start)!;
    expect(s.quality).toBe('partial');
    expect(s.minW).toBe(100);
    expect(s.avgW).toBeCloseTo(100, 6);
    expect(s.coveredMs).toBeLessThan(30_000 * 0.9);
    // Intervall ganz ohne Messung: keine Zeile
    expect(store.sample(start + BUCKET_MS)).toBeNull();
    // ohne Zählerstand: Energie unbekannt, nicht 0
    const later = start + 10 * BUCKET_MS;
    agg.add(reading(later, 50, null));
    agg.flushDue(later + 40_000);
    expect(store.sample(later)!.energyWh).toBeNull();
  });

  it('gemessene 0 W (KI-Server aus) sind ein Messwert, keine Lücke', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    constant(agg, start, 30, 0, 1000);
    agg.flushDue(start + 40_000);
    expect(store.sample(start)).toMatchObject({ avgW: 0, minW: 0, maxW: 0, energyWh: 0, quality: 'ok', sampleCount: 30 });
  });

  it('erkennt Zähler-Rücksetzungen und zählt ab dem neuen Stand weiter', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    agg.add(reading(start, 100, 500));
    agg.add(reading(start + 1000, 100, 500.03));
    agg.add(reading(start + 2000, 100, 0.02)); // Reset
    agg.add(reading(start + 3000, 100, 0.05));
    agg.flushDue(start + 40_000);
    const s = store.sample(start)!;
    expect(s.quality).toBe('counter_reset');
    expect(s.energyWh).toBeCloseTo(0.03 + 0.02 + 0.03, 6);
  });

  it('verwirft unplausible Zählersprünge', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    agg.add(reading(start, 100, 500));
    agg.add(reading(start + 1000, 100, 1500)); // 1 kWh in einer Sekunde
    agg.add(reading(start + 2000, 100, 1500.03));
    agg.flushDue(start + 40_000);
    const s = store.sample(start)!;
    expect(s.quality).toBe('implausible');
    expect(s.energyWh).toBeCloseTo(0.03, 6);
  });

  it('Ausfall: Energie aus der Zählerdifferenz wird als rekonstruiert verbucht und über Mitternacht aufgeteilt', () => {
    const { store, agg } = setup();
    const before = t('2026-11-09T22:49:30Z'); // 23:49:30 Ortszeit
    const end = constant(agg, before, 30, 100, 1000);
    agg.flushDue(before + 40_000);
    // Ausfall von 23:50 bis 00:20 Ortszeit (30 min), Zähler läuft im Shelly weiter: +50 Wh
    const after = t('2026-11-09T23:20:00Z');
    const lastTs = before + 29_000;
    agg.add(reading(after, 100, end - 100 / 3600 + 50));
    agg.add(reading(after + 1000, 100, end - 100 / 3600 + 50 + 100 / 3600));
    agg.flushDue(after + 40_000);

    const days = store.dailyEnergy('2026-11-09', '2026-11-11');
    const total = 50;
    const share09 = (t('2026-11-09T23:00:00Z') - lastTs) / (after - lastTs);
    expect(days[0].day).toBe('2026-11-09');
    expect(days[0].reconstructedWh).toBeCloseTo(total * share09, 6);
    expect(days[1].day).toBe('2026-11-10');
    expect(days[1].reconstructedWh).toBeCloseTo(total * (1 - share09), 6);
    // gemessen bleibt gemessen
    expect(days[1].measuredWh).toBeCloseTo(100 / 3600, 6);
    expect(store.counts().gaps).toBe(2);
  });

  it('Neustart mitten im Intervall: Teile werden zusammengeführt, nichts doppelt gezählt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-'));
    const file = path.join(dir, 'db.sqlite');
    const start = t('2026-11-10T10:00:00Z');

    const a = setup({ file });
    let wh = constant(a.agg, start, 15, 100, 1000);
    a.agg.flushAll(); // Beenden: Teilintervall schreiben
    a.store.close();

    const b = setup({ file });
    wh = constant(b.agg, start + 15_000, 15, 100, wh);
    b.agg.add(reading(start + 30_000, 100, wh));
    b.agg.flushDue(start + 40_000);

    const s = b.store.sample(start)!;
    expect(s.sampleCount).toBe(30);
    expect(s.avgW).toBeCloseTo(100, 6);
    // genau der Zählerfortschritt von der ersten bis zur letzten Messung im Intervall
    expect(s.energyWh).toBeCloseTo((29 * 100) / 3600, 6);
    expect(b.store.dailyEnergy('2026-11-10', '2026-11-11')[0].measuredWh).toBeCloseTo((29 * 100) / 3600, 6);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Neustart nach längerer Pause: Pause wird rekonstruiert, nicht doppelt gezählt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-'));
    const file = path.join(dir, 'db.sqlite');
    const start = t('2026-11-10T10:00:00Z');
    const a = setup({ file });
    const wh = constant(a.agg, start, 30, 100, 1000);
    a.agg.flushAll();
    a.store.close();

    // 10 Minuten später, Zähler +20 Wh
    const b = setup({ file });
    const later = start + 10 * 60_000;
    b.agg.add(reading(later, 100, wh - 100 / 3600 + 20));
    b.agg.flushDue(later + 40_000);
    const day = b.store.dailyEnergy('2026-11-10', '2026-11-11')[0];
    expect(day.reconstructedWh).toBeCloseTo(20, 6);
    expect(day.measuredWh).toBeCloseTo((29 * 100) / 3600, 6);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Lücke innerhalb eines einzigen 30-s-Intervalls wird als rekonstruiert verbucht (F-02)', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T10:00:00Z');
    // 10:00:00–10:00:04 gemessen, Ausfall bis 10:00:20, dann bis 10:00:29 gemessen – alles im selben Intervall
    let wh = constant(agg, start, 5, 360, 100); // 0,1 Wh je Sekunde
    const lastBefore = wh - 0.1;
    wh = lastBefore + 1.6; // im Ausfall läuft der Zähler im Shelly weiter (16 s × 0,1 Wh)
    wh = constant(agg, start + 20_000, 10, 360, wh);
    agg.flushDue(start + 40_000);

    const s = store.sample(start)!;
    expect(s.energyWh).toBeCloseTo((4 + 9) * 0.1, 6); // nur die sekündlichen Schritte
    expect(s.quality).toBe('partial');
    const day = store.dailyEnergy('2026-11-10', '2026-11-11')[0];
    expect(day.reconstructedWh).toBeCloseTo(1.6, 6);
    // gemessen + rekonstruiert = Zählerfortschritt von der ersten bis zur letzten Messung
    expect(day.measuredWh + day.reconstructedWh).toBeCloseTo(wh - 0.1 - 100, 6);
    expect(store.counts().gaps).toBe(1);
  });

  it('kurze Abstände (bis zur Lückengrenze) bleiben gemessene Energie', () => {
    const { store, agg } = setup({ staleAfterMs: 5000 });
    const start = t('2026-11-10T10:00:00Z');
    // alle 5 s ein Messwert – genau an der Grenze, keine Lücke
    for (let i = 0; i < 6; i++) agg.add(reading(start + i * 5000, 360, 100 + i * 0.5));
    agg.flushDue(start + 40_000);
    expect(store.sample(start)!.energyWh).toBeCloseTo(2.5, 6);
    expect(store.counts().gaps).toBe(0);
  });

  it('Neustart mit Pause mitten im Intervall: Pause wird rekonstruiert, nichts doppelt gezählt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-'));
    const file = path.join(dir, 'db.sqlite');
    const start = t('2026-11-10T10:00:00Z');
    const a = setup({ file });
    let wh = constant(a.agg, start, 10, 360, 1000); // 10:00:00–10:00:09
    a.agg.flushAll();
    a.store.close();

    // Neustart dauert 12 s: weiter ab 10:00:21 im selben Intervall, Zähler lief weiter
    const b = setup({ file });
    wh = wh - 0.1 + 1.2;
    wh = constant(b.agg, start + 21_000, 9, 360, wh);
    b.agg.add(reading(start + 30_000, 360, wh));
    b.agg.flushDue(start + 40_000);

    const day = b.store.dailyEnergy('2026-11-10', '2026-11-11')[0];
    expect(day.reconstructedWh).toBeCloseTo(1.2, 6);
    // 9 Schritte vor, 8 nach dem Neustart (die Messung um 10:00:30 gehört zum nächsten Intervall)
    expect(day.measuredWh).toBeCloseTo((9 + 8) * 0.1, 6);
    expect(day.measuredWh + day.reconstructedWh).toBeCloseTo(wh - 0.1 - 1000, 6);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Lücke über die Zeitumstellung und Mitternacht: Aufteilung nach Ortszeit, Summe bleibt erhalten', () => {
    const { store, agg } = setup();
    // 25.10.2026 (25-Stunden-Tag), Ausfall von 23:30 bis 00:30 Ortszeit (Winterzeit, UTC+1)
    const before = t('2026-10-25T22:29:30Z');
    const end = constant(agg, before, 30, 360, 0);
    agg.flushDue(before + 40_000);
    const lastTs = before + 29_000;
    const after = t('2026-10-25T23:30:00Z');
    agg.add(reading(after, 360, end - 0.1 + 360));
    agg.flushDue(after + 40_000);
    const days = store.dailyEnergy('2026-10-25', '2026-10-27');
    const share25 = (t('2026-10-25T23:00:00Z') - lastTs) / (after - lastTs);
    expect(days.map((d) => d.day)).toEqual(['2026-10-25', '2026-10-26']);
    expect(days[0].reconstructedWh).toBeCloseTo(360 * share25, 6);
    expect(days[1].reconstructedWh).toBeCloseTo(360 * (1 - share25), 6);
    expect(days[0].reconstructedWh + days[1].reconstructedWh).toBeCloseTo(360, 6);
  });

  it('Summe aus gemessener und rekonstruierter Energie entspricht dem Zählerfortschritt (gemischte Lücken)', () => {
    const { store, agg } = setup();
    const start = t('2026-11-10T08:00:00Z');
    let wh = 50;
    const first = wh;
    let ts = start;
    // Abwechselnd lückenlos und mit Lücken unterschiedlicher Länge (innerhalb und über Intervallgrenzen)
    for (const pauseMs of [0, 7_000, 0, 45_000, 12_000, 0, 600_000, 9_000]) {
      ts += pauseMs;
      wh += (pauseMs / 1000) * 0.05;
      for (let i = 0; i < 20; i++) {
        agg.add(reading(ts, 180, wh));
        ts += 1000;
        wh += 0.05;
      }
    }
    agg.flushAll();
    const day = store.dailyEnergy('2026-11-10', '2026-11-11')[0];
    expect(day.measuredWh + day.reconstructedWh).toBeCloseTo(wh - 0.05 - first, 6);
    expect(day.reconstructedWh).toBeCloseTo(((7_000 + 45_000 + 12_000 + 600_000 + 9_000) / 1000 + 5) * 0.05, 6);
  });

  it('anderes Gerät: alter Zählerstand wird nicht verrechnet', () => {
    const { store, agg } = setup();
    agg.setDevice('shelly-a');
    const start = t('2026-11-10T10:00:00Z');
    constant(agg, start, 30, 100, 5000);
    agg.flushDue(start + 40_000);
    const agg2 = new Aggregator({ store, timeZone: TZ, pollIntervalMs: 1000, staleAfterMs: 5000, maxPowerW: 3680 });
    agg2.setDevice('shelly-b');
    const next = start + BUCKET_MS;
    constant(agg2, next, 30, 100, 12);
    agg2.flushDue(next + 40_000);
    expect(store.sample(next)).toMatchObject({ quality: 'ok' });
    expect(store.sample(next)!.energyWh).toBeCloseTo((29 * 100) / 3600, 6);
  });

  it('Tagessummen sind wiederholbar (idempotent) und gelten für 23-Stunden-Tage', () => {
    const { store, agg } = setup();
    // 2026-03-29: Umstellung auf Sommerzeit, Tag von 23:00Z bis 22:00Z
    let wh = 0;
    for (const iso of ['2026-03-28T23:00:00Z', '2026-03-29T01:30:00Z', '2026-03-29T21:59:00Z', '2026-03-29T22:00:00Z']) {
      wh = constant(agg, t(iso), 30, 360, wh); // 360 W → 0,1 Wh/s
      agg.flushAll();
    }
    const before = store.dailyEnergy('2026-03-29', '2026-03-31');
    store.recomputeDays(['2026-03-29', '2026-03-30']);
    expect(store.dailyEnergy('2026-03-29', '2026-03-31')).toEqual(before);
    expect(before.map((d) => d.day)).toEqual(['2026-03-29', '2026-03-30']);
    // drei Intervalle am 29., eines am 30. (ab 22:00Z = 00:00 Ortszeit)
    expect(before[0].sampleCount).toBe(3);
    expect(before[1].sampleCount).toBe(1);
  });

  it('Datenbankwachstum: ein Tag (2 880 Intervalle) bleibt klein und dauerhaft gespeichert', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-'));
    const file = path.join(dir, 'db.sqlite');
    const { store, agg } = setup({ file });
    const day = t('2026-11-09T23:00:00Z'); // 10.11. 00:00 Ortszeit
    let wh = 0;
    for (let i = 0; i < 2880; i++) {
      agg.add(reading(day + i * 30_000, 100, wh));
      agg.add(reading(day + i * 30_000 + 15_000, 100, (wh += 100 / 240)));
      wh += 100 / 240;
    }
    agg.flushAll();
    store.db.pragma('wal_checkpoint(TRUNCATE)');
    const bytes = fs.statSync(file).size;
    expect(store.counts().samples).toBe(2880);
    expect(bytes / 2880).toBeLessThan(150); // ≈ 50 MB je Jahr
    store.close();
    // nach dem Wiederöffnen vollständig vorhanden
    const reopened = new Store(file, TZ);
    stores.push(reopened);
    expect(reopened.counts().samples).toBe(2880);
    expect(reopened.dailyEnergy('2026-11-10', '2026-11-11')[0].sampleCount).toBe(2880);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
