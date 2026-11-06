import { createHash } from 'node:crypto';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, normalizeAddress } from '../src/server.ts';
import { Host } from '../src/host.ts';
import { createFixtureRoot, fixtureAddresses, fixtureConfig, fixtureStatFs } from './fixtureHost.ts';
import { testTls } from './tlsFixtures.ts';

const TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuvwxyz';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(allowedClients = ['127.0.0.1']): Promise<number> {
  const root = createFixtureRoot();
  const config = fixtureConfig(root, { allowedClients });
  const { key, cert } = await testTls('odin-sim');
  app = buildServer({
    config,
    tls: { key, cert },
    tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
    host: new Host(config, { statfs: fixtureStatFs, addresses: fixtureAddresses }),
    logger: false,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  return (app.server.address() as AddressInfo).port;
}

async function get(port: number, path: string, token?: string): Promise<{ status: number; body: any }> {
  const { cert } = await testTls('odin-sim');
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: '127.0.0.1', port, path, ca: cert, checkServerIdentity: () => undefined, headers: token ? { authorization: `Bearer ${token}` } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Odin-API', () => {
  it('lehnt Anfragen ohne Token ab', async () => {
    const port = await start();
    const res = await get(port, '/v1/system/metrics');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('lehnt ein falsches Token ab', async () => {
    const port = await start();
    expect((await get(port, '/v1/health', 'falsch')).status).toBe(401);
  });

  it('liefert mit gültigem Token Health, Info und Messwerte', async () => {
    const port = await start();
    const health = await get(port, '/v1/health', TOKEN);
    expect(health.body).toEqual({ status: 'ok', apiVersion: '1', hostname: 'odin' });
    const info = await get(port, '/v1/system/info', TOKEN);
    expect(info.body.os.name).toBe('Ubuntu 26.04.1 LTS');
    const metrics = await get(port, '/v1/system/metrics', TOKEN);
    expect(metrics.status).toBe(200);
    expect(metrics.body.temperatures).toHaveLength(3);
  });

  it('kennt nur lesende Endpunkte', async () => {
    const port = await start();
    expect((await get(port, '/v1/power/suspend', TOKEN)).status).toBe(404);
  });

  it('trennt Verbindungen von nicht erlaubten Adressen vor dem TLS-Handshake', async () => {
    const port = await start(['10.9.9.9']);
    await expect(get(port, '/v1/health', TOKEN)).rejects.toThrow(/socket hang up|ECONNRESET|disconnected/i);
  });

  it('normalisiert IPv4-in-IPv6-Adressen', () => {
    expect(normalizeAddress('::ffff:192.0.2.20')).toBe('192.0.2.20');
    expect(normalizeAddress('192.0.2.20')).toBe('192.0.2.20');
  });
});

describe('Protokollierung', () => {
  it('protokolliert gültige Abfragen nicht, abgelehnte Anfragen aber schon – ohne Veraltungswarnung', async () => {
    const lines: { level: number; msg: string }[] = [];
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.message);
    process.on('warning', onWarning);
    const { Writable } = await import('node:stream');
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(JSON.parse(String(chunk)));
        cb();
      },
    });
    const root = createFixtureRoot();
    const config = fixtureConfig(root);
    const { key, cert } = await testTls('odin-sim');
    app = buildServer({
      config,
      tls: { key, cert },
      tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
      host: new Host(config, { statfs: fixtureStatFs, addresses: fixtureAddresses }),
      logger: { level: 'info', stream },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as AddressInfo).port;
    lines.length = 0;

    await get(port, '/v1/system/metrics', TOKEN);
    await get(port, '/v1/health', TOKEN);
    expect(lines.filter((l) => /request/.test(l.msg))).toEqual([]);

    await get(port, '/v1/health', 'falsch');
    expect(lines.some((l) => l.msg === 'Anfrage ohne gültiges Token')).toBe(true);
    process.off('warning', onWarning);
    expect(warnings.filter((w) => /disableRequestLogging/.test(w))).toEqual([]);
  });
});
