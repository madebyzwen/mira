import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { SampleQuality } from '@mira/shared';
import { dayKeyOf, startOfDay, addDays, type DayKey } from './time.ts';

export type Db = Database.Database;

/** 30-Sekunden-Intervall (gemessen) */
export interface PowerSample {
  /** Beginn des Intervalls (UTC, ms, an :00/:30 ausgerichtet) */
  start: number;
  end: number;
  avgW: number | null;
  minW: number | null;
  maxW: number | null;
  sampleCount: number;
  /** Zeit im Intervall, die durch Messwerte abgedeckt ist */
  coveredMs: number;
  avgVoltage: number | null;
  /** Verbrauch im Intervall aus der Zählerdifferenz; `null` = nicht bestimmbar */
  energyWh: number | null;
  quality: SampleQuality;
}

/** Energie über einen Messausfall: Summe aus dem Zähler bekannt, zeitliche Verteilung nicht */
export interface EnergyGap {
  start: number;
  end: number;
  energyWh: number;
}

/** Zuletzt verbuchter Zählerstand – verhindert Doppelzählung nach einem Neustart */
export interface MeterState {
  ts: number;
  totalWh: number;
  deviceId: string | null;
}

export interface DailyEnergy {
  day: DayKey;
  measuredWh: number;
  reconstructedWh: number;
  coveredMs: number;
  sampleCount: number;
}

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'power_samples_daily_energy',
    sql: `
      -- 30-Sekunden-Verdichtung; Zeitpunkte als UTC-Millisekunden
      CREATE TABLE power_samples (
        interval_start  INTEGER PRIMARY KEY,
        interval_end    INTEGER NOT NULL,
        avg_w           REAL,
        min_w           REAL,
        max_w           REAL,
        sample_count    INTEGER NOT NULL,
        covered_ms      INTEGER NOT NULL,
        avg_voltage     REAL,
        energy_wh       REAL,
        quality         TEXT NOT NULL CHECK (quality IN ('ok', 'partial', 'counter_reset', 'implausible'))
      ) WITHOUT ROWID;

      -- Energie über Messausfälle (aus der Zählerdifferenz), je Kalendertag aufgeteilt
      CREATE TABLE energy_gaps (
        gap_start  INTEGER PRIMARY KEY,
        gap_end    INTEGER NOT NULL,
        energy_wh  REAL NOT NULL
      ) WITHOUT ROWID;

      -- Tagessummen (Kalendertag in LOGGER_TIMEZONE); jederzeit aus den Tabellen oben neu berechenbar
      CREATE TABLE daily_energy (
        day               TEXT PRIMARY KEY,
        measured_wh       REAL NOT NULL,
        reconstructed_wh  REAL NOT NULL,
        covered_ms        INTEGER NOT NULL,
        sample_count      INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      ) WITHOUT ROWID;

      -- zuletzt verbuchter Zählerstand (eine Zeile)
      CREATE TABLE meter_state (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        ts         INTEGER NOT NULL,
        total_wh   REAL NOT NULL,
        device_id  TEXT
      );
    `,
  },
];

const QUALITY_RANK: Record<SampleQuality, number> = { ok: 0, partial: 1, counter_reset: 2, implausible: 3 };

export function worstQuality(a: SampleQuality, b: SampleQuality): SampleQuality {
  return QUALITY_RANK[a] >= QUALITY_RANK[b] ? a : b;
}

/** Zwei Teile desselben Intervalls zusammenführen (z. B. vor und nach einem Neustart). */
export function mergeSamples(a: PowerSample, b: PowerSample): PowerSample {
  const covered = a.coveredMs + b.coveredMs;
  const weighted = (x: number | null, wx: number, y: number | null, wy: number) =>
    x === null ? y : y === null ? x : wx + wy > 0 ? (x * wx + y * wy) / (wx + wy) : (x + y) / 2;
  const pick = (f: (x: number, y: number) => number, x: number | null, y: number | null) => (x === null ? y : y === null ? x : f(x, y));
  return {
    start: a.start,
    end: Math.max(a.end, b.end),
    avgW: weighted(a.avgW, a.coveredMs, b.avgW, b.coveredMs),
    minW: pick(Math.min, a.minW, b.minW),
    maxW: pick(Math.max, a.maxW, b.maxW),
    sampleCount: a.sampleCount + b.sampleCount,
    coveredMs: covered,
    avgVoltage: weighted(a.avgVoltage, a.sampleCount, b.avgVoltage, b.sampleCount),
    energyWh: a.energyWh === null ? b.energyWh : b.energyWh === null ? a.energyWh : a.energyWh + b.energyWh,
    quality: worstQuality(a.quality, b.quality),
  };
}

interface SampleRow {
  interval_start: number;
  interval_end: number;
  avg_w: number | null;
  min_w: number | null;
  max_w: number | null;
  sample_count: number;
  covered_ms: number;
  avg_voltage: number | null;
  energy_wh: number | null;
  quality: SampleQuality;
}

const fromRow = (r: SampleRow): PowerSample => ({
  start: r.interval_start,
  end: r.interval_end,
  avgW: r.avg_w,
  minW: r.min_w,
  maxW: r.max_w,
  sampleCount: r.sample_count,
  coveredMs: r.covered_ms,
  avgVoltage: r.avg_voltage,
  energyWh: r.energy_wh,
  quality: r.quality,
});

export interface HistoryBucket {
  idx: number;
  avgW: number | null;
  minW: number | null;
  maxW: number | null;
  energyWh: number | null;
  coveredMs: number;
}

/**
 * SQLite-Datenbank des Loggers. Nur dieser Prozess schreibt hinein (WAL-Modus).
 * Es wird nie automatisch gelöscht.
 */
export class Store {
  readonly db: Db;
  readonly file: string;
  private readonly timeZone: string;
  private readonly stmt;

  constructor(file: string, timeZone: string) {
    this.file = file;
    this.timeZone = timeZone;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
    this.stmt = {
      getSample: this.db.prepare<[number], SampleRow>('SELECT * FROM power_samples WHERE interval_start = ?'),
      upsertSample: this.db.prepare(
        `INSERT INTO power_samples (interval_start, interval_end, avg_w, min_w, max_w, sample_count, covered_ms, avg_voltage, energy_wh, quality)
         VALUES (@start, @end, @avgW, @minW, @maxW, @sampleCount, @coveredMs, @avgVoltage, @energyWh, @quality)
         ON CONFLICT(interval_start) DO UPDATE SET
           interval_end = excluded.interval_end, avg_w = excluded.avg_w, min_w = excluded.min_w, max_w = excluded.max_w,
           sample_count = excluded.sample_count, covered_ms = excluded.covered_ms, avg_voltage = excluded.avg_voltage,
           energy_wh = excluded.energy_wh, quality = excluded.quality`,
      ),
      insertGap: this.db.prepare(
        `INSERT INTO energy_gaps (gap_start, gap_end, energy_wh) VALUES (?, ?, ?)
         ON CONFLICT(gap_start) DO UPDATE SET gap_end = excluded.gap_end, energy_wh = excluded.energy_wh`,
      ),
      getMeter: this.db.prepare<[], { ts: number; total_wh: number; device_id: string | null }>('SELECT ts, total_wh, device_id FROM meter_state WHERE id = 1'),
      setMeter: this.db.prepare(
        `INSERT INTO meter_state (id, ts, total_wh, device_id) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, total_wh = excluded.total_wh, device_id = excluded.device_id`,
      ),
      clearMeter: this.db.prepare('DELETE FROM meter_state'),
      measured: this.db.prepare<[number, number], { wh: number; covered: number; n: number }>(
        `SELECT COALESCE(SUM(energy_wh), 0) AS wh, COALESCE(SUM(covered_ms), 0) AS covered, COUNT(*) AS n
           FROM power_samples WHERE interval_start >= ? AND interval_start < ?`,
      ),
      reconstructed: this.db.prepare<[number, number], { wh: number }>(
        'SELECT COALESCE(SUM(energy_wh), 0) AS wh FROM energy_gaps WHERE gap_start >= ? AND gap_start < ?',
      ),
      upsertDay: this.db.prepare(
        `INSERT INTO daily_energy (day, measured_wh, reconstructed_wh, covered_ms, sample_count, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day) DO UPDATE SET measured_wh = excluded.measured_wh, reconstructed_wh = excluded.reconstructed_wh,
           covered_ms = excluded.covered_ms, sample_count = excluded.sample_count, updated_at = excluded.updated_at`,
      ),
      days: this.db.prepare<[string, string], { day: string; measured_wh: number; reconstructed_wh: number; covered_ms: number; sample_count: number }>(
        'SELECT day, measured_wh, reconstructed_wh, covered_ms, sample_count FROM daily_energy WHERE day >= ? AND day < ? ORDER BY day',
      ),
      history: this.db.prepare<[number, number, number, number], HistoryBucket>(
        `SELECT CAST((interval_start - ?) / ? AS INTEGER) AS idx,
                SUM(avg_w * covered_ms) / NULLIF(SUM(CASE WHEN avg_w IS NOT NULL THEN covered_ms END), 0) AS avgW,
                MIN(min_w) AS minW, MAX(max_w) AS maxW, SUM(energy_wh) AS energyWh, SUM(covered_ms) AS coveredMs
           FROM power_samples WHERE interval_start >= ? AND interval_start < ?
          GROUP BY idx ORDER BY idx`,
      ),
      counts: this.db.prepare<[], { samples: number; oldest: number | null; newest: number | null; gaps: number; days: number }>(
        `SELECT (SELECT COUNT(*) FROM power_samples) AS samples,
                (SELECT MIN(interval_start) FROM power_samples) AS oldest,
                (SELECT MAX(interval_start) FROM power_samples) AS newest,
                (SELECT COUNT(*) FROM energy_gaps) AS gaps,
                (SELECT COUNT(*) FROM daily_energy) AS days`,
      ),
    };
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    const applied = new Map(this.db.prepare<[], { version: number; name: string }>('SELECT version, name FROM schema_migrations').all().map((r) => [r.version, r.name]));
    for (const [version, name] of applied) {
      const known = MIGRATIONS.find((m) => m.version === version);
      if (!known) throw new Error(`Datenbank hat Migration ${version} („${name}“), die diese Version nicht kennt – neuere Datenbank?`);
      if (known.name !== name) throw new Error(`Migration ${version} wurde umbenannt („${name}“ → „${known.name}“)`);
    }
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      this.db.transaction(() => {
        this.db.exec(m.sql);
        this.db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
      })();
    }
  }

  meterState(): MeterState | null {
    const r = this.stmt.getMeter.get();
    return r ? { ts: r.ts, totalWh: r.total_wh, deviceId: r.device_id } : null;
  }

  /** Neues Gerät (andere ID): bisheriger Zählerstand ist nicht vergleichbar. */
  resetMeterState(): void {
    this.stmt.clearMeter.run();
  }

  sample(start: number): PowerSample | null {
    const r = this.stmt.getSample.get(start);
    return r ? fromRow(r) : null;
  }

  /**
   * Ein Intervall, zugehörige Ausfall-Energie und den neuen Zählerstand in einer
   * Transaktion schreiben und die betroffenen Tagessummen neu berechnen.
   * Existiert das Intervall bereits (Neustart mitten im Intervall), werden beide Teile zusammengeführt.
   */
  writeInterval(sample: PowerSample, gaps: EnergyGap[], meter: MeterState | null): DayKey[] {
    const days = new Set<DayKey>([dayKeyOf(sample.start, this.timeZone), ...gaps.map((g) => dayKeyOf(g.start, this.timeZone))]);
    this.db.transaction(() => {
      const existing = this.sample(sample.start);
      const merged = existing ? mergeSamples(existing, sample) : sample;
      this.stmt.upsertSample.run(merged);
      for (const g of gaps) this.stmt.insertGap.run(g.start, g.end, g.energyWh);
      if (meter) this.stmt.setMeter.run(meter.ts, meter.totalWh, meter.deviceId);
      this.recomputeDays([...days]);
    })();
    return [...days];
  }

  /** Tagessummen aus Intervallen und Ausfall-Energie neu berechnen (wiederholbar, idempotent). */
  recomputeDays(days: DayKey[]): void {
    const now = Date.now();
    for (const day of days) {
      const from = startOfDay(day, this.timeZone);
      const to = startOfDay(addDays(day, 1), this.timeZone);
      const m = this.stmt.measured.get(from, to)!;
      const r = this.stmt.reconstructed.get(from, to)!;
      this.stmt.upsertDay.run(day, m.wh, r.wh, m.covered, m.n, now);
    }
  }

  /** Tagessummen im Bereich [first, next) */
  dailyEnergy(first: DayKey, next: DayKey): DailyEnergy[] {
    return this.stmt.days.all(first, next).map((r) => ({
      day: r.day,
      measuredWh: r.measured_wh,
      reconstructedWh: r.reconstructed_wh,
      coveredMs: r.covered_ms,
      sampleCount: r.sample_count,
    }));
  }

  /** Intervalle gruppiert in Abschnitte der Länge `stepMs` ab `from` */
  history(from: number, to: number, stepMs: number): HistoryBucket[] {
    return this.stmt.history.all(from, stepMs, from, to);
  }

  counts() {
    return this.stmt.counts.get()!;
  }

  /** Physische Größe einschließlich WAL- und SHM-Datei */
  fileSizes(): { database: number; wal: number; shm: number } {
    const size = (f: string) => {
      try {
        return fs.statSync(f).size;
      } catch {
        return 0;
      }
    };
    if (this.file === ':memory:') return { database: 0, wal: 0, shm: 0 };
    return { database: size(this.file), wal: size(`${this.file}-wal`), shm: size(`${this.file}-shm`) };
  }

  /**
   * Konsistente Sicherung im laufenden Betrieb (SQLite-Backup-API) nach
   * `<dir>/shelly-logger-JJJJ-MM-TT.db`; die neuesten `keep` bleiben erhalten.
   */
  async backup(dir: string, keep: number, now = Date.now()): Promise<{ file: string; bytes: number; removed: string[] }> {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `shelly-logger-${dayKeyOf(now, this.timeZone)}.db`);
    const tmp = `${file}.tmp`;
    await this.db.backup(tmp);
    const copy = new Database(tmp);
    try {
      copy.pragma('journal_mode = DELETE');
    } finally {
      copy.close();
    }
    fs.renameSync(tmp, file);
    const pattern = /^shelly-logger-\d{4}-\d{2}-\d{2}\.db$/;
    const removed = fs
      .readdirSync(dir)
      .filter((f) => pattern.test(f))
      .sort()
      .reverse()
      .slice(keep);
    for (const f of removed) fs.rmSync(path.join(dir, f), { force: true });
    return { file, bytes: fs.statSync(file).size, removed };
  }

  close(): void {
    if (this.db.open) this.db.close();
  }
}
