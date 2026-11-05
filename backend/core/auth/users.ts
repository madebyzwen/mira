import fs from 'node:fs';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionUser } from '@mira/shared';
import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';
import { MIN_PASSWORD_LENGTH, hashPassword } from './passwords.ts';

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
}

export interface StoredUser extends SessionUser {
  passwordHash: string;
}

function toUser(row: UserRow): StoredUser {
  return { id: row.id, username: row.username, displayName: row.display_name, passwordHash: row.password_hash };
}

export class UserRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  count(): number {
    return this.db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users').get()!.n;
  }

  findByUsername(username: string): StoredUser | undefined {
    const row = this.db
      .prepare<[string], UserRow>('SELECT id, username, display_name, password_hash FROM users WHERE username = ?')
      .get(username);
    return row ? toUser(row) : undefined;
  }

  findById(id: number): StoredUser | undefined {
    const row = this.db
      .prepare<[number], UserRow>('SELECT id, username, display_name, password_hash FROM users WHERE id = ?')
      .get(id);
    return row ? toUser(row) : undefined;
  }

  create(username: string, displayName: string, passwordHash: string): StoredUser {
    const info = this.db
      .prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(username, displayName, passwordHash, nowIso());
    return { id: Number(info.lastInsertRowid), username, displayName, passwordHash };
  }

  touchLogin(id: number): void {
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), id);
  }
}

export interface BootstrapOptions {
  username?: string;
  displayName?: string;
  passwordFile?: string;
}

export type BootstrapResult = 'created' | 'existing' | 'not_configured';

/**
 * Legt beim allerersten Start das erste Konto an (kein Setup-Assistent).
 * Existiert bereits ein Benutzer, werden die Variablen ignoriert – das Passwort
 * wird also nie durch einen Neustart überschrieben.
 */
export async function bootstrapAdmin(
  users: UserRepository,
  options: BootstrapOptions,
  log: FastifyBaseLogger,
): Promise<BootstrapResult> {
  if (users.count() > 0) {
    if (options.username || options.passwordFile) {
      log.info('Benutzer vorhanden – MIRA_ADMIN_* wird ignoriert.');
    }
    return 'existing';
  }
  if (!options.username || !options.passwordFile) {
    log.warn('Noch kein Benutzer vorhanden. MIRA_ADMIN_USER und MIRA_ADMIN_PASSWORD_FILE setzen, um das erste Konto anzulegen.');
    return 'not_configured';
  }
  const password = fs.readFileSync(options.passwordFile, 'utf8').replace(/\r?\n$/, '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Das Startpasswort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  users.create(options.username, options.displayName ?? options.username, await hashPassword(password));
  log.info({ username: options.username }, 'Erstes Konto angelegt.');
  return 'created';
}
