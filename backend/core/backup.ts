import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from './db/database.ts';

const PATTERN = /^mira-(\d{4}-\d{2}-\d{2})\.db$/;

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface BackupResult {
  file: string;
  bytes: number;
  removed: string[];
}

/**
 * Sichert die Datenbank konsistent – auch im laufenden Betrieb (SQLite-Backup-API,
 * WAL-sicher) – nach `<dataDir>/backups/mira-JJJJ-MM-TT.db` und behält die
 * neuesten `keep` Sicherungen. Eine Sicherung desselben Tages wird ersetzt.
 */
export async function backupDatabase(db: Db, dataDir: string, keep: number, now = new Date()): Promise<BackupResult> {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `mira-${localDate(now)}.db`);
  const tmp = `${file}.tmp`;
  await db.backup(tmp);
  // Die Kopie übernimmt den WAL-Modus – auf DELETE umstellen, damit die
  // Sicherung eine einzelne, eigenständige Datei ist (Wiederherstellung = Datei kopieren).
  const copy = new Database(tmp);
  try {
    copy.pragma('journal_mode = DELETE');
  } finally {
    copy.close();
  }
  fs.renameSync(tmp, file);

  const backups = fs
    .readdirSync(dir)
    .filter((f) => PATTERN.test(f))
    .sort()
    .reverse();
  const removed = backups.slice(keep);
  for (const f of removed) fs.rmSync(path.join(dir, f), { force: true });

  return { file, bytes: fs.statSync(file).size, removed };
}
