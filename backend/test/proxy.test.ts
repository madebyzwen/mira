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
