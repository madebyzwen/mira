import type { z } from 'zod';
import type { Db } from './db/database.ts';
import { nowIso } from './db/database.ts';

/**
 * Einstellungen und kleine Zustände der Module als JSON in der Tabelle `settings`.
 * Gelesene Werte werden mit dem Schema geprüft; ungültige oder fehlende Werte
 * ergeben `undefined` (z. B. nach einer Änderung des Formats).
 */
export class SettingsStore {
  private readonly selectStmt;
  private readonly upsertStmt;

  constructor(db: Db) {
    this.selectStmt = db.prepare<[string, string], { value: string }>('SELECT value FROM settings WHERE module = ? AND key = ?');
    this.upsertStmt = db.prepare(
      `INSERT INTO settings (module, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(module, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
  }

  get<T>(module: string, key: string, schema: z.ZodType<T>): T | undefined {
    const row = this.selectStmt.get(module, key);
    if (!row) return undefined;
    try {
      const parsed = schema.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  set(module: string, key: string, value: unknown): void {
    this.upsertStmt.run(module, key, JSON.stringify(value), nowIso());
  }
}
