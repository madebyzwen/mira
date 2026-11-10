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
});
