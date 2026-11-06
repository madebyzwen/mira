import fsp from 'node:fs/promises';
import type { DiskUsage, NetworkShare } from '@mira/shared';
import { join, readText, unescapeMount } from './fsutil.ts';

const NETWORK_FS = new Set(['nfs', 'nfs4', 'cifs', 'smb3', 'smbfs']);

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

export interface FstabEntry extends MountEntry {
  automount: boolean;
}

/** Netzlaufwerke aus /etc/fstab (nur lesen – Zugangsdaten-Dateien werden nicht angefasst). */
export function parseFstabNetworkShares(text: string): FstabEntry[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 3 && NETWORK_FS.has(p[2]))
    .map(([source, mount, fsType, options = '']) => ({
      source: unescapeMount(source),
      mount: unescapeMount(mount),
      fsType,
      automount: options.split(',').includes('x-systemd.automount'),
    }));
}

export type StatFs = (path: string) => Promise<{ blocks: number; bfree: number; bsize: number }>;

const defaultStatFs: StatFs = async (p) => {
  const s = await fsp.statfs(p);
  return { blocks: Number(s.blocks), bfree: Number(s.bfree), bsize: Number(s.bsize) };
};

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
  etcRoot?: string,
): Promise<{ disks: DiskUsage[]; networkShares: NetworkShare[] }> {
  const mounts = parseMounts((await readText(join(procRoot, 'mounts'))) ?? '');
  const fstab = etcRoot ? parseFstabNetworkShares((await readText(join(etcRoot, 'fstab'))) ?? '') : [];
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

  // Netzlaufwerke: eingehängte (aus /proc/mounts) plus in /etc/fstab eingetragene.
  // Wartende Automounts werden bewusst NICHT abgefragt – statfs würde sie einhängen.
  const mounted = new Map(mounts.filter((e) => NETWORK_FS.has(e.fsType)).map((e) => [e.mount, e]));
  const autofs = new Set(mounts.filter((e) => e.fsType === 'autofs').map((e) => e.mount));
  const mountPoints = [...new Set([...fstab.map((f) => f.mount), ...mounted.keys()])];

  const shares: NetworkShare[] = [];
  for (const mount of mountPoints) {
    const active = mounted.get(mount);
    const configured = fstab.find((f) => f.mount === mount);
    if (active) {
      const s = await statWithTimeout(statfs, mount, 1500);
      shares.push({
        mount,
        source: active.source,
        fsType: active.fsType,
        state: 'mounted',
        totalBytes: s ? s.blocks * s.bsize : null,
        usedBytes: s ? (s.blocks - s.bfree) * s.bsize : null,
      });
    } else if (configured) {
      shares.push({
        mount,
        source: configured.source,
        fsType: configured.fsType,
        state: configured.automount && autofs.has(mount) ? 'automount' : 'unmounted',
        totalBytes: null,
        usedBytes: null,
      });
    }
  }

  return { disks: diskResults, networkShares: shares };
}
