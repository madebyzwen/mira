import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, Host } from '@mira/odin-api';
import { historyResponseSchema, odinStatusResponseSchema, updateStatusResponseSchema } from '@mira/shared';
import { buildApp } from '../app.ts';
import { SystemsModule } from '../modules/systems/index.ts';
import { createFixtureRoot, fixtureAddresses, fixtureConfig, fixtureStatFs } from '../../odin-api/test/fixtureHost.ts';
import { testTls, type TestCertName } from '../../odin-api/test/tlsFixtures.ts';
import { loginCookie, testConfig } from './helpers.ts';

const TOKEN = 'odin-test-token-abcdefghijklmnopqrstuvwxyz0123456789';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

/** Startet die echte Odin-API gegen den nachgebildeten Odin. */
async function startOdin(options: { certName?: TestCertName; token?: string; version?: string } = {}) {
  const root = createFixtureRoot();
  const config = fixtureConfig(root);
  const { cert, key } = await testTls(options.certName ?? 'odin-sim');
  const app = buildServer({
    config,
    tls: { cert, key },
    tokenHash: createHash('sha256').update(options.token ?? TOKEN).digest('hex'),
    host: new Host(config, { statfs: fixtureStatFs, addresses: fixtureAddresses }),
    version: options.version,
    logger: false,
  });
  let requests = 0;
  let tlsConnections = 0;
  app.addHook('onRequest', async () => {
    requests += 1;
  });
  app.server.on('secureConnection', () => {
    tlsConnections += 1;
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = (app.server.address() as AddressInfo).port;
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await app.close();
    }
  };
  cleanup.push(close);
  return { port, close, requests: () => requests, tlsConnections: () => tlsConnections };
}

/** Startet MIRA mit Verbindung zur Odin-API. */
async function startMira(odin: { port: number; fingerprint?: string; token?: string; offlineSeconds?: number } | null) {
  const env: Record<string, string> = { MIRA_ODIN_POLL_SECONDS: '3600' };
  const config = testConfig(env);
  if (odin) {
    const tokenFile = path.join(config.dataDir, 'odin-token');
    fs.writeFileSync(tokenFile, `${odin.token ?? TOKEN}\n`);
    config.odin = {
      apiUrl: `https://127.0.0.1:${odin.port}`,
      certFingerprint: odin.fingerprint ?? (await testTls('odin-sim')).fingerprint256,
      tokenFile,
      pollSeconds: 3600,
      offlineSeconds: odin.offlineSeconds ?? 10,
    };
  }
  const systems = new SystemsModule();
  const { app } = await buildApp(config, { logger: false, modules: [systems] });
  await app.ready();
  cleanup.push(() => app.close());
  const cookie = await loginCookie(app);
  return { app, monitor: systems.monitor!, cookie };
}

async function odinStatus(app: FastifyInstance, cookie: string) {
  const res = await app.inject({ method: 'GET', url: '/api/v1/systems/odin', cookies: { mira_session: cookie } });
  expect(res.statusCode).toBe(200);
  return odinStatusResponseSchema.parse(res.json());
}

describe('Systeme › Odin', () => {
  it('ist ohne Anmeldung gesperrt', async () => {
    const { app } = await startMira(null);
    expect((await app.inject({ method: 'GET', url: '/api/v1/systems/odin' })).statusCode).toBe(401);
  });

  it('meldet „nicht konfiguriert“, wenn keine Verbindungsdaten hinterlegt sind', async () => {
    const { app, cookie } = await startMira(null);
    const status = await odinStatus(app, cookie);
    expect(status.connection.configured).toBe(false);
    expect(status.system.status).toMatchObject({ state: 'unknown', lastError: 'not_configured' });
  });

  it('liest Info und Messwerte über TLS mit festgelegtem Zertifikat und Token', async () => {
    const odin = await startOdin();
    const { app, monitor, cookie } = await startMira({ port: odin.port });
    await monitor.poll();
    const status = await odinStatus(app, cookie);
    expect(status.system.status.state).toBe('online');
    expect(status.system.status.lastSeenAt).not.toBeNull();
    expect(status.connection).toEqual({ configured: true, endpoint: `127.0.0.1:${odin.port}`, pollIntervalSeconds: 3600 });
    expect(status.info?.os.name).toBe('Ubuntu 26.04.1 LTS');
    expect(status.info?.cpu.performanceCores).toBe(2);
    expect(status.metrics?.temperatures.map((t) => t.label)).toEqual(['CPU', 'GPU', 'NVMe']);
    expect(status.metrics?.network.map((n) => n.label)).toEqual(['Server-VLAN', '10-GbE P2P']);
  });

  it('lehnt einen Server mit anderem Zertifikat ab – das Token wird nie gesendet', async () => {
    const odin = await startOdin({ certName: 'fremd' });
    const { app, monitor, cookie } = await startMira({ port: odin.port, fingerprint: (await testTls('odin-sim')).fingerprint256 });
    await monitor.poll();
    const status = await odinStatus(app, cookie);
    expect(status.system.status).toMatchObject({ state: 'offline', lastError: 'certificate_mismatch' });
    expect(status.metrics).toBeNull();
    expect(odin.requests()).toBe(0);
  });

  it('meldet ein abgelehntes Token', async () => {
    const odin = await startOdin({ token: 'ein-anderes-token' });
    const { app, monitor, cookie } = await startMira({ port: odin.port });
    await monitor.poll();
    expect((await odinStatus(app, cookie)).system.status).toMatchObject({ state: 'offline', lastError: 'unauthorized' });
  });

  it('wechselt erst nach Ablauf der Frist ohne Antwort auf „offline“ und behält die letzten Werte', async () => {
    const odin = await startOdin();
    const { app, monitor, cookie } = await startMira({ port: odin.port, offlineSeconds: 0.3 });
    await monitor.poll();
    const online = await odinStatus(app, cookie);
    expect(online.system.status.state).toBe('online');

    await odin.close();
    await monitor.poll();
    expect((await odinStatus(app, cookie)).system.status.state).toBe('online'); // kurzer Aussetzer ist noch kein Ausfall
    await new Promise((r) => setTimeout(r, 350));
    await monitor.poll();
    const offline = await odinStatus(app, cookie);
    expect(offline.system.status).toMatchObject({ state: 'offline', lastError: 'unreachable' });
    expect(offline.system.status.lastSeenAt).toBe(online.system.status.lastSeenAt);
    expect(offline.metrics).not.toBeNull();
  });

  it('listet die Systeme mit Zustand', async () => {
    const odin = await startOdin();
    const { app, monitor, cookie } = await startMira({ port: odin.port });
    await monitor.poll();
    const res = await app.inject({ method: 'GET', url: '/api/v1/systems', cookies: { mira_session: cookie } });
    expect(res.json().systems).toEqual([
      expect.objectContaining({ slug: 'odin', name: 'Odin', kind: 'server', description: 'KI-Server', status: expect.objectContaining({ state: 'online' }) }),
    ]);
  });

  it('hält die TLS-Verbindung offen und nutzt sie für jede Abfrage erneut', async () => {
    const odin = await startOdin();
    const { monitor } = await startMira({ port: odin.port });
    for (let i = 0; i < 3; i++) await monitor.poll();
    expect(odin.requests()).toBeGreaterThanOrEqual(4); // Info + 3 × Messwerte
    expect(odin.tlsConnections()).toBe(1);
  }, 15_000);

  it('übernimmt die Version der Odin-API für die Update-Prüfung (ohne Versionsmeldung: höchstens 0.1.3)', async () => {
    const odinApi = async (app: FastifyInstance, cookie: string) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/system/update', cookies: { mira_session: cookie } });
      return updateStatusResponseSchema.parse(res.json()).components.find((c) => c.component === 'odin-api');
    };
    const legacy = await startOdin();
    const a = await startMira({ port: legacy.port });
    await a.monitor.poll();
    expect(await odinApi(a.app, a.cookie)).toMatchObject({ installed: '0.1.3', installedAtMost: true });

    const current = await startOdin({ version: '0.1.4' });
    const b = await startMira({ port: current.port });
    await b.monitor.poll();
    expect(await odinApi(b.app, b.cookie)).toMatchObject({ installed: '0.1.4', installedAtMost: false });
  });

  it('liefert den Verlauf nur angemeldet und mit gültigem Zeitraum', async () => {
    const odin = await startOdin();
    const { app, monitor, cookie } = await startMira({ port: odin.port });
    await monitor.poll();
    const url = '/api/v1/systems/odin/history';
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `${url}?range=1y`, cookies: { mira_session: cookie } })).statusCode).toBe(400);

    const res = await app.inject({ method: 'GET', url: `${url}?range=7d`, cookies: { mira_session: cookie } });
    expect(res.statusCode).toBe(200);
    const body = historyResponseSchema.parse(res.json());
    expect(body).toMatchObject({ range: '7d', stepSeconds: 3600 });
    expect(body.points).toHaveLength(168);
  });
});
