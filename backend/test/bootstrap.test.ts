import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../core/config.ts';
import { ADMIN_PASSWORD, login, loginCookie, startApp, tempDir, testConfig } from './helpers.ts';

describe('Erstes Konto und Persistenz', () => {
  it('legt beim ersten Start das Konto aus den Umgebungsvariablen an', async () => {
    const { app, db } = await startApp(testConfig());
    expect(db.prepare('SELECT username, display_name FROM users').all()).toEqual([{ username: 'sven', display_name: 'Sven' }]);
    expect(db.prepare('SELECT password_hash FROM users').get()).not.toEqual({ password_hash: ADMIN_PASSWORD });
    await app.close();
  });

  it('startet ohne Konto, wenn keine Variablen gesetzt sind – Anmeldung ist dann nicht möglich', async () => {
    const { app } = await startApp(loadConfig({ MIRA_DATA_DIR: tempDir() }, 'test'));
    expect((await login(app)).statusCode).toBe(401);
    await app.close();
  });

  it('verweigert ein zu kurzes Startpasswort', async () => {
    const config = testConfig();
    fs.writeFileSync(config.admin.passwordFile!, 'kurz');
    await expect(buildApp(config, { logger: false })).rejects.toThrow(/mindestens 12 Zeichen/);
  });

  it('überschreibt bei einem Neustart weder Konto noch Passwort und behält Sessions', async () => {
    const config = testConfig();
    const first = await startApp(config);
    const token = await loginCookie(first.app);
    await first.app.close();

    // „Neustart“ mit anderem Passwort in der Datei – darf nichts ändern
    fs.writeFileSync(config.admin.passwordFile!, 'ein-ganz-anderes-passwort');
    const second = await startApp(config);
    expect(second.db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
    expect((await login(second.app)).statusCode).toBe(200);
    const session = await second.app.inject({ method: 'GET', url: '/api/v1/auth/session', cookies: { mira_session: token } });
    expect(session.statusCode).toBe(200);
    expect(fs.existsSync(path.join(config.dataDir, 'mira.db'))).toBe(true);
    await second.app.close();
  });
});
