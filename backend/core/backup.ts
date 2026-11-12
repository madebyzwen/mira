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
  /** Zusätzliche Kopie auf ein getrenntes Ziel (`MIRA_BACKUP_COPY_DIR`), falls eingerichtet */
  copy?: { file: string; removed: string[] } | { error: string };
}

export interface BackupOptions {
  /** Getrenntes Speicherziel (z. B. anderes Volume) für eine zweite Kopie */
  copyDir?: string;
}

/**
 * Prüft eine Sicherungsdatei: vollständig lesbar (`PRAGMA integrity_check`) und eine
 * MIRA-Datenbank (Migrationsstand vorhanden). Wirft bei einem Fehler.
 */
export function verifyBackup(file: string): void {
  const copy = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = copy.pragma('integrity_check') as { integrity_check: string }[];
    if (result.length !== 1 || result[0].integrity_check !== 'ok') {
      throw new Error(`Integritätsprüfung fehlgeschlagen: ${result.map((r) => r.integrity_check).join('; ').slice(0, 500)}`);
    }
    const migrations = copy.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM schema_migrations WHERE module = 'core'").get();
    if (!migrations || migrations.n < 1) throw new Error('Sicherung enthält keinen Migrationsstand von MIRA');
  } finally {
    copy.close();
  }
}

/** Nur die neuesten `keep` Sicherungen (nach Dateiname) in `dir` behalten. */
function rotate(dir: string, keep: number): string[] {
  const backups = fs
    .readdirSync(dir)
    .filter((f) => PATTERN.test(f))
    .sort()
    .reverse();
  const removed = backups.slice(keep);
  for (const f of removed) fs.rmSync(path.join(dir, f), { force: true });
  return removed;
}

/** Geprüfte Sicherung atomar (temporäre Datei + Umbenennen) in ein zweites Verzeichnis kopieren. */
function copyTo(file: string, dir: string, keep: number): { file: string; removed: string[] } {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, path.basename(file));
  const tmp = `${target}.tmp`;
  try {
    fs.copyFileSync(file, tmp);
    verifyBackup(tmp);
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return { file: target, removed: rotate(dir, keep) };
}

/**
 * Sichert die Datenbank konsistent – auch im laufenden Betrieb (SQLite-Backup-API,
 * WAL-sicher) – nach `<dataDir>/backups/mira-JJJJ-MM-TT.db` und behält die
 * neuesten `keep` Sicherungen. Eine Sicherung desselben Tages wird ersetzt.
 *
 * Jede Sicherung wird vor dem Übernehmen geprüft (Integrität, Migrationsstand). Schlägt
 * etwas fehl, bleiben die vorhandenen Sicherungen unverändert und es wird nichts gelöscht.
 * Optional wird die geprüfte Datei zusätzlich auf ein getrenntes Ziel kopiert; ein Fehler
 * dort wird gemeldet, macht die lokale Sicherung aber nicht ungültig.
 */
export async function backupDatabase(db: Db, dataDir: string, keep: number, now = new Date(), options: BackupOptions = {}): Promise<BackupResult> {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `mira-${localDate(now)}.db`);
  const tmp = `${file}.tmp`;
  try {
    await db.backup(tmp);
    // Die Kopie übernimmt den WAL-Modus – auf DELETE umstellen, damit die
    // Sicherung eine einzelne, eigenständige Datei ist (Wiederherstellung = Datei kopieren).
    const copy = new Database(tmp);
    try {
      copy.pragma('journal_mode = DELETE');
    } finally {
      copy.close();
    }
    verifyBackup(tmp);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }

  const result: BackupResult = { file, bytes: fs.statSync(file).size, removed: rotate(dir, keep) };
  if (options.copyDir) {
    try {
      result.copy = copyTo(file, options.copyDir, keep);
    } catch (err) {
      result.copy = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return result;
}
