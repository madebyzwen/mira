import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, readApiToken } from '../src/config.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelly-logger-config-'));
const file = (name: string, content: string) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, content);
  return f;
};
const TOKEN = 'a'.repeat(64);

describe('API-Token (S-06)', () => {
  it('ohne Angabe: kein Token, keine Sperre', () => {
    expect(readApiToken(undefined)).toEqual({});
  });

  it('liest das Token aus der Datei (Zeilenumbruch am Ende ist erlaubt)', () => {
    expect(readApiToken(file('ok.txt', `${TOKEN}\n`))).toEqual({ token: TOKEN });
  });

  it('fehlende, leere, zu kurze Datei oder Leerzeichen: Fehler statt Absturz', () => {
    expect(readApiToken(path.join(dir, 'fehlt.txt')).error).toMatch(/nicht lesbar \(ENOENT\)/);
    expect(readApiToken(file('leer.txt', '\n')).error).toMatch(/leer/);
    expect(readApiToken(file('kurz.txt', 'abc123')).error).toMatch(/zu kurz/);
    expect(readApiToken(file('zwei.txt', `${TOKEN}\n${TOKEN}\n`)).error).toMatch(/Leerzeichen/);
  });

  it('loadConfig startet auch bei fehlender Token-Datei (Messung läuft weiter, API gesperrt)', () => {
    const config = loadConfig({ LOGGER_SHELLY_URL: 'http://192.0.2.20', LOGGER_DATA_DIR: dir, LOGGER_API_TOKEN_FILE: path.join(dir, 'fehlt.txt') });
    expect(config.apiToken).toBeUndefined();
    expect(config.apiTokenError).toMatch(/nicht lesbar/);
  });

  it('loadConfig übernimmt ein gültiges Token', () => {
    const config = loadConfig({ LOGGER_SHELLY_URL: 'http://192.0.2.20', LOGGER_DATA_DIR: dir, LOGGER_API_TOKEN_FILE: file('api_token.txt', TOKEN) });
    expect(config).toMatchObject({ apiToken: TOKEN, apiTokenError: undefined });
  });
});
