import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../core/db/database.ts';
import { ADMIN_PASSWORD, startApp, testConfig } from './helpers.ts';

let app: FastifyInstance;
let db: Db;

afterEach(async () => {
  await app?.close();
});

/** Anmeldung, wie sie hinter dem Reverse Proxy (NPM) ankommt. */
function loginViaProxy(remoteAddress: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress,
    headers: {
      host: 'mira.example.org',
      origin: 'https://mira.example.org',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'mira.example.org',
      'x-forwarded-for': '198.51.100.7',
    },
    payload: { username: 'sven', password: ADMIN_PASSWORD },
  });
}

describe('Betrieb hinter dem Reverse Proxy', () => {
  it('vertraut einem Proxy aus dem angegebenen Subnetz: Secure-Cookie und echte Client-IP', async () => {
    ({ app, db } = await startApp(testConfig({ MIRA_TRUST_PROXY: '172.20.0.0/16' })));
    const res = await loginViaProxy('172.20.0.5');
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === 'mira_session')?.secure).toBe(true);
    expect(db.prepare("SELECT ip FROM audit_log WHERE action = 'auth.login'").get()).toEqual({ ip: '198.51.100.7' });
  });

  it('ignoriert Weiterleitungs-Header von Adressen außerhalb des Subnetzes', async () => {
    ({ app, db } = await startApp(testConfig({ MIRA_TRUST_PROXY: '172.20.0.0/16' })));
    const res = await loginViaProxy('10.0.0.9');
    // Ohne Vertrauen kein HTTPS erkannt → kein Secure-Cookie, Audit mit der echten Absenderadresse
    expect(res.cookies.find((c) => c.name === 'mira_session')?.secure).toBeFalsy();
    expect(db.prepare("SELECT ip FROM audit_log WHERE action = 'auth.login'").get()).toEqual({ ip: '10.0.0.9' });
  });

  it('akzeptiert mehrere Einträge, durch Komma getrennt', async () => {
    ({ app, db } = await startApp(testConfig({ MIRA_TRUST_PROXY: '10.10.0.1, 172.20.0.0/16' })));
    const res = await loginViaProxy('172.20.0.5');
    expect(res.cookies.find((c) => c.name === 'mira_session')?.secure).toBe(true);
  });
});

const PUBLIC = 'https://mira.example.org';
const PROXY_IP = '172.20.0.5';
const httpsEnv = { MIRA_PUBLIC_URL: PUBLIC, MIRA_TRUST_PROXY: PROXY_IP };

/** Anfrage über den Reverse Proxy (HTTPS beim Browser, intern HTTP) */
function viaProxy(options: { method?: 'GET' | 'POST'; url: string; clientIp?: string; forwardedFor?: string; origin?: string | null; payload?: object; cookie?: string }) {
  return app.inject({
    method: options.method ?? 'GET',
    url: options.url,
    remoteAddress: PROXY_IP,
    headers: {
      host: 'mira.example.org',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': options.forwardedFor ?? options.clientIp ?? '198.51.100.7',
      ...(options.origin === null ? {} : { origin: options.origin ?? PUBLIC }),
    },
    cookies: options.cookie ? { mira_session: options.cookie } : undefined,
    payload: options.payload,
  });
}

/** Direkter Aufruf über die macvlan-Adresse (unverschlüsselt, ohne Proxy) */
function direct(method: 'GET' | 'POST', url: string, remoteAddress = '10.10.40.50', headers: Record<string, string> = {}, payload?: object) {
  return app.inject({ method, url, remoteAddress, headers: { host: '10.10.40.11', ...headers }, payload });
}

const credentials = { username: 'sven', password: ADMIN_PASSWORD };

describe('HTTPS-Pflicht (MIRA_PUBLIC_URL, S-01)', () => {
  it('Anmeldung über den Reverse Proxy: Secure, HttpOnly, SameSite=Strict und HSTS', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    const res = await viaProxy({ method: 'POST', url: '/api/v1/auth/login', payload: credentials });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'mira_session')!;
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict' });
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    const session = await viaProxy({ url: '/api/v1/auth/session', cookie: cookie.value });
    expect(session.statusCode).toBe(200);
  });

  it('direkter HTTP-Aufruf der Oberfläche wird auf HTTPS umgeleitet – das Anmeldeformular kommt nie über HTTP', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    for (const [url, target] of [
      ['/', `${PUBLIC}/`],
      ['/login', `${PUBLIC}/login`],
      ['/systeme/shelly-plug?range=24h', `${PUBLIC}/systeme/shelly-plug?range=24h`],
      ['//evil.example', `${PUBLIC}//evil.example`],
    ]) {
      const res = await direct('GET', url);
      expect(res.statusCode, url).toBe(308);
      expect(res.headers.location, url).toBe(target);
    }
  });

  it('Anmeldung über direktes HTTP wird ohne Verarbeitung abgelehnt und protokolliert', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    const res = await direct('POST', '/api/v1/auth/login', '10.10.40.50', { 'content-type': 'application/json' }, credentials);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'https_required', details: { url: PUBLIC } });
    expect(res.cookies).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT action, result, ip FROM audit_log').all()).toEqual([{ action: 'auth.insecure_transport', result: 'failure', ip: '10.10.40.50' }]);
    // Das Passwort taucht nirgends auf
    expect(JSON.stringify(db.prepare('SELECT * FROM audit_log').all())).not.toContain(ADMIN_PASSWORD);
  });

  it('auch mit gültigem Session-Cookie keine API über HTTP', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    const login = await viaProxy({ method: 'POST', url: '/api/v1/auth/login', payload: credentials });
    const token = login.cookies.find((c) => c.name === 'mira_session')!.value;
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session', remoteAddress: '10.10.40.50', cookies: { mira_session: token } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('https_required');
  });

  it('ein nicht vertrauenswürdiger Container kann HTTPS nicht vortäuschen', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '172.20.0.9', // anderer Container im Proxy-Netz
      headers: { host: 'mira.example.org', origin: PUBLIC, 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.7' },
      payload: credentials,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('https_required');
  });

  it('/health bleibt über HTTP erreichbar (Docker-Healthcheck)', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    const res = await app.inject({ method: 'GET', url: '/health', remoteAddress: '127.0.0.1' });
    expect(res.statusCode).toBe(200);
  });

  it('Origin muss exakt der HTTPS-Adresse entsprechen – gleiches Protokoll, gleicher Host, gleicher Port', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    for (const origin of ['http://mira.example.org', 'https://mira.example.org:8443', 'https://evil.example', 'null']) {
      const res = await viaProxy({ method: 'POST', url: '/api/v1/auth/login', origin, payload: credentials });
      expect(res.statusCode, origin).toBe(403);
      expect(res.json().error.code, origin).toBe('forbidden_origin');
    }
    // API-Aufrufe ohne Origin (z. B. curl) bleiben möglich
    expect((await viaProxy({ method: 'POST', url: '/api/v1/auth/login', origin: null, payload: credentials })).statusCode).toBe(200);
  });

  it('vom Client mitgeschickte X-Forwarded-For-Einträge ändern die erkannte Adresse nicht', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    // Der Client setzt selbst „203.0.113.66“, der Proxy hängt die echte Adresse an
    await viaProxy({ method: 'POST', url: '/api/v1/auth/login', forwardedFor: '203.0.113.66, 198.51.100.7', payload: credentials });
    expect(db.prepare("SELECT ip FROM audit_log WHERE action = 'auth.login'").get()).toEqual({ ip: '198.51.100.7' });
  });

  it('Login-Sperre gilt für die echte Client-Adresse hinter dem Proxy – andere Clients bleiben unberührt', async () => {
    ({ app, db } = await startApp(testConfig(httpsEnv)));
    for (let i = 0; i < 5; i++) {
      await viaProxy({ method: 'POST', url: '/api/v1/auth/login', clientIp: '198.51.100.20', payload: { username: `unbekannt${i}`, password: 'falsch-falsch-falsch' } });
    }
    const blocked = await viaProxy({ method: 'POST', url: '/api/v1/auth/login', clientIp: '198.51.100.20', payload: credentials });
    expect(blocked.statusCode).toBe(429);
    const other = await viaProxy({ method: 'POST', url: '/api/v1/auth/login', clientIp: '198.51.100.21', payload: credentials });
    expect(other.statusCode).toBe(200);
    const ips = db.prepare("SELECT DISTINCT ip FROM audit_log WHERE action = 'auth.login' ORDER BY ip").all();
    expect(ips).toEqual([{ ip: '198.51.100.20' }, { ip: '198.51.100.21' }]);
  });
});

describe('ohne MIRA_PUBLIC_URL (bisheriges Verhalten, Warnung)', () => {
  it('direkte Anmeldung über HTTP funktioniert weiter, aber die Glocke warnt', async () => {
    ({ app, db } = await startApp(testConfig()));
    const res = await direct('POST', '/api/v1/auth/login', '10.10.40.50', { 'content-type': 'application/json' }, credentials);
    expect(res.statusCode).toBe(200);
    const token = res.cookies.find((c) => c.name === 'mira_session')!.value;
    const bell = await app.inject({ method: 'GET', url: '/api/v1/notifications', cookies: { mira_session: token } });
    expect(bell.json().notifications).toEqual([expect.objectContaining({ level: 'warning', title: 'HTTPS wird nicht erzwungen' })]);
  });

  it('mit MIRA_PUBLIC_URL verschwindet die Warnung', async () => {
    const config = testConfig(httpsEnv);
    ({ app, db } = await startApp(config));
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE key = 'security:https'").get()).toEqual({ n: 0 });
  });

  it('Origin-Prüfung: fremder Host oder fremdes Schema wird abgelehnt', async () => {
    ({ app, db } = await startApp(testConfig()));
    for (const origin of ['http://evil.example', 'ftp://10.10.40.11']) {
      const res = await direct('POST', '/api/v1/auth/login', '10.10.40.50', { origin, 'content-type': 'application/json' }, credentials);
      expect(res.statusCode, origin).toBe(403);
    }
  });
});
