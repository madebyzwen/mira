import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SessionStore } from '../core/auth/sessions.ts';
import type { Db } from '../core/db/database.ts';
import { ADMIN_PASSWORD, login, loginCookie, sessionCookieOf, startApp, testConfig } from './helpers.ts';

let app: FastifyInstance;
let db: Db;

async function start(env: Record<string, string> = {}) {
  ({ app, db } = await startApp(testConfig(env)));
}

afterEach(async () => {
  await app?.close();
});

function auditActions() {
  return db.prepare('SELECT action, result, actor FROM audit_log ORDER BY id').all();
}

describe('Zugriffsschutz', () => {
  it('lässt /health ohne Anmeldung zu', async () => {
    await start();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: 'test', database: 'ok' });
  });

  it('sperrt alle /api-Routen ohne Session – auch unbekannte', async () => {
    await start();
    for (const url of ['/api/v1/auth/session', '/api/v1/systems/odin', '/api/irgendwas']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'unauthorized', message: 'Anmeldung erforderlich.' } });
    }
  });

  it('lehnt ein ungültiges Session-Token ab', async () => {
    await start();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session', cookies: { mira_session: 'gefälscht' } });
    expect(res.statusCode).toBe(401);
  });

  it('liefert für angemeldete Benutzer bei unbekannten API-Routen 404 im einheitlichen Format', async () => {
    await start();
    const token = await loginCookie(app);
    const res = await app.inject({ method: 'GET', url: '/api/v1/gibtsnicht', cookies: { mira_session: token } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});

describe('Anmeldung', () => {
  it('meldet mit korrekten Daten an und setzt ein sicheres Cookie', async () => {
    await start();
    const res = await login(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { id: 1, username: 'sven', displayName: 'Sven' } });
    const cookie = res.cookies.find((c) => c.name === 'mira_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.path).toBe('/');
    expect(cookie.value.length).toBeGreaterThanOrEqual(40);
  });

  it('akzeptiert den Benutzernamen unabhängig von Groß-/Kleinschreibung', async () => {
    await start();
    expect((await login(app, 'SVEN')).statusCode).toBe(200);
  });

  it('speichert nur den Hash des Session-Tokens', async () => {
    await start();
    const token = await loginCookie(app);
    const rows = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lehnt falsches Passwort und unbekannte Benutzer gleich ab', async () => {
    await start();
    const wrong = await login(app, 'sven', 'falsch-falsch-falsch');
    const unknown = await login(app, 'mallory', ADMIN_PASSWORD);
    for (const res of [wrong, unknown]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('invalid_credentials');
      expect(sessionCookieOf(res)).toBeUndefined();
    }
  });

  it('validiert die Eingabe', async () => {
    await start();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('sperrt nach zu vielen Fehlversuchen – auch für das richtige Passwort', async () => {
    await start({ MIRA_LOGIN_MAX_FAILURES: '3' });
    for (let i = 0; i < 3; i += 1) expect((await login(app, 'sven', 'falsch-falsch-falsch')).statusCode).toBe(401);
    const blocked = await login(app);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('meldet ab und macht die Session ungültig', async () => {
    await start();
    const token = await loginCookie(app);
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', cookies: { mira_session: token } });
    expect(out.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/v1/auth/session', cookies: { mira_session: token } });
    expect(after.statusCode).toBe(401);
  });

  it('lehnt abgelaufene Sessions ab und entfernt sie', async () => {
    await start({ MIRA_SESSION_TTL_HOURS: '1' });
    const store = new SessionStore(db, 60 * 60 * 1000);
    const { token } = store.create(1, {}, new Date(Date.now() - 2 * 60 * 60 * 1000));
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session', cookies: { mira_session: token } });
    expect(res.statusCode).toBe(401);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });

  it('liefert den angemeldeten Benutzer über /auth/session', async () => {
    await start();
    const token = await loginCookie(app);
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session', cookies: { mira_session: token } });
    expect(res.json()).toEqual({ user: { id: 1, username: 'sven', displayName: 'Sven' } });
  });
});

describe('Audit-Log', () => {
  it('protokolliert Erfolg, Fehlversuch und Abmeldung', async () => {
    await start();
    await login(app, 'sven', 'falsch-falsch-falsch');
    const token = await loginCookie(app);
    await app.inject({ method: 'POST', url: '/api/v1/auth/logout', cookies: { mira_session: token } });
    expect(auditActions()).toEqual([
      { action: 'auth.login', result: 'failure', actor: 'sven' },
      { action: 'auth.login', result: 'success', actor: 'sven' },
      { action: 'auth.logout', result: 'success', actor: 'sven' },
    ]);
    const details = db.prepare("SELECT details FROM audit_log WHERE result = 'failure'").get() as { details: string };
    expect(details.details).not.toContain('falsch-falsch-falsch');
  });
});

describe('Cross-Site-Schutz', () => {
  it('weist ändernde Anfragen mit fremdem Origin ab', async () => {
    await start();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://boese.example', host: 'mira.local' },
      payload: { username: 'sven', password: ADMIN_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden_origin');
  });

  it('erlaubt Anfragen vom eigenen Origin', async () => {
    await start();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://mira.local', host: 'mira.local' },
      payload: { username: 'sven', password: ADMIN_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });
});
