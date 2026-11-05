import type { Migration } from '../../core/db/migrations.ts';

export const systemsMigrations: Migration[] = [
  {
    version: 1,
    name: 'systems_and_state',
    sql: `
      CREATE TABLE systems (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        slug         TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        kind         TEXT NOT NULL CHECK (kind IN ('server', 'power_meter')),
        description  TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );

      CREATE TABLE system_state (
        system_id     INTEGER PRIMARY KEY REFERENCES systems(id) ON DELETE CASCADE,
        state         TEXT NOT NULL CHECK (state IN ('online', 'offline', 'unknown')),
        since         TEXT,
        last_seen_at  TEXT,
        last_error    TEXT,
        updated_at    TEXT NOT NULL
      );

      INSERT INTO systems (slug, name, kind, description, created_at)
      VALUES ('odin', 'Odin', 'server', 'KI-Server', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `,
  },
];
