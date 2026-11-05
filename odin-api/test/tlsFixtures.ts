import { X509Certificate } from 'node:crypto';
import selfsigned from 'selfsigned';

/**
 * Test-Zertifikate werden zur Laufzeit erzeugt – es liegen bewusst keine
 * privaten Schlüssel im (öffentlichen) Repository.
 *
 * - `odin-sim`: Zertifikat des simulierten Odin
 * - `fremd`:    anderes Zertifikat für den Test „falsches Zertifikat wird abgelehnt“
 */
export type TestCertName = 'odin-sim' | 'fremd';

export interface TestTls {
  cert: string;
  key: string;
  /** SHA-256-Fingerprint im OpenSSL-Format (AA:BB:…) */
  fingerprint256: string;
}

const cache = new Map<TestCertName, Promise<TestTls>>();

async function create(name: TestCertName): Promise<TestTls> {
  const pems = await selfsigned.generate([{ name: 'commonName', value: name }], {
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }],
  });
  return { cert: pems.cert, key: pems.private, fingerprint256: new X509Certificate(pems.cert).fingerprint256 };
}

export function testTls(name: TestCertName): Promise<TestTls> {
  let entry = cache.get(name);
  if (!entry) {
    entry = create(name);
    cache.set(name, entry);
  }
  return entry;
}
