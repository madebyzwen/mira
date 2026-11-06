import { HISTORY_GRID, type HistoryPoint, type HistoryRange, type HistoryResponse } from '@mira/shared';
import type { Db } from '../../core/db/database.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Zeitraum → Quelle der Punkte (Raster aus `HISTORY_GRID`).
 * `completeOnly`: die laufende Minute liegt erst nach ihrem Ende in der Datenbank –
 * bei Minutenauflösung endet der Verlauf daher mit der letzten abgeschlossenen Minute
 * (sonst stünde rechts immer eine Lücke).
 */
const SOURCES: Record<HistoryRange, { table: 'server_samples' | 'server_samples_hourly'; completeOnly: boolean }> = {
  '1h': { table: 'server_samples', completeOnly: true },
  '24h': { table: 'server_samples', completeOnly: false },
  '7d': { table: 'server_samples_hourly', completeOnly: false },
  '30d': { table: 'server_samples_hourly', completeOnly: false },
};

/** Gewichteter Mittelwert (nach Anzahl der Messungen) – NULL-Werte zählen nicht. */
const weighted = (col: string) => `SUM(${col} * samples) / NULLIF(SUM(CASE WHEN ${col} IS NOT NULL THEN samples END), 0)`;

/** Felder des Verlaufs: Name im Ergebnis → Spalte (Mittelwert) */
const FIELDS = { cpu: 'cpu_avg', gpu: 'gpu_avg', tempCpu: 'temp_cpu_avg', tempGpu: 'temp_gpu_avg' } as const;
type Field = keyof typeof FIELDS;

type Row = { ts: string; samples: number } & Record<Field, number | null>;

const round1 = (v: number) => Math.round(v * 10) / 10;

export class ServerHistory {
  private readonly db: Db;
  private readonly systemId: number;

  constructor(db: Db, systemId: number) {
    this.db = db;
    this.systemId = systemId;
  }

  /**
   * Verdichtet Minutenwerte zu Stundenwerten. Es werden die letzten `lookbackHours`
   * Stunden (inkl. der laufenden) neu berechnet – damit ist die Verdichtung
   * wiederholbar und holt Ausfälle des Schedulers automatisch nach.
   */
  aggregateHourly(now = new Date(), lookbackHours = 48): number {
    const from = new Date(Math.floor(now.getTime() / HOUR) * HOUR - lookbackHours * HOUR).toISOString();
    return this.db
      .prepare(
        `INSERT OR REPLACE INTO server_samples_hourly
           (system_id, ts, samples, cpu_avg, cpu_max, gpu_avg, gpu_max, ram_used_bytes, vram_used_bytes, load1,
            temp_cpu_avg, temp_cpu_max, temp_gpu_avg, temp_gpu_max, temp_nvme_avg, temp_nvme_max)
         SELECT system_id, substr(ts, 1, 13) || ':00:00.000Z', SUM(samples),
                ${weighted('cpu_avg')}, MAX(cpu_max), ${weighted('gpu_avg')}, MAX(gpu_max),
                ${weighted('ram_used_bytes')}, ${weighted('vram_used_bytes')}, ${weighted('load1')},
                ${weighted('temp_cpu_avg')}, MAX(temp_cpu_max), ${weighted('temp_gpu_avg')}, MAX(temp_gpu_max),
                ${weighted('temp_nvme_avg')}, MAX(temp_nvme_max)
           FROM server_samples
          WHERE system_id = ? AND ts >= ?
          GROUP BY system_id, substr(ts, 1, 13)`,
      )
      .run(this.systemId, from).changes;
  }

  /** Löscht Werte, die älter als die Aufbewahrung sind. */
  prune(rawDays: number, hourlyDays: number, now = new Date()): { raw: number; hourly: number } {
    const cut = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
    return {
      raw: this.db.prepare('DELETE FROM server_samples WHERE system_id = ? AND ts < ?').run(this.systemId, cut(rawDays)).changes,
      hourly: this.db
        .prepare('DELETE FROM server_samples_hourly WHERE system_id = ? AND ts < ?')
        .run(this.systemId, cut(hourlyDays)).changes,
    };
  }

  /** Verlauf für die Diagramme: feste Anzahl Punkte, fehlende Zeiträume als `null`. */
  query(range: HistoryRange, now = new Date()): HistoryResponse {
    const { table, completeOnly } = SOURCES[range];
    const step = HISTORY_GRID[range].stepSeconds * 1000;
    const count = HISTORY_GRID[range].points;
    const lastBucket = Math.floor(now.getTime() / step) * step - (completeOnly ? step : 0);
    const first = lastBucket - (count - 1) * step;

    const columns = (Object.entries(FIELDS) as [Field, string][]).map(([name, col]) => `${col} AS ${name}`).join(', ');
    const rows = this.db
      .prepare<[number, string], Row>(`SELECT ts, samples, ${columns} FROM ${table} WHERE system_id = ? AND ts >= ? ORDER BY ts`)
      .all(this.systemId, new Date(first).toISOString());

    // Je Punkt gewichteter Mittelwert (nach Anzahl der Messungen) der enthaltenen Datensätze
    const fields = Object.keys(FIELDS) as Field[];
    const acc = Array.from({ length: count }, () => fields.map(() => ({ sum: 0, n: 0 })));
    for (const r of rows) {
      const i = Math.floor((new Date(r.ts).getTime() - first) / step);
      if (i < 0 || i >= count) continue;
      fields.forEach((f, k) => {
        const v = r[f];
        if (v === null) return;
        acc[i][k].sum += v * r.samples;
        acc[i][k].n += r.samples;
      });
    }

    const points = acc.map((a, i) => {
      const point = { ts: new Date(first + i * step).toISOString() } as HistoryPoint;
      fields.forEach((f, k) => {
        point[f] = a[k].n ? round1(a[k].sum / a[k].n) : null;
      });
      return point;
    });

    return {
      range,
      from: new Date(first).toISOString(),
      to: new Date(lastBucket + step).toISOString(),
      stepSeconds: step / 1000,
      points,
    };
  }
}
