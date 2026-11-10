import { afterEach, describe, expect, it } from 'vitest';
import { consumptionResponseSchema, powerHistoryResponseSchema } from '@mira/shared';
import { Aggregator } from '../src/aggregator.ts';
import { Reports } from '../src/reports.ts';
import type { MeterReading } from '../src/shelly/client.ts';
import { Store } from '../src/store.ts';

const TZ = 'Europe/Berlin';
const t = (iso: string) => Date.parse(iso);
const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

/** Hilfsaufbau: je Zeitpunkt ein 30-s-Intervall mit 30 sekündlichen Messungen bei 360 W (0,1 Wh/s). */
function setup(now: number) {
  const store = new Store(':memory:', TZ);
  stores.push(store);
  const agg = new Aggregator({ store, timeZone: TZ, pollIntervalMs: 1000, staleAfterMs: 5000, maxPowerW: 3680 });
  const clock = { now };
  const reports = new Reports(store, agg, TZ, () => clock.now);
  let wh = 0;
  const intervalAt = (iso: string) => {
    const s = t(iso);
    for (let i = 0; i < 30; i++) {
      agg.add({ ts: s + i * 1000, powerW: 360, voltageV: 230, currentA: 1.5, energyTotalWh: wh } satisfies MeterReading);
      wh += 0.1;
    }
    agg.flushAll();
  };
  return { store, agg, reports, clock, intervalAt };
}

// Je Intervall 29 gemessene Zählerschritte à 0,1 Wh; der Schritt über die Lücke zum vorigen
// Intervall (> 5 s) zählt als rekonstruiert
const PER_INTERVAL = 2.9;

describe('Verbrauchsstatistik (Europe/Berlin)', () => {
  it('Tag: heute seit 00:00 Uhr Ortszeit, nur bisher Erfasstes, laufend = nicht abgeschlossen', () => {
    const { reports, intervalAt } = setup(t('2026-11-10T12:00:00Z'));
    intervalAt('2026-11-09T22:59:00Z'); // 23:59 am 09.11. → gestern
    intervalAt('2026-11-09T23:00:00Z'); // 00:00 am 10.11.
    intervalAt('2026-11-10T08:00:00Z');
    const day = consumptionResponseSchema.parse(reports.consumption('day'));
    expect(day).toMatchObject({ period: 'day', timezone: TZ, from: '2026-11-09T23:00:00.000Z', to: '2026-11-10T23:00:00.000Z', complete: false, breakdown: [] });
    expect(day.measuredWh).toBeCloseTo(2 * PER_INTERVAL, 6);
    // Lücke 00:00:29–08:00:00 (ein Zählerschritt) – Summe aus dem Zähler, Verteilung unbekannt
    expect(day.reconstructedWh).toBeCloseTo(0.1, 6);
    expect(day.energyWh).toBeCloseTo(day.measuredWh + day.reconstructedWh, 6);
    expect(day.coverage).toBeGreaterThan(0);
    expect(day.coverage).toBeLessThan(0.01);
  });

  it('Woche ab Montag 00:00, Monat ab dem 1., Jahr ab 1. Januar – mit Aufteilung', () => {
    const { reports, intervalAt } = setup(t('2026-11-10T12:00:00Z'));
    intervalAt('2026-11-02T10:00:00Z'); // Vorwoche
    intervalAt('2026-11-09T10:00:00Z'); // Montag
    intervalAt('2026-11-10T10:00:00Z'); // Dienstag (heute)
    const week = reports.consumption('week');
    expect(week.from).toBe('2026-11-08T23:00:00.000Z');
    expect(week.to).toBe('2026-11-15T23:00:00.000Z');
    expect(week.breakdown.map((b) => b.label)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(week.breakdown[2]).toMatchObject({ energyWh: 0, coverage: 0 }); // Zukunft
    const month = reports.consumption('month');
    expect(month.from).toBe('2026-10-31T23:00:00.000Z');
    expect(month.breakdown).toHaveLength(30);
    expect(month.measuredWh).toBeCloseTo(3 * PER_INTERVAL, 6);
    expect(month.measuredWh).toBeGreaterThan(week.measuredWh);
    const year = reports.consumption('year');
    expect(year.from).toBe('2025-12-31T23:00:00.000Z');
    expect(year.breakdown.map((b) => b.label)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
    expect(year.breakdown[10].measuredWh).toBeCloseTo(month.measuredWh, 6);
    expect(year.energyWh).toBeCloseTo(month.energyWh, 6);
  });

  it('abgeschlossene Zeiträume bleiben abrufbar (Monats- und Jahreswechsel)', () => {
    const { reports, intervalAt } = setup(t('2027-01-05T12:00:00Z'));
    intervalAt('2026-12-31T22:59:00Z'); // 23:59 am 31.12. Ortszeit
    intervalAt('2026-12-31T23:00:00Z'); // 00:00 am 01.01.2027
    const dec = reports.consumption('month', '2026-12-15');
    expect(dec).toMatchObject({ complete: true, from: '2026-11-30T23:00:00.000Z', to: '2026-12-31T23:00:00.000Z' });
    expect(dec.measuredWh).toBeCloseTo(PER_INTERVAL, 6);
    const y2026 = reports.consumption('year', '2026-06-01');
    expect(y2026.complete).toBe(true);
    expect(y2026.measuredWh).toBeCloseTo(PER_INTERVAL, 6);
    const y2027 = reports.consumption('year');
    expect(y2027.complete).toBe(false);
    expect(y2027.measuredWh).toBeCloseTo(PER_INTERVAL, 6);
    // Woche über den Jahreswechsel: Mo 28.12.2026 – So 03.01.2027
    const week = reports.consumption('week', '2027-01-01');
    expect(week.breakdown[0].label).toBe('2026-12-28');
    expect(week.measuredWh).toBeCloseTo(2 * PER_INTERVAL, 6);
  });

  it('Zeitumstellung: der 25-Stunden-Tag im Oktober wird vollständig gezählt', () => {
    const { reports, intervalAt } = setup(t('2026-10-27T12:00:00Z'));
    intervalAt('2026-10-24T22:00:00Z'); // 00:00 am 25.10. (Sommerzeit)
    intervalAt('2026-10-25T22:59:00Z'); // 23:59 am 25.10. (Winterzeit)
    intervalAt('2026-10-25T23:00:00Z'); // 00:00 am 26.10.
    const day = reports.consumption('day', '2026-10-25');
    expect(Date.parse(day.to) - Date.parse(day.from)).toBe(25 * 3_600_000);
    expect(day.measuredWh).toBeCloseTo(2 * PER_INTERVAL, 6);
    expect(reports.consumption('day', '2026-10-26').measuredWh).toBeCloseTo(PER_INTERVAL, 6);
  });

  it('„bis jetzt“ enthält auch das laufende, noch nicht geschriebene Intervall', () => {
    const { reports, agg, intervalAt, clock } = setup(t('2026-11-10T10:00:45Z'));
    intervalAt('2026-11-10T10:00:00Z');
    const before = reports.consumption('day').measuredWh;
    agg.add({ ts: t('2026-11-10T10:00:30Z'), powerW: 360, voltageV: 230, currentA: 1.5, energyTotalWh: 3.0 });
    agg.add({ ts: t('2026-11-10T10:00:31Z'), powerW: 360, voltageV: 230, currentA: 1.5, energyTotalWh: 3.1 });
    clock.now = t('2026-11-10T10:00:46Z');
    expect(reports.consumption('day').measuredWh).toBeCloseTo(before + 0.2, 6);
  });

  it('Verlauf im Raster von MIRA mit Lücken als null', () => {
    const { reports, intervalAt } = setup(t('2026-11-10T10:30:00Z'));
    intervalAt('2026-11-10T10:00:00Z');
    const h = powerHistoryResponseSchema.parse(reports.history('1h'));
    expect(h.points).toHaveLength(60);
    expect(h.stepSeconds).toBe(60);
    const filled = h.points.filter((p) => p.avgW !== null);
    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({ ts: '2026-11-10T10:00:00.000Z', avgW: 360, minW: 360, maxW: 360 });
    expect(filled[0].coverage).toBeCloseTo(0.5, 2);
    expect(h.points.find((p) => p.ts === '2026-11-10T10:01:00.000Z')).toMatchObject({ avgW: null, energyWh: null, coverage: 0 });
  });
});
