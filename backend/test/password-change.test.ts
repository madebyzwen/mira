import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../core/config.ts';
import type { Db } from '../core/db/database.ts';
import { ADMIN_PASSWORD, ADMIN_USER, login, loginCookie, sessionCookieOf, startApp, testConfig } from './helpers.ts';

let app: FastifyInstance;
let db: Db;
let config: AppConfig;

afterEach(async () => {
  await app?.close();
});

async function start() {
  config = testConfig();
  ({ app, db } = await startApp(config));
}

const NEW_PASSWORD = 'neues-sicheres-passwort-2026';

function change(cookie: string, body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/password', cookies: { mira_session: cookie }, payload: body });
}

function session(cookie: string) {
  return app.inject({ method: 'GET', url: '/api/v1/auth/session', cookies: { mira_session: cookie } });
}

function audit() {
  return db.prepare("SELECT action, result, actor, details FROM audit_log WHERE action LIKE 'auth.password%' OR action = 'auth.sessions_revoke' ORDER BY id").all() as {
    action: string;
    result: string;
    actor: string;
    details: string | null;
  }[];
}

describe('Passwort ändern (S-03)', () => {
  it('mit richtigem aktuellem Passwort: neuer Hash, alle Sessions beendet, neue Anmeldung nötig', async () => {
    await start();
    const here = await loginCookie(app);
    const otherDevice = await loginCookie(app);
    const hashBefore = (db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }).password_hash;

    const res = await change(here, { currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(204);
    // Cookie wird gelöscht
    expect(res.cookies.find((c) => c.name === 'mira_session')?.value).toBe('');

    // Alte Session und die Session des anderen Geräts sind ungültig
    expect((await session(here)).statusCode).toBe(401);
    expect((await session(otherDevice)).statusCode).toBe(401);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });

    // Neuer Hash im scrypt-Format, Passwort nirgends im Klartext
    const hashAfter = (db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }).password_hash;
    expect(hashAfter).not.toBe(hashBefore);
    expect(hashAfter).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(hashAfter).not.toContain(NEW_PASSWORD);

    // Altes Passwort gilt nicht mehr, neues schon
    expect((await login(app, ADMIN_USER, ADMIN_PASSWORD)).statusCode).toBe(401);
    const relogin = await login(app, ADMIN_USER, NEW_PASSWORD);
    expect(relogin.statusCode).toBe(200);
    expect((await session(sessionCookieOf(relogin)!)).statusCode).toBe(200);

    expect(audit()).toEqual([{ action: 'auth.password_change', result: 'success', actor: ADMIN_USER, details: JSON.stringify({ revokedSessions: 2 }) }]);
  });

  it('falsches aktuelles Passwort: 403, nichts geändert, Session bleibt gültig, Fehlversuch protokolliert', async () => {
    await start();
    const cookie = await loginCookie(app);
    const res = await change(cookie, { currentPassword: 'ganz-falsches-passwort', newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('invalid_credentials');
    expect((await session(cookie)).statusCode).toBe(200);
    expect((await login(app, ADMIN_USER, ADMIN_PASSWORD)).statusCode).toBe(200);
    expect(audit()).toEqual([
      { action: 'auth.password_change', result: 'failure', actor: ADMIN_USER, details: JSON.stringify({ reason: 'invalid_current_password' }) },
    ]);
  });

  it('wiederholt falsches aktuelles Passwort: Sperre wie bei der Anmeldung', async () => {
    await start();
    const cookie = await loginCookie(app);
    for (let i = 0; i < 5; i++) await change(cookie, { currentPassword: `falsch-${i}-xxxxxxxx`, newPassword: NEW_PASSWORD });
    const res = await change(cookie, { currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('ungültiges neues Passwort: zu kurz, nur Leerzeichen, gleich dem alten, fehlend', async () => {
    await start();
    const cookie = await loginCookie(app);
    for (const newPassword of ['kurz', ' '.repeat(20), ADMIN_PASSWORD, undefined, 'x'.repeat(1025)]) {
      const res = await change(cookie, { currentPassword: ADMIN_PASSWORD, newPassword });
      expect(res.statusCode, String(newPassword)).toBe(400);
      expect(res.json().error.code).toBe('validation_error');
    }
    expect((await session(cookie)).statusCode).toBe(200);
    expect((await login(app, ADMIN_USER, ADMIN_PASSWORD)).statusCode).toBe(200);
  });

  it('Passwörter erscheinen weder in Antworten noch im Audit-Log', async () => {
    await start();
    const cookie = await loginCookie(app);
    const bodies = [
      (await change(cookie, { currentPassword: 'geheim-falsch-123456', newPassword: 'kurz' })).body,
      (await change(cookie, { currentPassword: 'geheim-falsch-123456', newPassword: NEW_PASSWORD })).body,
      (await change(cookie, { currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD })).body,
    ];
    const everything = bodies.join('\n') + JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
    for (const secret of ['geheim-falsch-123456', NEW_PASSWORD, ADMIN_PASSWORD]) expect(everything).not.toContain(secret);
  });

  it('nur angemeldet', async () => {
    await start();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password', payload: { currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD } });
    expect(res.statusCode).toBe(401);
  });

  it('ein Neustart setzt das geänderte Passwort nicht auf das Startpasswort zurück', async () => {
    await start();
    const cookie = await loginCookie(app);
    expect((await change(cookie, { currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD })).statusCode).toBe(204);
    await app.close();

    // gleiche Daten, Startpasswort-Datei liegt weiterhin vor
    ({ app, db } = await startApp(config));
    expect((await login(app, ADMIN_USER, ADMIN_PASSWORD)).statusCode).toBe(401);
    expect((await login(app, ADMIN_USER, NEW_PASSWORD)).statusCode).toBe(200);
  });
});

describe('Alle Sitzungen beenden (S-03)', () => {
  it('beendet alle Sessions des eigenen Kontos – auch die aktuelle', async () => {
    await start();
    const here = await loginCookie(app);
    const other = await loginCookie(app);
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/sessions/revoke', cookies: { mira_session: here } });
    expect(res.statusCode).toBe(204);
    expect((await session(here)).statusCode).toBe(401);
    expect((await session(other)).statusCode).toBe(401);
    expect(audit()).toEqual([{ action: 'auth.sessions_revoke', result: 'success', actor: ADMIN_USER, details: JSON.stringify({ revokedSessions: 2 }) }]);
    // Passwort unverändert
    expect((await login(app, ADMIN_USER, ADMIN_PASSWORD)).statusCode).toBe(200);
  });
});
