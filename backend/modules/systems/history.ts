import type { HistoryPoint, HistoryRange, HistoryResponse } from '@mira/shared';
import type { Db } from '../../core/db/database.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Zeitraum → Quelle und Auflösung der Punkte. */
const RANGES: Record<HistoryRange, { span: number; step: number; table: 'server_samples' | 'server_samples_hourly' }> = {
  '24h': { span: DAY, step: 5 * MINUTE, table: 'server_samples' },
  '7d': { span: 7 * DAY, step: HOUR, table: 'server_samples_hourly' },
  '30d': { span: 30 * DAY, step: 4 * HOUR, table: 'server_samples_hourly' },
};

/** Gewichteter Mittelwert (nach Anzahl der Messungen) – NULL-Werte zählen nicht. */
const weighted = (col: string) => `SUM(${col} * samples) / NULLIF(SUM(CASE WHEN ${col} IS NOT NULL THEN samples END), 0)`;

interface Row {
  ts: string;
  samples: number;
  cpu: number | null;
  gpu: number | null;
}

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
    const { span, step, table } = RANGES[range];
    const count = Math.round(span / step);
    const lastBucket = Math.floor(now.getTime() / step) * step;
    const first = lastBucket - (count - 1) * step;

    const rows = this.db
      .prepare<[number, string], Row>(
        `SELECT ts, samples, cpu_avg AS cpu, gpu_avg AS gpu FROM ${table} WHERE system_id = ? AND ts >= ? ORDER BY ts`,
      )
      .all(this.systemId, new Date(first).toISOString());

    const acc = Array.from({ length: count }, () => ({ cpuSum: 0, cpuN: 0, gpuSum: 0, gpuN: 0 }));
    for (const r of rows) {
      const i = Math.floor((new Date(r.ts).getTime() - first) / step);
      if (i < 0 || i >= count) continue;
      if (r.cpu !== null) {
        acc[i].cpuSum += r.cpu * r.samples;
        acc[i].cpuN += r.samples;
      }
      if (r.gpu !== null) {
        acc[i].gpuSum += r.gpu * r.samples;
        acc[i].gpuN += r.samples;
      }
    }

    const points: HistoryPoint[] = acc.map((a, i) => ({
      ts: new Date(first + i * step).toISOString(),
      cpu: a.cpuN ? round1(a.cpuSum / a.cpuN) : null,
      gpu: a.gpuN ? round1(a.gpuSum / a.gpuN) : null,
    }));

    return {
      range,
      from: new Date(first).toISOString(),
      to: new Date(lastBucket + step).toISOString(),
      stepSeconds: step / 1000,
      points,
    };
  }
}
