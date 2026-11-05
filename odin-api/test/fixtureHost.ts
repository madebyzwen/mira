import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseConfig, type OdinApiConfig } from '../src/config.ts';

/** Kleine Hybrid-CPU: 2 P-Kerne mit SMT (4 Threads) + 2 E-Kerne. */
const CPUINFO = [
  [0, 0, 0],
  [1, 0, 0],
  [2, 0, 4],
  [3, 0, 4],
  [4, 0, 8],
  [5, 0, 9],
]
  .map(
    ([proc, phys, core]) =>
      `processor\t: ${proc}\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i7-14700\nphysical id\t: ${phys}\ncore id\t\t: ${core}\n`,
  )
  .join('\n');

const FILES: Record<string, string> = {
  'proc/stat': 'cpu  1000 0 500 8000 500 0 0 0 0 0\ncpu0 100 0 50 800 50 0 0 0 0 0\n',
  'proc/meminfo': 'MemTotal:       65536000 kB\nMemFree:         1000000 kB\nMemAvailable:   58982400 kB\n',
  'proc/loadavg': '0.10 0.25 0.30 1/600 12345\n',
  'proc/uptime': '307620.55 4000000.00\n',
  'proc/cpuinfo': CPUINFO,
  'proc/mounts': [
    '/dev/nvme0n1p5 / ext4 rw,relatime 0 0',
    '/dev/nvme0n1p1 /boot/efi vfat rw 0 0',
    '10.11.40.1:/volume1/ki /mnt/asgard nfs4 rw 0 0',
    '//nas/Freigabe\\040Ordner /mnt/smb cifs rw 0 0',
  ].join('\n'),
  'proc/sys/kernel/hostname': 'odin\n',
  'proc/sys/kernel/osrelease': '7.0.0-42-generic\n',
  'etc/os-release': 'NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 26.04.1 LTS"\nVERSION_ID="26.04"\n',
  'sys/devices/cpu_core/cpus': '0-3\n',
  'sys/devices/cpu_atom/cpus': '4-5\n',
  // Intel-iGPU wird übersprungen, AMD-GPU erkannt
  'sys/class/drm/card1/device/vendor': '0x8086\n',
  'sys/class/drm/card2/device/vendor': '0x1002\n',
  'sys/class/drm/card2/device/gpu_busy_percent': '7\n',
  'sys/class/drm/card2/device/mem_info_vram_total': String(32 * 1024 ** 3),
  'sys/class/drm/card2/device/mem_info_vram_used': String(Math.round(19.4 * 1024 ** 3)),
  'sys/class/hwmon/hwmon0/name': 'acpitz\n',
  'sys/class/hwmon/hwmon0/temp1_input': '27800\n',
  'sys/class/hwmon/hwmon2/name': 'nvme\n',
  'sys/class/hwmon/hwmon2/temp1_label': 'Composite\n',
  'sys/class/hwmon/hwmon2/temp1_input': '36850\n',
  'sys/class/hwmon/hwmon4/name': 'coretemp\n',
  'sys/class/hwmon/hwmon4/temp2_label': 'Core 0\n',
  'sys/class/hwmon/hwmon4/temp2_input': '40000\n',
  'sys/class/hwmon/hwmon4/temp1_label': 'Package id 0\n',
  'sys/class/hwmon/hwmon4/temp1_input': '42000\n',
  'sys/class/hwmon/hwmon5/name': 'amdgpu\n',
  'sys/class/hwmon/hwmon5/temp1_label': 'edge\n',
  'sys/class/hwmon/hwmon5/temp1_input': '38000\n',
  'sys/class/hwmon/hwmon5/temp2_label': 'junction\n',
  'sys/class/hwmon/hwmon5/temp2_input': '45000\n',
  'sys/class/net/eno1/operstate': 'up\n',
  'sys/class/net/eno1/speed': '2500\n',
  'sys/class/net/eno1.40/operstate': 'up\n',
  'sys/class/net/eno1.40/speed': '2500\n',
  'sys/class/net/enp8s0f1/operstate': 'up\n',
  'sys/class/net/enp8s0f1/speed': '10000\n',
  'sys/class/net/docker0/operstate': 'up\n',
  'sys/class/net/lo/operstate': 'unknown\n',
};

export function createFixtureRoot(overrides: Record<string, string | null> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'odin-fixture-'));
  for (const [rel, content] of Object.entries({ ...FILES, ...overrides })) {
    if (content === null) continue;
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

/** Netzwerkadressen wie auf Odin (os.networkInterfaces()-Format). */
export const fixtureAddresses = () => ({
  lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4' as const, mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }],
  eno1: [{ address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6' as const, mac: 'aa:aa:aa:aa:aa:aa', internal: false, cidr: 'fe80::1/64', scopeid: 2 }],
  'eno1.40': [{ address: '10.10.40.10', netmask: '255.255.255.0', family: 'IPv4' as const, mac: 'aa:aa:aa:aa:aa:aa', internal: false, cidr: '10.10.40.10/24' }],
  enp8s0f1: [{ address: '10.11.40.10', netmask: '255.255.255.0', family: 'IPv4' as const, mac: 'bb:bb:bb:bb:bb:bb', internal: false, cidr: '10.11.40.10/24' }],
  docker0: [{ address: '172.17.0.1', netmask: '255.255.0.0', family: 'IPv4' as const, mac: 'cc:cc:cc:cc:cc:cc', internal: false, cidr: '172.17.0.1/16' }],
});

/** statfs-Ersatz: 811 GB-System-NVMe, NAS 4 TB, SMB-Freigabe hängt (Zeitlimit). */
export const fixtureStatFs = async (mount: string) => {
  if (mount === '/') return { blocks: 211_000_000, bfree: 160_000_000, bsize: 4096 };
  if (mount === '/mnt/asgard') return { blocks: 1_000_000_000, bfree: 640_000_000, bsize: 4096 };
  if (mount === '/mnt/smb') return new Promise<never>(() => {});
  throw new Error(`ENOENT: ${mount}`);
};

export function fixtureConfig(root: string, overrides: Partial<Record<string, unknown>> = {}): OdinApiConfig {
  return parseConfig({
    listen: { host: '127.0.0.1', port: 8443 },
    tls: { certFile: 'unused', keyFile: 'unused' },
    tokenHashFile: 'unused',
    allowedClients: ['127.0.0.1'],
    disks: [{ mount: '/', label: 'NVMe (System)' }],
    network: { include: [], labels: { 'eno1.40': 'Server-VLAN', enp8s0f1: '10-GbE P2P' } },
    labels: { gpuModel: 'Radeon AI Pro R9700', ramType: 'DDR4-3200' },
    paths: { proc: path.join(root, 'proc'), sys: path.join(root, 'sys'), etc: path.join(root, 'etc') },
    ...overrides,
  });
}
