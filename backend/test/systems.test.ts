import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, Host } from '@mira/odin-api';
import { historyResponseSchema, aiServerStatusResponseSchema, updateStatusResponseSchema } from '@mira/shared';
import { buildApp } from '../app.ts';
import { SystemsModule } from '../modules/systems/index.ts';
import { createFixtureRoot, fixtureAddresses, fixtureConfig, fixtureStatFs } from '../../odin-api/test/fixtureHost.ts';
import { testTls, type TestCertName } from '../../odin-api/test/tlsFixtures.ts';
import { loginCookie, testConfig } from './helpers.ts';

const TOKEN = 'agent-test-token-abcdefghijklmnopqrstuvwxyz0123456789';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

/** Startet den echten Agent gegen einen nachgebildeten KI-Server. */
async function startAgent(options: { certName?: TestCertName; token?: string; version?: string } = {}) {
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

/** Startet MIRA mit Verbindung zum Agent. */
async function startMira(
  agent: { port: number; fingerprint?: string; token?: string; offlineSeconds?: number } | null,
  extraEnv: Record<string, string> = {},
) {
  const env: Record<string, string> = { MIRA_AI_SERVER_POLL_SECONDS: '3600', ...extraEnv };
  const config = testConfig(env);
  if (agent) {
    const tokenFile = path.join(config.dataDir, 'agent-token');
    fs.writeFileSync(tokenFile, `${agent.token ?? TOKEN}\n`);
    config.aiServer = {
      ...config.aiServer,
      url: `https://127.0.0.1:${agent.port}`,
      certFingerprint: agent.fingerprint ?? (await testTls('odin-sim')).fingerprint256,
      tokenFile,
      pollSeconds: 3600,
      offlineSeconds: agent.offlineSeconds ?? 10,
    };
  }
  const systems = new SystemsModule();
  const { app } = await buildApp(config, { logger: false, modules: [systems] });
  await app.ready();
  cleanup.push(() => app.close());
  const cookie = await loginCookie(app);
  return { app, monitor: systems.monitor!, cookie };
}

async function aiServerStatus(app: FastifyInstance, cookie: string) {
  const res = await app.inject({ method: 'GET', url: '/api/v1/systems/ai-server', cookies: { mira_session: cookie } });
  expect(res.statusCode).toBe(200);
  return aiServerStatusResponseSchema.parse(res.json());
}

describe('Systeme › KI-Server', () => {
  it('ist ohne Anmeldung gesperrt', async () => {
    const { app } = await startMira(null);
    expect((await app.inject({ method: 'GET', url: '/api/v1/systems/ai-server' })).statusCode).toBe(401);
  });

  it('meldet „nicht konfiguriert“, wenn keine Verbindungsdaten hinterlegt sind', async () => {
    const { app, cookie } = await startMira(null);
    const status = await aiServerStatus(app, cookie);
    expect(status.connection.configured).toBe(false);
    expect(status.system.status).toMatchObject({ state: 'unknown', lastError: 'not_configured' });
  });

  it('liest Info und Messwerte über TLS mit festgelegtem Zertifikat und Token', async () => {
    const agent = await startAgent();
    const { app, monitor, cookie } = await startMira({ port: agent.port });
    await monitor.poll();
    const status = await aiServerStatus(app, cookie);
    expect(status.system.status.state).toBe('online');
    expect(status.system.status.lastSeenAt).not.toBeNull();
    expect(status.connection).toEqual({ configured: true, endpoint: `127.0.0.1:${agent.port}`, pollIntervalSeconds: 3600 });
    expect(status.info?.os.name).toBe('Ubuntu 26.04.1 LTS');
    expect(status.info?.cpu.performanceCores).toBe(2);
    expect(status.metrics?.temperatures.map((t) => t.label)).toEqual(['CPU', 'GPU', 'NVMe']);
    expect(status.metrics?.network.map((n) => n.label)).toEqual(['Server-VLAN', '10-GbE P2P']);
  });

  it('lehnt einen Server mit anderem Zertifikat ab – das Token wird nie gesendet', async () => {
    const agent = await startAgent({ certName: 'fremd' });
    const { app, monitor, cookie } = await startMira({ port: agent.port, fingerprint: (await testTls('odin-sim')).fingerprint256 });
    await monitor.poll();
    const status = await aiServerStatus(app, cookie);
    expect(status.system.status).toMatchObject({ state: 'offline', lastError: 'certificate_mismatch' });
    expect(status.metrics).toBeNull();
    expect(agent.requests()).toBe(0);
  });

  it('meldet ein abgelehntes Token', async () => {
    const agent = await startAgent({ token: 'ein-anderes-token' });
    const { app, monitor, cookie } = await startMira({ port: agent.port });
    await monitor.poll();
    expect((await aiServerStatus(app, cookie)).system.status).toMatchObject({ state: 'offline', lastError: 'unauthorized' });
  });

  it('wechselt erst nach Ablauf der Frist ohne Antwort auf „offline“ und behält die letzten Werte', async () => {
    const agent = await startAgent();
    const { app, monitor, cookie } = await startMira({ port: agent.port, offlineSeconds: 0.3 });
    await monitor.poll();
    const online = await aiServerStatus(app, cookie);
    expect(online.system.status.state).toBe('online');

    await agent.close();
    await monitor.poll();
    expect((await aiServerStatus(app, cookie)).system.status.state).toBe('online'); // kurzer Aussetzer ist noch kein Ausfall
    await new Promise((r) => setTimeout(r, 350));
    await monitor.poll();
    const offline = await aiServerStatus(app, cookie);
    expect(offline.system.status).toMatchObject({ state: 'offline', lastError: 'unreachable' });
    expect(offline.system.status.lastSeenAt).toBe(online.system.status.lastSeenAt);
    expect(offline.metrics).not.toBeNull();
  });

  it('listet die Systeme mit Zustand', async () => {
    const agent = await startAgent();
    const { app, monitor, cookie } = await startMira({ port: agent.port });
    await monitor.poll();
    const res = await app.inject({ method: 'GET', url: '/api/v1/systems', cookies: { mira_session: cookie } });
    expect(res.json().systems).toEqual([
      expect.objectContaining({ slug: 'ai-server', name: 'KI-Server', kind: 'server', description: 'KI-Server', status: expect.objectContaining({ state: 'online' }) }),
    ]);
  });

  it('übernimmt den Namen des KI-Servers aus MIRA_AI_SERVER_NAME', async () => {
    const { app, cookie } = await startMira(null, { MIRA_AI_SERVER_NAME: '  Walhall ' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/systems', cookies: { mira_session: cookie } });
    expect(res.json().systems).toEqual([expect.objectContaining({ slug: 'ai-server', name: 'Walhall', description: 'KI-Server' })]);
    expect((await aiServerStatus(app, cookie)).system.name).toBe('Walhall');
  });

  it('hält die TLS-Verbindung offen und nutzt sie für jede Abfrage erneut', async () => {
    const agent = await startAgent();
    const { monitor } = await startMira({ port: agent.port });
    for (let i = 0; i < 3; i++) await monitor.poll();
    expect(agent.requests()).toBeGreaterThanOrEqual(4); // Info + 3 × Messwerte
    expect(agent.tlsConnections()).toBe(1);
  }, 15_000);

  it('übernimmt die Version des Agents für die Update-Prüfung (ohne Versionsmeldung: höchstens 0.1.3)', async () => {
    const agentUpdate = async (app: FastifyInstance, cookie: string) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/system/update', cookies: { mira_session: cookie } });
      return updateStatusResponseSchema.parse(res.json()).components.find((c) => c.component === 'agent');
    };
    const legacy = await startAgent();
    const a = await startMira({ port: legacy.port });
    await a.monitor.poll();
    expect(await agentUpdate(a.app, a.cookie)).toMatchObject({ installed: '0.1.3', installedAtMost: true });

    const current = await startAgent({ version: '0.1.4' });
    const b = await startMira({ port: current.port });
    await b.monitor.poll();
    expect(await agentUpdate(b.app, b.cookie)).toMatchObject({ installed: '0.1.4', installedAtMost: false });
  });

  it('liefert den Verlauf nur angemeldet und mit gültigem Zeitraum', async () => {
    const agent = await startAgent();
    const { app, monitor, cookie } = await startMira({ port: agent.port });
    await monitor.poll();
    const url = '/api/v1/systems/ai-server/history';
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `${url}?range=1y`, cookies: { mira_session: cookie } })).statusCode).toBe(400);

    const res = await app.inject({ method: 'GET', url: `${url}?range=7d`, cookies: { mira_session: cookie } });
    expect(res.statusCode).toBe(200);
    const body = historyResponseSchema.parse(res.json());
    expect(body).toMatchObject({ range: '7d', stepSeconds: 3600 });
    expect(body.points).toHaveLength(168);
  });
});
