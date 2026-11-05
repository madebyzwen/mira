import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Öffnet die SQLite-Datenbank mit den MIRA-Standardeinstellungen.
 * `:memory:` wird für Tests unterstützt.
 */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

/** Aktueller Zeitpunkt als ISO-8601 (UTC) – einheitliches Zeitformat in der Datenbank. */
export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}
