import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { backupDatabase } from '../core/backup.ts';
import { openDatabase } from '../core/db/database.ts';
import { coreMigrations } from '../core/db/coreMigrations.ts';
import { runMigrations } from '../core/db/migrations.ts';
import { Scheduler, nextDailyRun } from '../core/scheduler.ts';
import { tempDir } from './helpers.ts';

const silentLog = { info() {}, warn() {}, error() {} } as never;

describe('Scheduler', () => {
  it('berechnet den nächsten täglichen Termin (Ortszeit)', () => {
    const from = new Date(2026, 10, 6, 2, 0, 0);
    expect(nextDailyRun('03:30', from)).toEqual(new Date(2026, 10, 6, 3, 30, 0));
    expect(nextDailyRun('01:00', from)).toEqual(new Date(2026, 10, 7, 1, 0, 0));
    expect(nextDailyRun('02:00', from)).toEqual(new Date(2026, 10, 7, 2, 0, 0));
  });

  it('startet Aufgaben erst nach start() und übersteht Fehler', async () => {
    const scheduler = new Scheduler(silentLog);
    let runs = 0;
    const errors: unknown[] = [];
    const log = { info() {}, warn() {}, error: (o: unknown) => errors.push(o) } as never;
    const s2 = new Scheduler(log);
    scheduler.every('zaehler', 20, () => void runs++, { runNow: true });
    s2.every('fehler', 20, () => {
      throw new Error('kaputt');
    }, { runNow: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(runs).toBe(0);

    scheduler.start();
    s2.start();
    await new Promise((r) => setTimeout(r, 70));
    scheduler.stop();
    s2.stop();
    expect(runs).toBeGreaterThanOrEqual(3);
    expect(errors.length).toBeGreaterThanOrEqual(2); // Fehler protokolliert, Aufgabe läuft weiter
  });
});

describe('Sicherung', () => {
  it('erstellt eine konsistente Kopie und behält nur die neuesten Sicherungen', async () => {
    const dir = tempDir();
    const db = openDatabase(path.join(dir, 'mira.db'));
    runMigrations(db, [coreMigrations]);
    db.prepare("INSERT INTO settings (module, key, value, updated_at) VALUES ('core', 'test', '1', 'x')").run();

    for (const day of [1, 2, 3, 4]) await backupDatabase(db, dir, 3, new Date(2026, 10, day, 3, 30));
    const files = fs.readdirSync(path.join(dir, 'backups')).sort();
    expect(files).toEqual(['mira-2026-11-02.db', 'mira-2026-11-03.db', 'mira-2026-11-04.db']);

    const copy = new Database(path.join(dir, 'backups', 'mira-2026-11-04.db'), { readonly: true });
    expect(copy.prepare('SELECT value FROM settings WHERE key = ?').get('test')).toEqual({ value: '1' });
    copy.close();

    // gleicher Tag → ersetzt, nicht doppelt
    const again = await backupDatabase(db, dir, 3, new Date(2026, 10, 4, 12, 0));
    expect(again.removed).toEqual([]);
    expect(fs.readdirSync(path.join(dir, 'backups'))).toHaveLength(3);
    db.close();
  });
});
