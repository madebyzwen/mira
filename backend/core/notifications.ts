import type { Notification, NotificationLevel, NotificationLink } from '@mira/shared';
import type { Db } from './db/database.ts';
import { nowIso } from './db/database.ts';

export interface NotificationInput {
  /** Eindeutig je Thema, z. B. `update:mira` – je Schlüssel gibt es höchstens eine Meldung */
  key: string;
  /** Stand des Inhalts, z. B. die gemeldete Version. Ändert er sich, gilt die Meldung als neu (wieder ungelesen). */
  ref: string;
  level: NotificationLevel;
  title: string;
  message: string;
  links?: NotificationLink[];
}

interface NotificationRow {
  id: number;
  key: string;
  ref: string;
  level: NotificationLevel;
  title: string;
  message: string;
  links: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

/**
 * Benachrichtigungen für die Glocke in der Kopfzeile.
 * MIRA hat ein Konto – Gelesen/Ausgeblendet gilt global.
 */
export class NotificationStore {
  private readonly db: Db;
  private readonly now: () => Date;

  constructor(db: Db, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  /**
   * Legt die Meldung zum Schlüssel an bzw. ersetzt sie, wenn sich ihr Stand (`ref`) geändert hat.
   * Bei gleichem Stand bleibt sie unverändert – auch gelesen bzw. ausgeblendet.
   * @returns `true`, wenn die Meldung neu ist oder ersetzt wurde
   */
  upsert(input: NotificationInput, now = this.now()): boolean {
    const existing = this.db.prepare<[string], { ref: string }>('SELECT ref FROM notifications WHERE key = ?').get(input.key);
    if (existing?.ref === input.ref) return false;
    this.db
      .prepare(
        `INSERT INTO notifications (key, ref, level, title, message, links, created_at, read_at, dismissed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
         ON CONFLICT(key) DO UPDATE SET
           ref = excluded.ref, level = excluded.level, title = excluded.title, message = excluded.message,
           links = excluded.links, created_at = excluded.created_at, read_at = NULL, dismissed_at = NULL`,
      )
      .run(input.key, input.ref, input.level, input.title, input.message, JSON.stringify(input.links ?? []), nowIso(now));
    return true;
  }

  /** Entfernt die Meldung zum Schlüssel (z. B. wenn das Update eingespielt ist). */
  remove(key: string): boolean {
    return this.db.prepare('DELETE FROM notifications WHERE key = ?').run(key).changes > 0;
  }

  /** Nicht ausgeblendete Meldungen, neueste zuerst. */
  list(): Notification[] {
    return this.db
      .prepare<[], NotificationRow>('SELECT * FROM notifications WHERE dismissed_at IS NULL ORDER BY created_at DESC, id DESC')
      .all()
      .map(toNotification);
  }

  unreadCount(): number {
    return this.db
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE dismissed_at IS NULL AND read_at IS NULL')
      .get()!.n;
  }

  /** Markiert die angegebenen (bzw. ohne `ids` alle) Meldungen als gelesen. */
  markRead(ids?: number[], now = this.now()): number {
    const ts = nowIso(now);
    if (!ids) return this.db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(ts).changes;
    const stmt = this.db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL');
    return this.db.transaction(() => ids.reduce((n, id) => n + stmt.run(ts, id).changes, 0))();
  }

  /** Blendet eine Meldung aus. @returns `false`, wenn es sie nicht (mehr) gibt */
  dismiss(id: number, now = this.now()): boolean {
    return this.db.prepare('UPDATE notifications SET dismissed_at = COALESCE(dismissed_at, ?) WHERE id = ?').run(nowIso(now), id).changes > 0;
  }

  /** Löscht ausgeblendete und gelesene Meldungen, die älter als `days` sind. */
  pruneOlderThan(days: number, now = this.now()): number {
    const cutoff = nowIso(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
    return this.db
      .prepare('DELETE FROM notifications WHERE COALESCE(dismissed_at, read_at) IS NOT NULL AND COALESCE(dismissed_at, read_at) < ?')
      .run(cutoff).changes;
  }
}

function toNotification(row: NotificationRow): Notification {
  let links: NotificationLink[] = [];
  try {
    links = JSON.parse(row.links) as NotificationLink[];
  } catch {
    /* ungültige Links ignorieren */
  }
  return {
    id: row.id,
    key: row.key,
    level: row.level,
    title: row.title,
    message: row.message,
    links,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}
