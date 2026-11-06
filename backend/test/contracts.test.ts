import { describe, expect, it } from 'vitest';
import { networkShareSchema } from '@mira/shared';

describe('API-Verträge', () => {
  it('akzeptiert Netzlaufwerke ohne Status (Odin-API ≤ 0.1.1) – MIRA bleibt mit älteren Odin-APIs verbunden', () => {
    const old = { mount: '/mnt/x', source: '//h/s', fsType: 'cifs', totalBytes: 1, usedBytes: 0 };
    expect(networkShareSchema.parse(old)).toEqual(old);
  });

  it('akzeptiert die Status-Werte der aktuellen Odin-API', () => {
    for (const state of ['mounted', 'automount', 'unmounted'] as const) {
      expect(networkShareSchema.parse({ mount: '/m', source: 's', fsType: 'nfs4', state, totalBytes: null, usedBytes: null }).state).toBe(state);
    }
  });
});
