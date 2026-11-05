import fsp from 'node:fs/promises';
import type { DiskUsage, NetworkShare } from '@mira/shared';
import { join, readText, unescapeMount } from './fsutil.ts';

export interface MountEntry {
  source: string;
  mount: string;
  fsType: string;
}

export function parseMounts(text: string): MountEntry[] {
  return text
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 3)
    .map(([source, mount, fsType]) => ({ source: unescapeMount(source), mount: unescapeMount(mount), fsType }));
}

export type StatFs = (path: string) => Promise<{ blocks: number; bfree: number; bsize: number }>;

const defaultStatFs: StatFs = async (p) => {
  const s = await fsp.statfs(p);
  return { blocks: Number(s.blocks), bfree: Number(s.bfree), bsize: Number(s.bsize) };
};

const NETWORK_FS = new Set(['nfs', 'nfs4', 'cifs', 'smb3', 'smbfs']);

/** statfs mit Zeitlimit – ein hängendes Netzlaufwerk darf die API nicht blockieren. */
async function statWithTimeout(statfs: StatFs, mount: string, ms: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([statfs(mount).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readStorage(
  procRoot: string,
  disks: { mount: string; label: string }[],
  statfs: StatFs = defaultStatFs,
): Promise<{ disks: DiskUsage[]; networkShares: NetworkShare[] }> {
  const mounts = parseMounts((await readText(join(procRoot, 'mounts'))) ?? '');
  const lastEntry = (mount: string) => [...mounts].reverse().find((m) => m.mount === mount);

  const diskResults: DiskUsage[] = [];
  for (const d of disks) {
    const s = await statWithTimeout(statfs, d.mount, 1500);
    if (!s) continue;
    const entry = lastEntry(d.mount);
    diskResults.push({
      mount: d.mount,
      label: d.label,
      device: entry?.source ?? null,
      fsType: entry?.fsType ?? null,
      totalBytes: s.blocks * s.bsize,
      usedBytes: (s.blocks - s.bfree) * s.bsize,
    });
  }

  const shares: NetworkShare[] = [];
  for (const m of mounts.filter((e) => NETWORK_FS.has(e.fsType))) {
    const s = await statWithTimeout(statfs, m.mount, 1500);
    shares.push({
      mount: m.mount,
      source: m.source,
      fsType: m.fsType,
      totalBytes: s ? s.blocks * s.bsize : null,
      usedBytes: s ? (s.blocks - s.bfree) * s.bsize : null,
    });
  }

  return { disks: diskResults, networkShares: shares };
}
