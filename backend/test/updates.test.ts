import { afterEach, describe, expect, it } from 'vitest';
import { notificationsResponseSchema, updateStatusResponseSchema, type UpdateCheckError } from '@mira/shared';
import { buildApp, type MiraApp } from '../app.ts';
import type { AppConfig } from '../core/config.ts';
import { parseRelease, UpdateCheckFailure, type LatestRelease } from '../core/updates/github.ts';
import { isNewer } from '../core/updates/semver.ts';
import { loginCookie, testConfig } from './helpers.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

const RELEASE_URL = 'https://github.com/madebyzwen/mira/releases/tag/v0.5.2';

function githubBody(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.5.2',
    draft: false,
    prerelease: false,
    published_at: '2026-11-12T08:00:00Z',
    html_url: RELEASE_URL,
    assets: [{ name: 'mira-odin-api-0.1.4.tar.gz' }, { name: 'mira-odin-api-0.1.4.tar.gz.sha256' }],
    ...overrides,
  };
}

/** Nachgebildetes GitHub: zählt Abfragen, liefert ein Release oder einen Fehler. */
function fakeGithub() {
  const gh = {
    calls: 0,
    release: parseRelease(githubBody()) as LatestRelease,
    failWith: null as UpdateCheckError | null,
    fetch: async (): Promise<LatestRelease> => {
      gh.calls += 1;
      if (gh.failWith) throw new UpdateCheckFailure(gh.failWith, 'Test');
      return gh.release;
    },
  };
  return gh;
}

/** Uhr in Ortszeit, damit Kalendertage unabhängig von der Zeitzone der Testumgebung sind. */
function clock(start = new Date(2026, 10, 12, 10, 0)) {
  const c = { current: start, now: () => c.current, advance: (ms: number) => (c.current = new Date(c.current.getTime() + ms)) };
  return c;
}

const HOUR = 60 * 60 * 1000;
const tick = () => new Promise((r) => setTimeout(r, 20));

interface Env {
  config?: AppConfig;
  version?: string;
  env?: Record<string, string>;
  gh?: ReturnType<typeof fakeGithub>;
  clk?: ReturnType<typeof clock>;
}

async function start({ config, version = '0.5.1', env = {}, gh = fakeGithub(), clk = clock() }: Env = {}) {
  const cfg = config ?? testConfig(env);
  cfg.version = version;
  const mira: MiraApp = await buildApp(cfg, { logger: false, modules: [], fetchRelease: gh.fetch, now: clk.now });
  await mira.app.ready();
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await mira.app.close();
    }
  };
  cleanup.push(close);
  const cookie = await loginCookie(mira.app);
  const req = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
    mira.app.inject({ method, url, cookies: { mira_session: cookie }, payload: payload as never });
  const list = async (refresh = false) => {
    const res = await req('GET', `/api/v1/notifications${refresh ? '?refresh=true' : ''}`);
    expect(res.statusCode).toBe(200);
    return notificationsResponseSchema.parse(res.json());
  };
  const status = async () => updateStatusResponseSchema.parse((await req('GET', '/api/v1/system/update')).json());
  return { ...mira, cfg, gh, clk, req, list, status, close };
}

describe('Update-Prüfung › GitHub-Antwort', () => {
  it('übernimmt Version, Odin-API-Paket, Datum und Link', () => {
    expect(parseRelease(githubBody())).toEqual({
      tag: 'v0.5.2',
      version: '0.5.2',
      odinApiVersion: '0.1.4',
      publishedAt: '2026-11-12T08:00:00Z',
      url: RELEASE_URL,
    });
  });

  it('lehnt Vorabversionen, Entwürfe, fremde Links und unerwartete Tags ab', () => {
    for (const bad of [{ prerelease: true }, { draft: true }, { html_url: 'https://example.com/x' }, { tag_name: 'v0.5' }, { tag_name: 'latest' }, { assets: 'x' }]) {
      expect(() => parseRelease(githubBody(bad))).toThrow(UpdateCheckFailure);
    }
  });

  it('kommt ohne Odin-API-Paket aus', () => {
    expect(parseRelease(githubBody({ assets: [] })).odinApiVersion).toBeNull();
  });

  it('vergleicht Versionen numerisch', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('0.5.1', '0.5.1')).toBe(false);
    expect(isNewer('0.5.0', '0.5.1')).toBe(false);
    expect(isNewer('0.5.2', 'test')).toBe(false);
  });
});

describe('Update-Prüfung › Zeitpunkte und Zählung', () => {
  it('prüft beim ersten Aufruf am Tag – weitere Aufrufe am selben Tag nicht', async () => {
    const m = await start();
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(1);

    m.clk.advance(5 * HOUR);
    await m.list(true);
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(1);

    m.clk.advance(10 * HOUR); // nächster Kalendertag
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(2);
  });

  it('das regelmäßige Abfragen der Glocke (ohne refresh) prüft nie', async () => {
    const m = await start();
    for (let i = 0; i < 3; i++) await m.list(false);
    await tick();
    expect(m.gh.calls).toBe(0);
  });

  it('zählt die tägliche Prüfung und die Aufruf-Prüfung getrennt (höchstens zwei am Tag)', async () => {
    const m = await start({ clk: clock(new Date(2026, 10, 12, 4, 0)) });
    await m.updates.checkScheduled();
    expect(m.gh.calls).toBe(1);
    m.clk.advance(14 * HOUR);
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(2);
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(2);
  });

  it('gleichzeitige Aufrufe lösen nur eine Prüfung aus', async () => {
    const m = await start();
    await Promise.all([m.list(true), m.list(true), m.list(true)]);
    await tick();
    expect(m.gh.calls).toBe(1);
  });

  it('merkt sich die Aufruf-Prüfung über einen Neustart hinweg', async () => {
    const gh = fakeGithub();
    const clk = clock();
    const first = await start({ gh, clk });
    await first.list(true);
    await tick();
    await first.close();

    const second = await start({ config: first.cfg, gh, clk });
    await second.list(true);
    await tick();
    expect(gh.calls).toBe(1);
  });

  it('auch ein fehlgeschlagener Versuch zählt als Prüfung des Tages', async () => {
    const m = await start();
    m.gh.failWith = 'unreachable';
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(1);
    expect((await m.status()).lastCheck).toMatchObject({ trigger: 'visit', ok: false, error: 'unreachable' });
    expect((await m.list()).notifications).toEqual([]);

    m.gh.failWith = null;
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(1);
  });

  it('Prüfung von Hand: höchstens einmal je Stunde, zählt nicht gegen die automatischen', async () => {
    const m = await start();
    const first = await m.req('POST', '/api/v1/system/update/check');
    expect(first.json()).toMatchObject({ performed: true, status: { lastCheck: { trigger: 'manual', ok: true } } });
    expect(m.gh.calls).toBe(1);

    const again = (await m.req('POST', '/api/v1/system/update/check')).json();
    expect(again.performed).toBe(false);
    expect(new Date(again.status.nextManualCheckAt).getTime()).toBe(m.clk.current.getTime() + HOUR);
    expect(m.gh.calls).toBe(1);

    // Die Aufruf-Prüfung des Tages steht trotzdem noch aus
    await m.list(true);
    await tick();
    expect(m.gh.calls).toBe(2);

    m.clk.advance(HOUR);
    expect((await m.req('POST', '/api/v1/system/update/check')).json().performed).toBe(true);
    expect(m.gh.calls).toBe(3);

    const audit = m.db.prepare("SELECT actor, result FROM audit_log WHERE action = 'update.check'").all();
    expect(audit).toEqual([
      { actor: 'sven', result: 'success' },
      { actor: 'sven', result: 'success' },
    ]);
  });

  it('abgeschaltet: keine Verbindung ins Internet', async () => {
    const m = await start({ env: { MIRA_UPDATE_CHECK: 'false' } });
    await m.list(true);
    await tick();
    expect((await m.req('POST', '/api/v1/system/update/check')).json().performed).toBe(false);
    expect(await m.updates.checkScheduled()).toBeNull();
    expect(m.gh.calls).toBe(0);
    expect((await m.status()).enabled).toBe(false);
  });
});

describe('Update-Prüfung › Meldungen', () => {
  it('meldet eine neuere MIRA-Version einmal – erneute Prüfung ändert nichts am Lesestatus', async () => {
    const m = await start();
    await m.updates.checkScheduled();
    let list = await m.list();
    expect(list.unread).toBe(1);
    expect(list.notifications[0]).toMatchObject({
      key: 'update:mira',
      title: 'MIRA 0.5.2 verfügbar',
      readAt: null,
      links: [{ label: 'Release-Notes auf GitHub', url: RELEASE_URL }],
    });
    expect(list.notifications[0].message).toContain('Installiert: 0.5.1 · veröffentlicht am 12.11.2026');

    expect((await m.req('POST', '/api/v1/notifications/read', {})).statusCode).toBe(204);
    m.clk.advance(24 * HOUR);
    await m.updates.checkScheduled();
    list = await m.list();
    expect(list.unread).toBe(0);
    expect(list.notifications).toHaveLength(1);
  });

  it('eine neuere Version ersetzt die ältere Meldung und ist wieder ungelesen', async () => {
    const m = await start();
    await m.updates.checkScheduled();
    await m.req('POST', '/api/v1/notifications/read', {});
    m.gh.release = parseRelease(githubBody({ tag_name: 'v0.5.3', html_url: 'https://github.com/madebyzwen/mira/releases/tag/v0.5.3' }));
    m.clk.advance(24 * HOUR);
    await m.updates.checkScheduled();
    const list = await m.list();
    expect(list.unread).toBe(1);
    expect(list.notifications.map((n) => n.title)).toEqual(['MIRA 0.5.3 verfügbar']);
  });

  it('meldet nichts, wenn MIRA aktuell oder neuer ist', async () => {
    for (const version of ['0.5.2', '0.6.0']) {
      const m = await start({ version });
      await m.updates.checkScheduled();
      expect((await m.list()).notifications.filter((n) => n.key === 'update:mira')).toEqual([]);
    }
  });

  it('entfernt die Meldung nach dem Update beim Start – ohne Abfrage bei GitHub', async () => {
    const gh = fakeGithub();
    const old = await start({ gh });
    await old.updates.checkScheduled();
    expect((await old.list()).unread).toBe(1);
    await old.close();

    const updated = await start({ config: old.cfg, version: '0.5.2', gh });
    expect((await updated.list()).notifications).toEqual([]);
    expect(gh.calls).toBe(1);
    expect((await updated.status()).components[0]).toMatchObject({ installed: '0.5.2', latest: '0.5.2', updateAvailable: false });
  });

  it('Odin-API ohne Versionsmeldung (≤ 0.1.3) erhält einen Hinweis; nach dem Update verschwindet er sofort', async () => {
    const m = await start({ version: '0.5.2' });
    await m.updates.checkScheduled();
    expect((await m.list()).notifications).toEqual([]); // Odin noch nie erreicht

    m.updates.reportOdinApiVersion(null);
    let list = await m.list();
    expect(list.notifications).toHaveLength(1);
    expect(list.notifications[0]).toMatchObject({ key: 'update:odin-api', title: 'Odin-API 0.1.4 verfügbar' });
    expect(list.notifications[0].message).toContain('Installiert auf Odin: 0.1.3 oder älter');
    expect(list.notifications[0].links.map((l) => l.label)).toEqual(['Release auf GitHub', 'Anleitung']);

    m.updates.reportOdinApiVersion('0.1.4');
    list = await m.list();
    expect(list.notifications).toEqual([]);
    expect(m.gh.calls).toBe(1);
    expect((await m.status()).components[1]).toMatchObject({ component: 'odin-api', installed: '0.1.4', installedAtMost: false, updateAvailable: false });
  });

  it('meldet beide Komponenten getrennt', async () => {
    const m = await start();
    m.updates.reportOdinApiVersion('0.1.3');
    await m.updates.checkScheduled();
    const list = await m.list();
    expect(list.unread).toBe(2);
    expect(list.notifications.map((n) => n.key).sort()).toEqual(['update:mira', 'update:odin-api']);
  });

  it('ausblenden, gelesen markieren und nur angemeldet', async () => {
    const m = await start();
    await m.updates.checkScheduled();
    const [n] = (await m.list()).notifications;

    expect((await m.app.inject({ method: 'GET', url: '/api/v1/notifications' })).statusCode).toBe(401);
    expect((await m.app.inject({ method: 'GET', url: '/api/v1/system/update' })).statusCode).toBe(401);
    expect((await m.app.inject({ method: 'POST', url: '/api/v1/system/update/check' })).statusCode).toBe(401);

    expect((await m.req('POST', '/api/v1/notifications/read', { ids: [n.id] })).statusCode).toBe(204);
    expect((await m.list()).unread).toBe(0);

    expect((await m.req('DELETE', `/api/v1/notifications/${n.id}`)).statusCode).toBe(204);
    expect((await m.list()).notifications).toEqual([]);
    expect((await m.req('DELETE', '/api/v1/notifications/9999')).statusCode).toBe(404);

    // Ausgeblendet bleibt ausgeblendet, solange die Version gleich bleibt
    m.clk.advance(24 * HOUR);
    await m.updates.checkScheduled();
    expect((await m.list()).notifications).toEqual([]);
  });

  it('löscht gelesene bzw. ausgeblendete Meldungen nach 90 Tagen', async () => {
    const m = await start();
    await m.updates.checkScheduled();
    await m.req('POST', '/api/v1/notifications/read', {});
    expect(m.notifications.pruneOlderThan(90, new Date(m.clk.current.getTime() + 89 * 24 * HOUR))).toBe(0);
    expect(m.notifications.pruneOlderThan(90, new Date(m.clk.current.getTime() + 91 * 24 * HOUR))).toBe(1);
  });
});
