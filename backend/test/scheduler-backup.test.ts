import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { buildApp, runBackup } from '../app.ts';
import { backupDatabase, verifyBackup } from '../core/backup.ts';
import { openDatabase } from '../core/db/database.ts';
import { coreMigrations } from '../core/db/coreMigrations.ts';
import { runMigrations } from '../core/db/migrations.ts';
import { Scheduler, nextDailyRun } from '../core/scheduler.ts';
import { ADMIN_PASSWORD, ADMIN_USER, tempDir, testConfig } from './helpers.ts';

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

describe('Sicherung › Prüfung, Wiederherstellung, getrenntes Ziel (B-01)', () => {
  function database() {
    const dir = tempDir();
    const db = openDatabase(path.join(dir, 'mira.db'));
    runMigrations(db, [coreMigrations]);
    db.prepare("INSERT INTO settings (module, key, value, updated_at) VALUES ('core', 'test', '1', 'x')").run();
    return { dir, db };
  }

  it('erkennt beschädigte oder fremde Dateien', () => {
    const dir = tempDir();
    const garbage = path.join(dir, 'kaputt.db');
    fs.writeFileSync(garbage, 'keine Datenbank'.repeat(200));
    expect(() => verifyBackup(garbage)).toThrow();
    const empty = path.join(dir, 'leer.db');
    new Database(empty).close();
    expect(() => verifyBackup(empty)).toThrow();
    expect(() => verifyBackup(path.join(dir, 'fehlt.db'))).toThrow();
  });

  it('beschädigte Seiten in einer Kopie fallen bei der Integritätsprüfung auf', async () => {
    const { dir, db } = database();
    for (let i = 0; i < 500; i++) db.prepare('INSERT INTO settings (module, key, value, updated_at) VALUES (?, ?, ?, ?)').run('m', `k${i}`, 'x'.repeat(200), 'x');
    const { file } = await backupDatabase(db, dir, 3);
    db.close();
    const bytes = fs.readFileSync(file);
    // mitten in der Datei (Datenseiten) überschreiben
    bytes.fill(0x7f, 8192, 8192 + 4096);
    const broken = path.join(dir, 'kaputt.db');
    fs.writeFileSync(broken, bytes);
    expect(() => verifyBackup(broken)).toThrow();
  });

  it('Wiederherstellung: die Sicherung ist eine vollständige MIRA-Datenbank – Anmeldung und Daten bleiben', async () => {
    const config = testConfig();
    const first = await buildApp(config, { logger: false, modules: [] });
    await first.app.ready();
    first.db.prepare("INSERT INTO settings (module, key, value, updated_at) VALUES ('core', 'marker', '42', 'x')").run();
    const { file } = await backupDatabase(first.db, config.dataDir, 3);
    await first.app.close();

    // Wiederherstellen wie in der Anleitung: Sicherung als mira.db in ein (neues) Datenverzeichnis
    const restored = testConfig();
    fs.copyFileSync(file, restored.dbFile);
    const second = await buildApp(restored, { logger: false, modules: [] });
    await second.app.ready();
    expect(second.db.prepare("SELECT value FROM settings WHERE key = 'marker'").get()).toEqual({ value: '42' });
    const login = await second.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: ADMIN_USER, password: ADMIN_PASSWORD } });
    expect(login.statusCode).toBe(200);
    await second.app.close();
  });

  it('fehlgeschlagene Sicherung: vorhandene Sicherungen bleiben unverändert, keine Reste', async () => {
    const { dir, db } = database();
    for (const day of [1, 2, 3]) await backupDatabase(db, dir, 3, new Date(2026, 10, day, 3, 30));
    const before = fs.readdirSync(path.join(dir, 'backups')).sort();
    db.close(); // Sicherung schlägt fehl (Datenbank nicht mehr offen)
    await expect(backupDatabase(db, dir, 3, new Date(2026, 10, 4, 3, 30))).rejects.toThrow();
    expect(fs.readdirSync(path.join(dir, 'backups')).sort()).toEqual(before);
  });

  it('kopiert jede geprüfte Sicherung zusätzlich auf ein getrenntes Ziel – mit eigener Aufbewahrung', async () => {
    const { dir, db } = database();
    const copyDir = path.join(tempDir(), 'zweites-ziel');
    for (const day of [1, 2, 3, 4]) {
      const r = await backupDatabase(db, dir, 3, new Date(2026, 10, day, 3, 30), { copyDir });
      expect(r.copy).toMatchObject({ file: path.join(copyDir, `mira-2026-11-0${day}.db`) });
    }
    expect(fs.readdirSync(copyDir).sort()).toEqual(['mira-2026-11-02.db', 'mira-2026-11-03.db', 'mira-2026-11-04.db']);
    verifyBackup(path.join(copyDir, 'mira-2026-11-04.db'));
    db.close();
  });

  it('fehlerhaftes getrenntes Ziel: lokale Sicherung gilt, Fehler wird gemeldet', async () => {
    const { dir, db } = database();
    const notADir = path.join(tempDir(), 'datei');
    fs.writeFileSync(notADir, 'x');
    const r = await backupDatabase(db, dir, 3, new Date(2026, 10, 1, 3, 30), { copyDir: notADir });
    expect(r.copy).toMatchObject({ error: expect.any(String) });
    verifyBackup(r.file);
    db.close();
  });

  it('Glocke: fehlgeschlagene Sicherung wird gemeldet, die nächste erfolgreiche entfernt die Meldung', async () => {
    const config = testConfig();
    const mira = await buildApp(config, { logger: false, modules: [] });
    await mira.app.ready();
    const log = Fastify({ logger: false }).log;
    const notice = () => mira.db.prepare("SELECT level, title FROM notifications WHERE key = 'backup:status'").get();

    const broken = { ...config, backup: { ...config.backup, copyDir: path.join(config.dataDir, 'mira.db') } }; // Ziel ist eine Datei
    expect(await runBackup(mira.db, broken, mira.notifications, log)).not.toBeNull();
    expect(notice()).toEqual({ level: 'warning', title: 'Kopie der Datensicherung fehlgeschlagen' });

    const closedDb = new Database(':memory:');
    closedDb.close();
    expect(await runBackup(closedDb, config, mira.notifications, log)).toBeNull();
    expect(notice()).toEqual({ level: 'error', title: 'Datensicherung fehlgeschlagen' });

    expect(await runBackup(mira.db, config, mira.notifications, log)).not.toBeNull();
    expect(notice()).toBeUndefined();
    await mira.app.close();
  });
});
