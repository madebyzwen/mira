import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { testConfig } from './helpers.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

describe('Protokoll', () => {
  it('protokolliert lesende Abfragen nicht zeilenweise, ändernde Anfragen weiterhin', async () => {
    const lines: { msg?: string; req?: { method?: string; url?: string } }[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        for (const l of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(l));
        done();
      },
    });
    const { app } = await buildApp(testConfig(), { logger: { level: 'info', stream } });
    cleanup.push(() => app.close());
    await app.ready();
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/api/v1/systems' });
    await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'x', password: 'y' } });
    const incoming = lines.filter((l) => l.msg === 'incoming request').map((l) => `${l.req?.method} ${l.req?.url}`);
    expect(incoming).toEqual(['POST /api/v1/auth/login']);
  });
});
