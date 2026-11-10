import { join, listDir, parseRangeList, readText, round } from './fsutil.ts';

interface CpuTimes {
  total: number;
  idle: number;
  at: number;
}

/** Summe der CPU-Zeiten aus der ersten Zeile von /proc/stat. */
export function parseProcStat(text: string): { total: number; idle: number } | null {
  const line = text.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const v = line.trim().split(/\s+/).slice(1).map(Number);
  // user nice system idle iowait irq softirq steal (guest-Werte sind in user enthalten)
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = v;
  return { total: user + nice + system + idle + iowait + irq + softirq + steal, idle: idle + iowait };
}

export function usageBetween(a: { total: number; idle: number }, b: { total: number; idle: number }): number | null {
  const total = b.total - a.total;
  if (total <= 0) return null;
  return round(Math.min(100, Math.max(0, ((total - (b.idle - a.idle)) / total) * 100)), 1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * CPU-Auslastung als Differenz zweier Messungen. Liegt die letzte Messung
 * weniger als 0,5 s zurück, wird kurz (250 ms) gewartet und erneut gemessen.
 */
export class CpuUsageSampler {
  private last: CpuTimes | null = null;
  private readonly procRoot: string;

  constructor(procRoot: string) {
    this.procRoot = procRoot;
  }

  private async sample(): Promise<CpuTimes | null> {
    const text = await readText(join(this.procRoot, 'stat'));
    const parsed = text ? parseProcStat(text) : null;
    return parsed ? { ...parsed, at: Date.now() } : null;
  }

  async usagePercent(): Promise<number | null> {
    let previous = this.last;
    if (!previous || Date.now() - previous.at < 500) {
      previous = await this.sample();
      await sleep(250);
    }
    const current = await this.sample();
    if (!previous || !current) return null;
    this.last = current;
    return usageBetween(previous, current);
  }
}

export interface CpuInfo {
  model: string;
  physicalCores: number | null;
  threads: number;
  performanceCores: number | null;
  efficiencyCores: number | null;
}

/** Modell, Kerne und Threads aus /proc/cpuinfo; P-/E-Kerne über /sys/devices/cpu_core|cpu_atom. */
export async function readCpuInfo(procRoot: string, sysRoot: string): Promise<CpuInfo> {
  const text = (await readText(join(procRoot, 'cpuinfo'))) ?? '';
  const blocks = text.split(/\n\s*\n/).filter((b) => b.includes('processor'));
  const field = (block: string, key: string) =>
    block.split('\n').find((l) => l.startsWith(key))?.split(':').slice(1).join(':').trim();

  const coreOf = new Map<number, string>();
  for (const b of blocks) {
    const proc = Number(field(b, 'processor'));
    const phys = field(b, 'physical id');
    const core = field(b, 'core id');
    if (!Number.isNaN(proc) && phys !== undefined && core !== undefined) coreOf.set(proc, `${phys}:${core}`);
  }

  const uniqueCores = (cpus: number[]) => new Set(cpus.map((c) => coreOf.get(c)).filter(Boolean)).size;

  let performanceCores: number | null = null;
  let efficiencyCores: number | null = null;
  const devices = await listDir(join(sysRoot, 'devices'));
  if (devices.includes('cpu_core') && devices.includes('cpu_atom')) {
    const pCpus = parseRangeList((await readText(join(sysRoot, 'devices', 'cpu_core', 'cpus'))) ?? '');
    const eCpus = parseRangeList((await readText(join(sysRoot, 'devices', 'cpu_atom', 'cpus'))) ?? '');
    performanceCores = pCpus.length ? uniqueCores(pCpus) : null;
    efficiencyCores = eCpus.length ? uniqueCores(eCpus) : null;
  }

  return {
    model: (blocks[0] && field(blocks[0], 'model name')) || 'Unbekannte CPU',
    physicalCores: coreOf.size ? new Set(coreOf.values()).size : null,
    threads: blocks.length,
    performanceCores,
    efficiencyCores,
  };
}
