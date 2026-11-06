import { describe, expect, it } from 'vitest';
import { loadConfig } from '../core/config.ts';

describe('Konfiguration', () => {
  it('behandelt leere Variablen (z. B. aus Portainer) als nicht gesetzt', () => {
    const config = loadConfig({
      MIRA_DATA_DIR: '/tmp/mira-test',
      MIRA_ADMIN_USER: '',
      MIRA_ADMIN_PASSWORD_FILE: ' ',
      MIRA_ODIN_API_URL: '',
      MIRA_ODIN_CERT_FINGERPRINT: '',
      MIRA_ODIN_TOKEN_FILE: '',
    });
    expect(config.admin).toEqual({ username: undefined, displayName: undefined, passwordFile: undefined });
    expect(config.odin).toEqual({ apiUrl: undefined, certFingerprint: undefined, tokenFile: undefined, pollSeconds: 2, offlineSeconds: 10 });
  });

  it('übernimmt gesetzte Odin-Werte', () => {
    const fingerprint = Array.from({ length: 32 }, () => 'AB').join(':');
    const config = loadConfig({ MIRA_ODIN_API_URL: 'https://192.0.2.10:8443', MIRA_ODIN_CERT_FINGERPRINT: fingerprint });
    expect(config.odin.apiUrl).toBe('https://192.0.2.10:8443');
    expect(config.odin.certFingerprint).toBe(fingerprint);
  });

  it('lehnt eine Odin-URL ohne HTTPS ab', () => {
    expect(() => loadConfig({ MIRA_ODIN_API_URL: 'http://192.0.2.10:8443' })).toThrow();
  });
});
