import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startApp, tempDir, testConfig } from './helpers.ts';

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

function staticFixture(): string {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>MIRA</title>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-123.js'), 'console.log(1)');
  return dir;
}

describe('Auslieferung der Weboberfläche', () => {
  it('liefert index.html für App-Routen (Single-Page-App)', async () => {
    ({ app } = await startApp(testConfig({ MIRA_STATIC_DIR: staticFixture() })));
    for (const url of ['/', '/login', '/dashboard', '/systeme/odin', '/konfiguration/systeme']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toContain('<title>MIRA</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('cached gehashte Assets langfristig', async () => {
    ({ app } = await startApp(testConfig({ MIRA_STATIC_DIR: staticFixture() })));
    const res = await app.inject({ method: 'GET', url: '/assets/app-123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('liefert für API-Pfade kein index.html', async () => {
    ({ app } = await startApp(testConfig({ MIRA_STATIC_DIR: staticFixture() })));
    const res = await app.inject({ method: 'GET', url: '/api/v1/unbekannt' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('setzt Sicherheits-Header auf allen Antworten', async () => {
    ({ app } = await startApp(testConfig({ MIRA_STATIC_DIR: staticFixture() })));
    for (const url of ['/', '/health', '/api/v1/auth/session']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
      expect(res.headers['x-frame-options'], url).toBe('DENY');
      expect(res.headers['content-security-policy'], url).toContain("default-src 'self'");
    }
  });
});
