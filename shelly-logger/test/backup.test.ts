import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Aggregator } from '../src/aggregator.ts';
import { Store, verifyBackup } from '../src/store.ts';

const TZ = 'Europe/Berlin';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-backup-'));

/** Datenbank mit einem geschriebenen Intervall */
function filledStore(dir: string) {
  const store = new Store(path.join(dir, 'shelly-logger.db'), TZ);
  const agg = new Aggregator({ store, timeZone: TZ, pollIntervalMs: 1000, staleAfterMs: 5000, maxPowerW: 3680 });
  const start = Date.parse('2026-11-10T10:00:00Z');
  for (let i = 0; i < 30; i++) agg.add({ ts: start + i * 1000, powerW: 360, voltageV: 230, currentA: 1.5, energyTotalWh: 100 + i * 0.1 });
  agg.flushAll();
  return store;
}

describe('Sicherung des Loggers (B-01)', () => {
  it('geprüfte Sicherung lässt sich wiederherstellen – Messwerte und Zählerstand bleiben', async () => {
    const dir = tmp();
    const store = filledStore(dir);
    const before = store.dailyEnergy('2026-11-10', '2026-11-11');
    const meter = store.meterState();
    const { file } = await store.backup(path.join(dir, 'backups'), 7, Date.parse('2026-11-10T03:45:00Z'));
    store.close();
    verifyBackup(file);

    // Wiederherstellen: Sicherung als shelly-logger.db in ein neues Datenverzeichnis
    const restoredDir = tmp();
    fs.copyFileSync(file, path.join(restoredDir, 'shelly-logger.db'));
    const restored = new Store(path.join(restoredDir, 'shelly-logger.db'), TZ);
    expect(restored.dailyEnergy('2026-11-10', '2026-11-11')).toEqual(before);
    expect(restored.meterState()).toEqual(meter);
    restored.close();
  });

  it('getrenntes Ziel: geprüfte Kopie mit eigener Aufbewahrung; ein Fehler dort lässt die lokale Sicherung gültig', async () => {
    const dir = tmp();
    const store = filledStore(dir);
    const copyDir = path.join(tmp(), 'nas-ziel');
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      const r = await store.backup(path.join(dir, 'backups'), 2, Date.parse(`${day}T10:00:00Z`), copyDir);
      expect(r.copy).toMatchObject({ file: path.join(copyDir, `shelly-logger-${day}.db`) });
    }
    expect(fs.readdirSync(copyDir).sort()).toEqual(['shelly-logger-2026-11-02.db', 'shelly-logger-2026-11-03.db']);

    const notADir = path.join(tmp(), 'datei');
    fs.writeFileSync(notADir, 'x');
    const r = await store.backup(path.join(dir, 'backups'), 2, Date.parse('2026-11-04T10:00:00Z'), notADir);
    expect(r.copy).toMatchObject({ error: expect.any(String) });
    verifyBackup(r.file);
    store.close();
  });

  it('fehlgeschlagene Sicherung: vorhandene Sicherungen bleiben, keine Reste', async () => {
    const dir = tmp();
    const store = filledStore(dir);
    await store.backup(path.join(dir, 'backups'), 7, Date.parse('2026-11-01T10:00:00Z'));
    store.close();
    await expect(store.backup(path.join(dir, 'backups'), 7, Date.parse('2026-11-02T10:00:00Z'))).rejects.toThrow();
    expect(fs.readdirSync(path.join(dir, 'backups'))).toEqual(['shelly-logger-2026-11-01.db']);
  });

  it('erkennt beschädigte Dateien', () => {
    const f = path.join(tmp(), 'kaputt.db');
    fs.writeFileSync(f, 'keine Datenbank'.repeat(100));
    expect(() => verifyBackup(f)).toThrow();
  });
});
