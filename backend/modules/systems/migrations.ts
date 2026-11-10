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
  {
    version: 2,
    name: 'server_samples',
    sql: `
      -- Minutenwerte (Mittel/Höchstwert der Abfragen einer Minute); ts = Minutenbeginn (UTC, ISO)
      CREATE TABLE server_samples (
        system_id        INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
        ts               TEXT    NOT NULL,
        samples          INTEGER NOT NULL,
        cpu_avg          REAL,
        cpu_max          REAL,
        gpu_avg          REAL,
        gpu_max          REAL,
        ram_used_bytes   REAL,
        vram_used_bytes  REAL,
        load1            REAL,
        temp_cpu_avg     REAL,
        temp_cpu_max     REAL,
        temp_gpu_avg     REAL,
        temp_gpu_max     REAL,
        temp_nvme_avg    REAL,
        temp_nvme_max    REAL,
        PRIMARY KEY (system_id, ts)
      ) WITHOUT ROWID;

      -- Stundenwerte, verdichtet aus den Minutenwerten; ts = Stundenbeginn (UTC, ISO)
      CREATE TABLE server_samples_hourly (
        system_id        INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
        ts               TEXT    NOT NULL,
        samples          INTEGER NOT NULL,
        cpu_avg          REAL,
        cpu_max          REAL,
        gpu_avg          REAL,
        gpu_max          REAL,
        ram_used_bytes   REAL,
        vram_used_bytes  REAL,
        load1            REAL,
        temp_cpu_avg     REAL,
        temp_cpu_max     REAL,
        temp_gpu_avg     REAL,
        temp_gpu_max     REAL,
        temp_nvme_avg    REAL,
        temp_nvme_max    REAL,
        PRIMARY KEY (system_id, ts)
      ) WITHOUT ROWID;
    `,
  },
  {
    version: 3,
    name: 'ai_server_slug',
    sql: `
      -- Stufe 3a: Der KI-Server hat einen festen, namensunabhängigen Schlüssel.
      -- Der Anzeigename kommt beim Start aus MIRA_AI_SERVER_NAME; system_id und Verlauf bleiben erhalten.
      UPDATE systems SET slug = 'ai-server', name = 'KI-Server' WHERE slug = 'odin';
    `,
  },
  {
    version: 4,
    name: 'shelly_plug_energy_prices',
    sql: `
      -- Stufe 4b: Shelly Plug als System (Messwerte liest MIRA beim Shelly-Logger, ADR 0010)
      INSERT INTO systems (slug, name, kind, description, created_at)
      VALUES ('shelly-plug', 'Shelly Plug', 'power_meter', 'Strommessung für den KI-Server', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      -- Strompreis mit Gültigkeitsdatum (Kalendertag, Ortszeit) – ein Eintrag je Tag
      CREATE TABLE energy_prices (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        valid_from      TEXT    NOT NULL UNIQUE,
        cents_per_kwh   REAL    NOT NULL CHECK (cents_per_kwh > 0),
        created_at      TEXT    NOT NULL
      );
    `,
  },
];
