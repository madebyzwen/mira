import { join, readText } from './fsutil.ts';

export interface MemoryInfo {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
}

export function parseMeminfo(text: string): MemoryInfo | null {
  const kb = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm'));
    return m ? Number(m[1]) * 1024 : null;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable');
  if (total === null || available === null) return null;
  return { totalBytes: total, availableBytes: available, usedBytes: total - available };
}

export async function readMemory(procRoot: string): Promise<MemoryInfo> {
  const parsed = parseMeminfo((await readText(join(procRoot, 'meminfo'))) ?? '');
  if (!parsed) throw new Error('/proc/meminfo nicht lesbar');
  return parsed;
}

export async function readLoad(procRoot: string): Promise<{ one: number; five: number; fifteen: number }> {
  const [one = 0, five = 0, fifteen = 0] = ((await readText(join(procRoot, 'loadavg'))) ?? '')
    .split(/\s+/)
    .slice(0, 3)
    .map(Number);
  return { one, five, fifteen };
}

export async function readUptimeSeconds(procRoot: string): Promise<number> {
  const first = ((await readText(join(procRoot, 'uptime'))) ?? '0').split(/\s+/)[0];
  return Math.floor(Number(first) || 0);
}

export async function readHostname(procRoot: string): Promise<string> {
  return (await readText(join(procRoot, 'sys', 'kernel', 'hostname'))) ?? 'unbekannt';
}

export async function readOs(procRoot: string, etcRoot: string): Promise<{ name: string; kernel: string }> {
  const osRelease = (await readText(join(etcRoot, 'os-release'))) ?? '';
  const pretty = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
  const kernel = (await readText(join(procRoot, 'sys', 'kernel', 'osrelease'))) ?? 'unbekannt';
  return { name: pretty ?? 'Linux', kernel };
}
