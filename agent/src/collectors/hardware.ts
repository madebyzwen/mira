import type { Temperature } from '@mira/shared';
import { join, listDir, readNumber, readText, round } from './fsutil.ts';

const AMD_VENDOR = '0x1002';

export interface GpuReading {
  model: string | null;
  usagePercent: number | null;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
}

/** Erste AMD-GPU (amdgpu) über sysfs – ohne Root-Rechte lesbar. */
export async function readGpu(sysRoot: string, modelOverride?: string): Promise<GpuReading | null> {
  const drm = join(sysRoot, 'class', 'drm');
  for (const card of (await listDir(drm)).filter((n) => /^card\d+$/.test(n))) {
    const dev = join(drm, card, 'device');
    if ((await readText(join(dev, 'vendor'))) !== AMD_VENDOR) continue;
    const usage = await readNumber(join(dev, 'gpu_busy_percent'));
    const vramTotal = await readNumber(join(dev, 'mem_info_vram_total'));
    if (usage === null && vramTotal === null) continue;
    const productName = await readText(join(dev, 'product_name'));
    return {
      model: modelOverride ?? (productName || null),
      usagePercent: usage,
      vramUsedBytes: await readNumber(join(dev, 'mem_info_vram_used')),
      vramTotalBytes: vramTotal,
    };
  }
  return null;
}

interface SensorRule {
  sensor: Temperature['sensor'];
  label: string;
  /** bevorzugte temp*_label-Werte, sonst temp1 */
  preferred: string[];
}

const SENSORS: Record<string, SensorRule> = {
  coretemp: { sensor: 'cpu', label: 'CPU', preferred: ['Package id 0', 'Tctl', 'Tdie'] },
  k10temp: { sensor: 'cpu', label: 'CPU', preferred: ['Tctl', 'Tdie'] },
  amdgpu: { sensor: 'gpu', label: 'GPU', preferred: ['edge'] },
  nvme: { sensor: 'nvme', label: 'NVMe', preferred: ['Composite'] },
};

async function sensorInput(dir: string, preferred: string[]): Promise<number | null> {
  const files = await listDir(dir);
  for (const want of preferred) {
    for (const f of files.filter((n) => /^temp\d+_label$/.test(n))) {
      if ((await readText(join(dir, f))) === want) {
        const v = await readNumber(join(dir, f.replace('_label', '_input')));
        if (v !== null) return v;
      }
    }
  }
  return readNumber(join(dir, 'temp1_input'));
}

/** CPU-, GPU- und NVMe-Temperaturen aus /sys/class/hwmon (Millgrad → °C). */
export async function readTemperatures(sysRoot: string): Promise<Temperature[]> {
  const base = join(sysRoot, 'class', 'hwmon');
  const result: Temperature[] = [];
  const count: Record<string, number> = {};
  for (const hw of await listDir(base)) {
    const dir = join(base, hw);
    const name = await readText(join(dir, 'name'));
    const rule = name ? SENSORS[name] : undefined;
    if (!rule) continue;
    const milli = await sensorInput(dir, rule.preferred);
    if (milli === null) continue;
    count[rule.sensor] = (count[rule.sensor] ?? 0) + 1;
    const label = count[rule.sensor] > 1 ? `${rule.label} ${count[rule.sensor]}` : rule.label;
    result.push({ sensor: rule.sensor, label, celsius: round(milli / 1000, 1) });
  }
  const order: Temperature['sensor'][] = ['cpu', 'gpu', 'nvme'];
  return result.sort((a, b) => order.indexOf(a.sensor) - order.indexOf(b.sensor));
}
