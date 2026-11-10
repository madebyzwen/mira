import type { ModuleMigrations } from './migrations.ts';

/** Tabellen des Core. Fachmodule bringen ihre eigenen Migrationen mit. */
export const coreMigrations: ModuleMigrations = {
  module: 'core',
  migrations: [
    {
      version: 1,
      name: 'users_sessions_settings_audit',
      sql: `
        CREATE TABLE users (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
          display_name   TEXT    NOT NULL,
          password_hash  TEXT    NOT NULL,
          created_at     TEXT    NOT NULL,
          last_login_at  TEXT
        );

        CREATE TABLE sessions (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash    TEXT    NOT NULL UNIQUE,
          created_at    TEXT    NOT NULL,
          last_seen_at  TEXT    NOT NULL,
          expires_at    TEXT    NOT NULL,
          ip            TEXT,
          user_agent    TEXT
        );
        CREATE INDEX idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE settings (
          module      TEXT NOT NULL,
          key         TEXT NOT NULL,
          value       TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          PRIMARY KEY (module, key)
        );

        CREATE TABLE audit_log (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          ts       TEXT NOT NULL,
          actor    TEXT,
          module   TEXT NOT NULL,
          action   TEXT NOT NULL,
          target   TEXT,
          result   TEXT NOT NULL CHECK (result IN ('success', 'failure')),
          ip       TEXT,
          details  TEXT
        );
        CREATE INDEX idx_audit_ts ON audit_log(ts);
      `,
    },
    {
      version: 2,
      name: 'notifications',
      sql: `
        CREATE TABLE notifications (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          key           TEXT NOT NULL UNIQUE,
          -- Stand des Inhalts (z. B. gemeldete Version); ändert er sich, gilt die Meldung als neu
          ref           TEXT NOT NULL,
          level         TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
          title         TEXT NOT NULL,
          message       TEXT NOT NULL,
          links         TEXT NOT NULL DEFAULT '[]',
          created_at    TEXT NOT NULL,
          read_at       TEXT,
          dismissed_at  TEXT
        );
      `,
    },
    {
      version: 3,
      name: 'update_component_agent',
      sql: `
        -- Stufe 3a: Die Update-Komponente heißt „agent“. Alte Meldung und gespeicherter
        -- Prüfstand (altes Format) werden verworfen; die nächste Prüfung füllt beides neu.
        DELETE FROM notifications WHERE key = 'update:odin-api';
        DELETE FROM settings WHERE module = 'core' AND key = 'update_check';
      `,
    },
  ],
};
