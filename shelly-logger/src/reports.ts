import {
  HISTORY_GRID,
  type ConsumptionPeriod,
  type ConsumptionResponse,
  type DatabaseStatsResponse,
  type HistoryRange,
  type PowerHistoryResponse,
} from '@mira/shared';
import type { Aggregator } from './aggregator.ts';
import type { DailyEnergy, Store } from './store.ts';
import { dayKeyOf, daysBetween, parseDayKey, periodOf, startOfDay, type DayKey } from './time.ts';

const iso = (ts: number) => new Date(ts).toISOString();
const round = (v: number, digits = 3) => Number(v.toFixed(digits));

interface Sum {
  energyWh: number;
  measuredWh: number;
  reconstructedWh: number;
  coverage: number;
}

/**
 * Auswertungen für die API. Verbrauchssummen kommen aus den Tagessummen
 * (`daily_energy`) und werden zwischengespeichert, bis das nächste 30-s-Intervall
 * geschrieben ist. Live-Abfragen berühren diese Klasse nicht.
 */
export class Reports {
  private readonly store: Store;
  private readonly aggregator: Aggregator;
  private readonly timeZone: string;
  private readonly now: () => number;
  private cache = new Map<string, { version: number; value: ConsumptionResponse }>();
  private dbStats: DatabaseStatsResponse | null = null;

  constructor(store: Store, aggregator: Aggregator, timeZone: string, now: () => number = Date.now) {
    this.store = store;
    this.aggregator = aggregator;
    this.timeZone = timeZone;
    this.now = now;
  }

  /** Verbrauch im Zeitraum, der `date` enthält (ohne Angabe: aktueller Zeitraum). */
  consumption(period: ConsumptionPeriod, date?: DayKey): ConsumptionResponse {
    const now = this.now();
    const today = dayKeyOf(now, this.timeZone);
    const key = `${period}:${date ?? today}`;
    const cached = this.cache.get(key);
    const base = cached && cached.version === this.aggregator.version ? cached.value : this.computeConsumption(period, date ?? today, now);
    if (!cached || cached.value !== base) this.cache.set(key, { version: this.aggregator.version, value: base });
    if (this.cache.size > 200) this.cache.clear();

    // laufendes, noch nicht geschriebenes Intervall nur für den aktuellen Zeitraum ergänzen
    const { first, next } = periodOf(period, date ?? today);
    if (today < first || today >= next) return base;
    const pending = this.aggregator.pendingEnergyWh();
    if (pending <= 0) return base;
    const add = (s: Sum & { label?: string }) => ({ ...s, energyWh: round(s.energyWh + pending), measuredWh: round(s.measuredWh + pending) });
    return {
      ...add(base),
      breakdown: base.breakdown.map((b) => (b.label === (period === 'year' ? today.slice(0, 7) : today) ? add(b) : b)),
    } as ConsumptionResponse;
  }

  private computeConsumption(period: ConsumptionPeriod, date: DayKey, now: number): ConsumptionResponse {
    const { first, next } = periodOf(period, date);
    const from = startOfDay(first, this.timeZone);
    const to = startOfDay(next, this.timeZone);
    const rows = new Map(this.store.dailyEnergy(first, next).map((r) => [r.day, r]));
    const sumDays = (days: DayKey[], start: number, end: number): Sum => {
      let measured = 0;
      let reconstructed = 0;
      let covered = 0;
      for (const d of days) {
        const r: DailyEnergy | undefined = rows.get(d);
        if (!r) continue;
        measured += r.measuredWh;
        reconstructed += r.reconstructedWh;
        covered += r.coveredMs;
      }
      const elapsed = Math.max(0, Math.min(now, end) - start);
      return {
        energyWh: round(measured + reconstructed),
        measuredWh: round(measured),
        reconstructedWh: round(reconstructed),
        coverage: elapsed > 0 ? round(Math.min(1, covered / elapsed), 4) : 0,
      };
    };

    const days = daysBetween(first, next);
    let breakdown: ConsumptionResponse['breakdown'] = [];
    if (period === 'week' || period === 'month') {
      breakdown = days.map((d, i) => {
        const s = startOfDay(d, this.timeZone);
        const e = i + 1 < days.length ? startOfDay(days[i + 1], this.timeZone) : to;
        return { label: d, from: iso(s), to: iso(e), ...sumDays([d], s, e) };
      });
    } else if (period === 'year') {
      const { year } = parseDayKey(first);
      breakdown = Array.from({ length: 12 }, (_, m) => {
        const month = periodOf('month', `${year}-${String(m + 1).padStart(2, '0')}-01`);
        const s = startOfDay(month.first, this.timeZone);
        const e = startOfDay(month.next, this.timeZone);
        return { label: month.first.slice(0, 7), from: iso(s), to: iso(e), ...sumDays(daysBetween(month.first, month.next), s, e) };
      });
    }
    return {
      period,
      timezone: this.timeZone,
      from: iso(from),
      to: iso(to),
      complete: now >= to,
      ...sumDays(days, from, to),
      breakdown,
    };
  }

  /** Leistungsverlauf im Raster von MIRA (`HISTORY_GRID`). */
  history(range: HistoryRange): PowerHistoryResponse {
    const { points, stepSeconds } = HISTORY_GRID[range];
    const step = stepSeconds * 1000;
    const to = Math.floor(this.now() / step) * step + step;
    const from = to - points * step;
    const buckets = new Map(this.store.history(from, to, step).map((b) => [b.idx, b]));
    return {
      range,
      from: iso(from),
      to: iso(to),
      stepSeconds,
      points: Array.from({ length: points }, (_, i) => {
        const b = buckets.get(i);
        return {
          ts: iso(from + i * step),
          avgW: b?.avgW != null ? round(b.avgW, 2) : null,
          minW: b?.minW ?? null,
          maxW: b?.maxW ?? null,
          energyWh: b?.energyWh != null ? round(b.energyWh) : null,
          coverage: b ? round(Math.min(1, b.coveredMs / step), 4) : 0,
        };
      }),
    };
  }

  /** Datenbankstatistik neu ermitteln (periodisch, nicht je Anfrage). */
  refreshDatabaseStats(): DatabaseStatsResponse {
    const sizes = this.store.fileSizes();
    const c = this.store.counts();
    this.dbStats = {
      bytes: { ...sizes, total: sizes.database + sizes.wal + sizes.shm },
      samples: c.samples,
      gaps: c.gaps,
      days: c.days,
      oldestSample: c.oldest !== null ? iso(c.oldest) : null,
      newestSample: c.newest !== null ? iso(c.newest) : null,
      refreshedAt: iso(this.now()),
    };
    return this.dbStats;
  }

  databaseStats(): DatabaseStatsResponse {
    return this.dbStats ?? this.refreshDatabaseStats();
  }
}
