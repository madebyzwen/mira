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

/** Summen eines Abschnitts ohne zeitabhängige Felder – stabil, solange keine neuen Daten geschrieben werden */
interface RawSum {
  measuredWh: number;
  reconstructedWh: number;
  coveredMs: number;
  /** Abschnitt [start, end) in UTC-Millisekunden */
  start: number;
  end: number;
}

interface RawConsumption {
  period: ConsumptionPeriod;
  first: DayKey;
  next: DayKey;
  total: RawSum;
  breakdown: (RawSum & { label: string })[];
}

/**
 * Auswertungen für die API. Verbrauchssummen kommen aus den Tagessummen
 * (`daily_energy`) und werden zwischengespeichert, bis das nächste 30-s-Intervall
 * geschrieben ist. Zeitabhängige Felder (`coverage`, `complete`) werden bei jeder
 * Anfrage neu berechnet – auch wenn wegen eines Ausfalls keine Intervalle entstehen.
 * Live-Abfragen berühren diese Klasse nicht.
 */
export class Reports {
  private readonly store: Store;
  private readonly aggregator: Aggregator;
  private readonly timeZone: string;
  private readonly now: () => number;
  private cache = new Map<string, { version: number; value: RawConsumption }>();
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
    let cached = this.cache.get(key);
    if (!cached || cached.version !== this.aggregator.version) {
      if (this.cache.size >= 200) this.cache.clear();
      cached = { version: this.aggregator.version, value: this.computeConsumption(period, date ?? today) };
      this.cache.set(key, cached);
    }
    const raw = cached.value;

    // laufendes, noch nicht geschriebenes Intervall nur für den aktuellen Zeitraum ergänzen
    const current = today >= raw.first && today < raw.next;
    const pending = current ? this.aggregator.pendingEnergyWh() : 0;
    const currentLabel = period === 'year' ? today.slice(0, 7) : today;
    const finish = (s: RawSum, addPending: boolean): Sum => {
      const extra = addPending && pending > 0 ? pending : 0;
      const elapsed = Math.max(0, Math.min(now, s.end) - s.start);
      return {
        energyWh: round(s.measuredWh + s.reconstructedWh + extra),
        measuredWh: round(s.measuredWh + extra),
        reconstructedWh: round(s.reconstructedWh),
        coverage: elapsed > 0 ? round(Math.min(1, s.coveredMs / elapsed), 4) : 0,
      };
    };
    return {
      period,
      timezone: this.timeZone,
      from: iso(raw.total.start),
      to: iso(raw.total.end),
      complete: now >= raw.total.end,
      ...finish(raw.total, true),
      breakdown: raw.breakdown.map((b) => ({ label: b.label, from: iso(b.start), to: iso(b.end), ...finish(b, b.label === currentLabel) })),
    };
  }

  private computeConsumption(period: ConsumptionPeriod, date: DayKey): RawConsumption {
    const { first, next } = periodOf(period, date);
    const from = startOfDay(first, this.timeZone);
    const to = startOfDay(next, this.timeZone);
    const rows = new Map(this.store.dailyEnergy(first, next).map((r) => [r.day, r]));
    const sumDays = (days: DayKey[], start: number, end: number): RawSum => {
      let measuredWh = 0;
      let reconstructedWh = 0;
      let coveredMs = 0;
      for (const d of days) {
        const r: DailyEnergy | undefined = rows.get(d);
        if (!r) continue;
        measuredWh += r.measuredWh;
        reconstructedWh += r.reconstructedWh;
        coveredMs += r.coveredMs;
      }
      return { measuredWh, reconstructedWh, coveredMs, start, end };
    };

    const days = daysBetween(first, next);
    let breakdown: RawConsumption['breakdown'] = [];
    if (period === 'week' || period === 'month') {
      breakdown = days.map((d, i) => {
        const s = startOfDay(d, this.timeZone);
        const e = i + 1 < days.length ? startOfDay(days[i + 1], this.timeZone) : to;
        return { label: d, ...sumDays([d], s, e) };
      });
    } else if (period === 'year') {
      const { year } = parseDayKey(first);
      breakdown = Array.from({ length: 12 }, (_, m) => {
        const month = periodOf('month', `${year}-${String(m + 1).padStart(2, '0')}-01`);
        const s = startOfDay(month.first, this.timeZone);
        const e = startOfDay(month.next, this.timeZone);
        return { label: month.first.slice(0, 7), ...sumDays(daysBetween(month.first, month.next), s, e) };
      });
    }
    return { period, first, next, total: sumDays(days, from, to), breakdown };
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
