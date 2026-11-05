import type { Db } from './db/database.ts';
import { nowIso } from './db/database.ts';

export interface AuditEntry {
  actor?: string | null;
  module: string;
  action: string;
  target?: string | null;
  result: 'success' | 'failure';
  ip?: string | null;
  details?: Record<string, unknown>;
}

/** Strukturiertes Protokoll sicherheitsrelevanter Aktionen (Anmeldung, später Serversteuerung). */
export class AuditLog {
  private readonly insert;
  private readonly prune;

  constructor(db: Db) {
    this.insert = db.prepare(
      'INSERT INTO audit_log (ts, actor, module, action, target, result, ip, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    this.prune = db.prepare('DELETE FROM audit_log WHERE ts < ?');
  }

  write(entry: AuditEntry): void {
    this.insert.run(
      nowIso(),
      entry.actor ?? null,
      entry.module,
      entry.action,
      entry.target ?? null,
      entry.result,
      entry.ip ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
    );
  }

  /** Entfernt Einträge, die älter als die Aufbewahrungsfrist sind. */
  pruneOlderThan(days: number, now = new Date()): number {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return this.prune.run(nowIso(cutoff)).changes;
  }
}
