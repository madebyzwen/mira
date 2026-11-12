import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { PASSWORD_MIN_LENGTH } from '@mira/shared';

/**
 * Passwort-Hashing mit scrypt (Node-Bordmittel, keine native Zusatzbibliothek).
 * Format: `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>` – Parameter werden
 * mitgespeichert, damit sie später erhöht werden können.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
export const MIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: 128 * N * r * 2 };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await derive(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Dummy-Hash, damit unbekannte Benutzernamen gleich lange brauchen wie falsche Passwörter. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
