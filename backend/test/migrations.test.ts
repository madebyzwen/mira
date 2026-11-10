import { describe, expect, it } from 'vitest';
import { openDatabase } from '../core/db/database.ts';
import { coreMigrations } from '../core/db/coreMigrations.ts';
import { runMigrations, type ModuleMigrations } from '../core/db/migrations.ts';
import { systemsMigrations } from '../modules/systems/migrations.ts';

const exampleModule: ModuleMigrations = {
  module: 'beispiel',
  migrations: [
    { version: 1, name: 'tabelle', sql: 'CREATE TABLE beispiel_werte (id INTEGER PRIMARY KEY, wert TEXT);' },
    { version: 2, name: 'spalte', sql: 'ALTER TABLE beispiel_werte ADD COLUMN zeit TEXT;' },
  ],
};

function tables(db: ReturnType<typeof openDatabase>): string[] {
  return db
    .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name);
}

describe('Migrationen', () => {
  it('legt die Core-Tabellen an und protokolliert die Version', () => {
    const db = openDatabase(':memory:');
    const [result] = runMigrations(db, [coreMigrations]);
    expect(result).toEqual({ module: 'core', applied: [1, 2, 3] });
    expect(tables(db)).toEqual(expect.arrayContaining(['users', 'sessions', 'settings', 'audit_log', 'notifications', 'schema_migrations']));
  });

  it('ist idempotent – ein zweiter Lauf wendet nichts erneut an', () => {
    const db = openDatabase(':memory:');
    runMigrations(db, [coreMigrations, exampleModule]);
    const second = runMigrations(db, [coreMigrations, exampleModule]);
    expect(second.every((r) => r.applied.length === 0)).toBe(true);
  });

  it('führt Versionen pro Modul getrennt und wendet nur neue Migrationen an', () => {
    const db = openDatabase(':memory:');
    runMigrations(db, [coreMigrations, { module: 'beispiel', migrations: exampleModule.migrations.slice(0, 1) }]);
    const [, result] = runMigrations(db, [coreMigrations, exampleModule]);
    expect(result).toEqual({ module: 'beispiel', applied: [2] });
    const versions = db.prepare('SELECT module, version FROM schema_migrations ORDER BY module, version').all();
    expect(versions).toEqual([
      { module: 'beispiel', version: 1 },
      { module: 'beispiel', version: 2 },
      { module: 'core', version: 1 },
      { module: 'core', version: 2 },
      { module: 'core', version: 3 },
    ]);
  });

  it('lehnt Lücken in der Nummerierung ab', () => {
    const db = openDatabase(':memory:');
    expect(() => runMigrations(db, [{ module: 'x', migrations: [{ version: 2, name: 'a', sql: 'SELECT 1;' }] }])).toThrow(/lückenlos/);
  });

  it('erkennt nachträglich umbenannte Migrationen', () => {
    const db = openDatabase(':memory:');
    runMigrations(db, [exampleModule]);
    const renamed: ModuleMigrations = {
      module: 'beispiel',
      migrations: [{ ...exampleModule.migrations[0], name: 'anders' }, exampleModule.migrations[1]],
    };
    expect(() => runMigrations(db, [renamed])).toThrow(/umbenannt/);
  });

  it('rollt eine fehlerhafte Migration vollständig zurück', () => {
    const db = openDatabase(':memory:');
    const broken: ModuleMigrations = {
      module: 'kaputt',
      migrations: [{ version: 1, name: 'fehler', sql: 'CREATE TABLE halb (id INTEGER); INSERT INTO gibtsnicht VALUES (1);' }],
    };
    expect(() => runMigrations(db, [broken])).toThrow();
    expect(tables(db)).not.toContain('halb');
    expect(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE module = 'kaputt'").get()).toEqual({ n: 0 });
  });

  it('Stufe 3a: stellt eine bestehende Datenbank auf den KI-Server um – Verlauf bleibt, alter Update-Stand wird verworfen', () => {
    const db = openDatabase(':memory:');
    // Stand vor Stufe 3a (MIRA 0.6.x)
    runMigrations(db, [
      { ...coreMigrations, migrations: coreMigrations.migrations.slice(0, 2) },
      { module: 'systems', migrations: systemsMigrations.slice(0, 2) },
    ]);
    const before = db.prepare<[], { id: number; slug: string }>('SELECT id, slug FROM systems').get()!;
    expect(before.slug).toBe('odin');
    db.prepare("INSERT INTO server_samples (system_id, ts, samples, cpu_avg) VALUES (?, '2026-11-09T10:00:00.000Z', 30, 12.5)").run(before.id);
    const notify = db.prepare("INSERT INTO notifications (key, ref, level, title, message, created_at) VALUES (?, '1', 'info', 't', 'm', '2026-11-09')");
    notify.run('update:odin-api');
    notify.run('update:mira');
    db.prepare("INSERT INTO settings (module, key, value, updated_at) VALUES ('core', 'update_check', '{}', '2026-11-09')").run();

    const results = runMigrations(db, [coreMigrations, { module: 'systems', migrations: systemsMigrations }]);
    expect(results).toEqual([
      { module: 'core', applied: [3] },
      { module: 'systems', applied: [3] },
    ]);
    expect(db.prepare('SELECT id, slug, name, description FROM systems').all()).toEqual([
      { id: before.id, slug: 'ai-server', name: 'KI-Server', description: 'KI-Server' },
    ]);
    expect(db.prepare('SELECT system_id, cpu_avg FROM server_samples').all()).toEqual([{ system_id: before.id, cpu_avg: 12.5 }]);
    expect(db.prepare('SELECT key FROM notifications').all()).toEqual([{ key: 'update:mira' }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'update_check'").get()).toEqual({ n: 0 });
  });
});
