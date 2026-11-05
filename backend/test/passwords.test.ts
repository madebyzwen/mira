import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../core/auth/passwords.ts';

describe('Passwort-Hashing', () => {
  it('verifiziert das richtige Passwort und lehnt falsche ab', async () => {
    const hash = await hashPassword('ein-sicheres-passwort');
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    expect(await verifyPassword('ein-sicheres-passwort', hash)).toBe(true);
    expect(await verifyPassword('ein-sicheres-Passwort', hash)).toBe(false);
  });

  it('erzeugt für dasselbe Passwort unterschiedliche Hashes (Salt)', async () => {
    expect(await hashPassword('gleich')).not.toBe(await hashPassword('gleich'));
  });

  it('lehnt unbekannte oder beschädigte Hash-Formate ab', async () => {
    expect(await verifyPassword('x', 'bcrypt$abc')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});
