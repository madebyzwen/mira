import type { Db } from './database.ts';
import { nowIso } from './database.ts';

/**
 * Versionierte Datenbankmigration eines Moduls.
 * Jedes Modul (inkl. `core`) führt seine eigene, lückenlose Versionsfolge 1, 2, 3 …
 * Bereits ausgelieferte Migrationen werden nie verändert, sondern nur ergänzt.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface ModuleMigrations {
  module: string;
  migrations: Migration[];
}

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  module      TEXT    NOT NULL,
  version     INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL,
  PRIMARY KEY (module, version)
);`;

export interface MigrationResult {
  module: string;
  applied: number[];
}

export function runMigrations(db: Db, sets: ModuleMigrations[]): MigrationResult[] {
  db.exec(BOOTSTRAP_SQL);
  const appliedStmt = db.prepare<[string], { version: number; name: string }>(
    'SELECT version, name FROM schema_migrations WHERE module = ? ORDER BY version',
  );
  const insertStmt = db.prepare(
    'INSERT INTO schema_migrations (module, version, name, applied_at) VALUES (?, ?, ?, ?)',
  );

  return sets.map(({ module, migrations }) => {
    validateSequence(module, migrations);
    const applied = new Map(appliedStmt.all(module).map((r) => [r.version, r.name]));

    for (const [version, name] of applied) {
      const known = migrations.find((m) => m.version === version);
      if (!known) {
        throw new Error(`Migration ${module}#${version} („${name}“) ist in der Datenbank, aber nicht im Code bekannt.`);
      }
      if (known.name !== name) {
        throw new Error(`Migration ${module}#${version} wurde umbenannt („${name}“ → „${known.name}“). Ausgelieferte Migrationen dürfen nicht verändert werden.`);
      }
    }

    const newlyApplied: number[] = [];
    for (const m of migrations) {
      if (applied.has(m.version)) continue;
      db.transaction(() => {
        db.exec(m.sql);
        insertStmt.run(module, m.version, m.name, nowIso());
      })();
      newlyApplied.push(m.version);
    }
    return { module, applied: newlyApplied };
  });
}

function validateSequence(module: string, migrations: Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migrationen von „${module}“ müssen lückenlos ab 1 nummeriert sein (gefunden: ${m.version} an Position ${i + 1}).`);
    }
  });
}
