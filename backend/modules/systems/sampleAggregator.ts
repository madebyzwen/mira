import type { SystemMetrics } from '@mira/shared';
import type { Db } from '../../core/db/database.ts';

const MINUTE_MS = 60_000;

/** Kennzahlen einer Messung, die in den Verlauf eingehen. */
interface Reading {
  cpu: number | null;
  gpu: number | null;
  ram: number;
  vram: number | null;
  load1: number;
  tempCpu: number | null;
  tempGpu: number | null;
  tempNvme: number | null;
}

class Stat {
  sum = 0;
  count = 0;
  max = -Infinity;

  add(v: number | null): void {
    if (v === null || !Number.isFinite(v)) return;
    this.sum += v;
    this.count += 1;
    if (v > this.max) this.max = v;
  }

  get avg(): number | null {
    return this.count ? Math.round((this.sum / this.count) * 100) / 100 : null;
  }

  get peak(): number | null {
    return this.count ? this.max : null;
  }
}

function toReading(m: SystemMetrics): Reading {
  const temp = (sensor: string) => m.temperatures.find((t) => t.sensor === sensor)?.celsius ?? null;
  return {
    cpu: m.cpu.usagePercent,
    gpu: m.gpu?.usagePercent ?? null,
    ram: m.memory.usedBytes,
    vram: m.gpu?.vramUsedBytes ?? null,
    load1: m.load.one,
    tempCpu: temp('cpu'),
    tempGpu: temp('gpu'),
    tempNvme: temp('nvme'),
  };
}

/**
 * Sammelt die Messungen einer Minute im Speicher und schreibt beim
 * Minutenwechsel genau einen Datensatz (Mittel- und Höchstwerte).
 * So bleibt die Datenbank klein, obwohl alle 2 Sekunden gemessen wird.
 */
export class SampleAggregator {
  private readonly db: Db;
  private readonly systemId: number;
  private bucketStart: number | null = null;
  private samples = 0;
  private stats = { cpu: new Stat(), gpu: new Stat(), ram: new Stat(), vram: new Stat(), load1: new Stat(), tempCpu: new Stat(), tempGpu: new Stat(), tempNvme: new Stat() };

  constructor(db: Db, systemId: number) {
    this.db = db;
    this.systemId = systemId;
  }

  /** Messung aufnehmen; `at` = Zeitpunkt der Messung. */
  add(metrics: SystemMetrics, at: Date = new Date()): void {
    const bucket = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
    if (this.bucketStart !== null && bucket !== this.bucketStart) this.flush();
    this.bucketStart = bucket;
    this.samples += 1;
    const r = toReading(metrics);
    for (const key of Object.keys(this.stats) as (keyof Reading)[]) this.stats[key].add(r[key]);
  }

  /** Laufende Minute sofort schreiben (z. B. beim Beenden). */
  flush(): void {
    if (this.bucketStart === null || this.samples === 0) return;
    const s = this.stats;
    if (this.db.open) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO server_samples
             (system_id, ts, samples, cpu_avg, cpu_max, gpu_avg, gpu_max, ram_used_bytes, vram_used_bytes, load1,
              temp_cpu_avg, temp_cpu_max, temp_gpu_avg, temp_gpu_max, temp_nvme_avg, temp_nvme_max)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.systemId,
          new Date(this.bucketStart).toISOString(),
          this.samples,
          s.cpu.avg, s.cpu.peak, s.gpu.avg, s.gpu.peak, s.ram.avg, s.vram.avg, s.load1.avg,
          s.tempCpu.avg, s.tempCpu.peak, s.tempGpu.avg, s.tempGpu.peak, s.tempNvme.avg, s.tempNvme.peak,
        );
    }
    this.bucketStart = null;
    this.samples = 0;
    for (const key of Object.keys(this.stats) as (keyof Reading)[]) this.stats[key] = new Stat();
  }
}
