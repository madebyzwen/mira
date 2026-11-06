import { describe, expect, it } from 'vitest';
import type { SystemMetrics } from '@mira/shared';
import { openDatabase, type Db } from '../core/db/database.ts';
import { coreMigrations } from '../core/db/coreMigrations.ts';
import { runMigrations } from '../core/db/migrations.ts';
import { systemsMigrations } from '../modules/systems/migrations.ts';
import { SampleAggregator } from '../modules/systems/sampleAggregator.ts';
import { ServerHistory } from '../modules/systems/history.ts';

const SYSTEM_ID = 1;

function setupDb(): Db {
  const db = openDatabase(':memory:');
  runMigrations(db, [coreMigrations, { module: 'systems', migrations: systemsMigrations }]);
  return db;
}

function metrics(cpu: number, gpu: number | null, tempCpu = 40): SystemMetrics {
  return {
    ts: new Date().toISOString(),
    uptimeSeconds: 100,
    cpu: { usagePercent: cpu },
    load: { one: 0.5, five: 0.4, fifteen: 0.3 },
    memory: { totalBytes: 64e9, usedBytes: 8e9, availableBytes: 56e9 },
    gpu: gpu === null ? null : { usagePercent: gpu, vramUsedBytes: 10e9, vramTotalBytes: 32e9 },
    temperatures: [{ sensor: 'cpu', label: 'CPU', celsius: tempCpu }],
    disks: [],
    networkShares: [],
    network: [],
  };
}

const rows = (db: Db, table = 'server_samples') => db.prepare(`SELECT * FROM ${table} ORDER BY ts`).all() as Record<string, number | string | null>[];

/** Minutenwert direkt einfügen (für Abfrage-Tests). */
function insertMinute(db: Db, ts: string, cpu: number | null, gpu: number | null, samples = 30) {
  db.prepare('INSERT INTO server_samples (system_id, ts, samples, cpu_avg, cpu_max, gpu_avg, gpu_max) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    SYSTEM_ID, ts, samples, cpu, cpu, gpu, gpu,
  );
}

describe('Minuten-Verdichtung', () => {
  it('schreibt je Minute einen Datensatz mit Mittel- und Höchstwerten', () => {
    const db = setupDb();
    const agg = new SampleAggregator(db, SYSTEM_ID);
    agg.add(metrics(10, 20, 40), new Date('2026-11-06T10:00:02Z'));
    agg.add(metrics(30, 40, 44), new Date('2026-11-06T10:00:30Z'));
    agg.add(metrics(20, null, 42), new Date('2026-11-06T10:00:58Z'));
    expect(rows(db)).toHaveLength(0); // erst beim Minutenwechsel

    agg.add(metrics(50, 50), new Date('2026-11-06T10:01:01Z'));
    const [row] = rows(db);
    expect(row).toMatchObject({
      ts: '2026-11-06T10:00:00.000Z',
      samples: 3,
      cpu_avg: 20,
      cpu_max: 30,
      gpu_avg: 30, // Messung ohne GPU zählt nicht mit
      gpu_max: 40,
      temp_cpu_avg: 42,
      temp_cpu_max: 44,
    });

    agg.flush();
    expect(rows(db)).toHaveLength(2);
  });

  it('schreibt nach dem Schließen der Datenbank nichts mehr (sauberes Beenden)', () => {
    const db = setupDb();
    const agg = new SampleAggregator(db, SYSTEM_ID);
    agg.add(metrics(10, 10), new Date('2026-11-06T10:00:00Z'));
    db.close();
    expect(() => agg.flush()).not.toThrow();
  });
});

describe('Verlauf', () => {
  const now = new Date('2026-11-06T12:07:30Z');

  it('liefert 24 h als 288 Fünf-Minuten-Punkte mit Lücken statt erfundener Werte', () => {
    const db = setupDb();
    insertMinute(db, '2026-11-06T12:05:00.000Z', 10, 5, 30);
    insertMinute(db, '2026-11-06T12:06:00.000Z', 40, null, 10);
    insertMinute(db, '2026-11-06T11:00:00.000Z', 20, 2);
    const res = new ServerHistory(db, SYSTEM_ID).query('24h', now);

    expect(res.points).toHaveLength(288);
    expect(res.stepSeconds).toBe(300);
    const last = res.points.at(-1)!;
    expect(last.ts).toBe('2026-11-06T12:05:00.000Z');
    expect(last.cpu).toBe(17.5); // gewichtet: (10·30 + 40·10) / 40
    expect(last.gpu).toBe(5);
    expect(res.points.find((p) => p.ts === '2026-11-06T11:00:00.000Z')).toEqual({ ts: '2026-11-06T11:00:00.000Z', cpu: 20, gpu: 2 });
    expect(res.points.find((p) => p.ts === '2026-11-06T11:30:00.000Z')).toEqual({ ts: '2026-11-06T11:30:00.000Z', cpu: null, gpu: null });
  });

  it('verdichtet Minuten- zu Stundenwerten (gewichtet) und ist wiederholbar', () => {
    const db = setupDb();
    insertMinute(db, '2026-11-06T10:00:00.000Z', 10, 0, 30);
    insertMinute(db, '2026-11-06T10:30:00.000Z', 40, 0, 10);
    insertMinute(db, '2026-11-06T11:15:00.000Z', 50, 5, 30);
    const history = new ServerHistory(db, SYSTEM_ID);
    history.aggregateHourly(now);
    history.aggregateHourly(now);
    const hourly = rows(db, 'server_samples_hourly');
    expect(hourly).toHaveLength(2);
    expect(hourly[0]).toMatchObject({ ts: '2026-11-06T10:00:00.000Z', samples: 40, cpu_avg: 17.5, cpu_max: 40 });

    const week = history.query('7d', now);
    expect(week.points).toHaveLength(168);
    expect(week.points.find((p) => p.ts === '2026-11-06T10:00:00.000Z')?.cpu).toBe(17.5);

    const month = history.query('30d', now);
    expect(month.points).toHaveLength(180);
    expect(month.stepSeconds).toBe(4 * 3600);
  });

  it('löscht Werte nach Ablauf der Aufbewahrung', () => {
    const db = setupDb();
    insertMinute(db, '2026-10-01T10:00:00.000Z', 1, 1);
    insertMinute(db, '2026-11-06T10:00:00.000Z', 1, 1);
    db.prepare("INSERT INTO server_samples_hourly (system_id, ts, samples) VALUES (1, '2025-01-01T00:00:00.000Z', 1), (1, '2026-11-01T00:00:00.000Z', 1)").run();
    const removed = new ServerHistory(db, SYSTEM_ID).prune(7, 365, now);
    expect(removed).toEqual({ raw: 1, hourly: 1 });
    expect(rows(db)).toHaveLength(1);
    expect(rows(db, 'server_samples_hourly')).toHaveLength(1);
  });
});
