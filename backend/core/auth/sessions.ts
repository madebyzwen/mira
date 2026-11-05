import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';

export const SESSION_COOKIE = 'mira_session';

/** Erneuerung des Ablaufzeitpunkts höchstens alle 5 Minuten, um Schreibzugriffe zu begrenzen. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

interface SessionRow {
  id: number;
  user_id: number;
  last_seen_at: string;
  expires_at: string;
}

export interface ActiveSession {
  id: number;
  userId: number;
  /** true, wenn der Ablaufzeitpunkt gerade verlängert wurde (Cookie neu setzen) */
  renewed: boolean;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Serverseitige Sessions. Der Browser erhält nur ein zufälliges Token im
 * HttpOnly-Cookie; in der Datenbank liegt ausschließlich dessen SHA-256-Hash.
 * Die Gültigkeit verlängert sich bei Nutzung (gleitender Ablauf).
 */
export class SessionStore {
  private readonly db: Db;
  private readonly ttlMs: number;

  constructor(db: Db, ttlMs: number) {
    this.db = db;
    this.ttlMs = ttlMs;
  }

  create(userId: number, meta: { ip?: string; userAgent?: string } = {}, now = new Date()): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    this.db
      .prepare(
        'INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(userId, hashToken(token), nowIso(now), nowIso(now), nowIso(expiresAt), meta.ip ?? null, meta.userAgent?.slice(0, 255) ?? null);
    return { token, expiresAt };
  }

  /** Prüft ein Token und verlängert die Session. Abgelaufene Sessions werden gelöscht. */
  validate(token: string, now = new Date()): ActiveSession | undefined {
    const row = this.db
      .prepare<[string], SessionRow>('SELECT id, user_id, last_seen_at, expires_at FROM sessions WHERE token_hash = ?')
      .get(hashToken(token));
    if (!row) return undefined;
    if (new Date(row.expires_at) <= now) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
      return undefined;
    }
    const renewed = now.getTime() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS;
    if (renewed) {
      this.db
        .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
        .run(nowIso(now), nowIso(new Date(now.getTime() + this.ttlMs)), row.id);
    }
    return { id: row.id, userId: row.user_id, renewed };
  }

  revoke(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  pruneExpired(now = new Date()): number {
    return this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso(now)).changes;
  }
}
