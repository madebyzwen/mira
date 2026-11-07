/** Minimaler Versionsvergleich für `X.Y.Z` (ohne Vorabversionen – die werden nicht gemeldet). */

export type Version = [number, number, number];

export function parseVersion(value: string | null | undefined): Version | null {
  const m = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(value ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `true`, wenn `candidate` echt neuer als `installed` ist; ungültige Versionen ergeben `false`. */
export function isNewer(candidate: string | null | undefined, installed: string | null | undefined): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
