import { describe, expect, it } from 'vitest';
import { loadConfig } from '../core/config.ts';

describe('Konfiguration', () => {
  it('behandelt leere Variablen (z. B. aus Portainer) als nicht gesetzt', () => {
    const config = loadConfig({
      MIRA_DATA_DIR: '/tmp/mira-test',
      MIRA_ADMIN_USER: '',
      MIRA_ADMIN_PASSWORD_FILE: ' ',
      MIRA_AI_SERVER_NAME: '',
      MIRA_AI_SERVER_URL: '',
      MIRA_AI_SERVER_CERT_FINGERPRINT: '',
      MIRA_AI_SERVER_TOKEN_FILE: '',
    });
    expect(config.admin).toEqual({ username: undefined, displayName: undefined, passwordFile: undefined });
    expect(config.aiServer).toEqual({
      name: undefined,
      url: undefined,
      certFingerprint: undefined,
      tokenFile: undefined,
      pollSeconds: 2,
      offlineSeconds: 10,
    });
  });

  it('übernimmt gesetzte Werte des KI-Servers', () => {
    const fingerprint = Array.from({ length: 32 }, () => 'AB').join(':');
    const config = loadConfig({
      MIRA_AI_SERVER_NAME: ' Walhall ',
      MIRA_AI_SERVER_URL: 'https://192.0.2.10:8443',
      MIRA_AI_SERVER_CERT_FINGERPRINT: fingerprint,
    });
    expect(config.aiServer.name).toBe('Walhall');
    expect(config.aiServer.url).toBe('https://192.0.2.10:8443');
    expect(config.aiServer.certFingerprint).toBe(fingerprint);
  });

  it('lehnt eine Agent-URL ohne HTTPS ab', () => {
    expect(() => loadConfig({ MIRA_AI_SERVER_URL: 'http://192.0.2.10:8443' })).toThrow();
  });

  it('lehnt zu lange Namen und Steuerzeichen im Namen ab', () => {
    expect(() => loadConfig({ MIRA_AI_SERVER_NAME: 'x'.repeat(33) })).toThrow();
    expect(() => loadConfig({ MIRA_AI_SERVER_NAME: 'Wal\nhall' })).toThrow();
  });

  it('HTTPS-Pflicht: öffentliche Adresse nur als https-Origin, nur mit konkretem Proxy-Vertrauen', () => {
    const ok = loadConfig({ MIRA_PUBLIC_URL: 'https://mira.example.org', MIRA_TRUST_PROXY: '172.20.0.5' });
    expect(ok).toMatchObject({ publicOrigin: 'https://mira.example.org', cookieSecure: true, trustProxy: '172.20.0.5' });
    expect(ok.warnings).toEqual([]);
    expect(loadConfig({ MIRA_PUBLIC_URL: 'https://mira.example.org/', MIRA_TRUST_PROXY: '172.20.0.5' }).publicOrigin).toBe('https://mira.example.org');
    expect(() => loadConfig({ MIRA_PUBLIC_URL: 'http://mira.example.org', MIRA_TRUST_PROXY: '172.20.0.5' })).toThrow();
    expect(() => loadConfig({ MIRA_PUBLIC_URL: 'https://mira.example.org/mira', MIRA_TRUST_PROXY: '172.20.0.5' })).toThrow(/kein Pfad/);
    expect(() => loadConfig({ MIRA_PUBLIC_URL: 'https://mira.example.org' })).toThrow(/MIRA_TRUST_PROXY/);
    expect(() => loadConfig({ MIRA_PUBLIC_URL: 'https://mira.example.org', MIRA_TRUST_PROXY: 'true' })).toThrow(/nicht zulässig/);
    expect(() => loadConfig({ MIRA_PUBLIC_URL: 'https://mira.example.org', MIRA_TRUST_PROXY: '172.20.0.5', MIRA_COOKIE_SECURE: 'false' })).toThrow();
  });

  it('ohne öffentliche Adresse: bisheriges Verhalten mit Warnung', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ publicOrigin: undefined, cookieSecure: 'auto', trustProxy: false });
    expect(config.warnings).toEqual([expect.stringContaining('HTTPS wird nicht erzwungen')]);
  });

  it('MIRA_TRUST_PROXY: prüft Adressen und Netze und warnt bei großen Netzen', () => {
    expect(loadConfig({ MIRA_TRUST_PROXY: ' 10.10.0.1 , 172.20.0.0/28 ' }).trustProxy).toBe('10.10.0.1,172.20.0.0/28');
    expect(loadConfig({ MIRA_TRUST_PROXY: 'fd00::5' }).trustProxy).toBe('fd00::5');
    for (const bad of ['proxy', '172.20.0.0/33', '172.20.0.0/abc', '300.1.1.1', '10.0.0.1/8/1']) {
      expect(() => loadConfig({ MIRA_TRUST_PROXY: bad }), bad).toThrow(/MIRA_TRUST_PROXY/);
    }
    expect(loadConfig({ MIRA_TRUST_PROXY: '172.20.0.0/16' }).warnings).toContainEqual(expect.stringContaining('172.20.0.0/16 ist groß'));
    expect(loadConfig({ MIRA_TRUST_PROXY: '172.20.0.0/24' }).warnings.some((w) => w.includes('ist groß'))).toBe(false);
    expect(loadConfig({ MIRA_TRUST_PROXY: 'true' }).warnings).toContainEqual(expect.stringContaining('jedem Absender'));
  });
});
