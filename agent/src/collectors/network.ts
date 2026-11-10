import os from 'node:os';
import type { NetworkInterfaceInfo } from '@mira/shared';
import { join, listDir, readNumber, readText } from './fsutil.ts';

const VIRTUAL = [/^lo$/, /^docker\d*$/, /^br-/, /^veth/, /^virbr/, /^tun/, /^tap/, /^wg/];

export type InterfaceAddresses = () => NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/**
 * Netzwerkschnittstellen. Ohne `include` werden alle physischen bzw. VLAN-
 * Schnittstellen mit IPv4-Adresse geliefert (Docker-/Bridge-Netze ausgenommen).
 */
export async function readNetwork(
  sysRoot: string,
  options: { include: string[]; labels: Record<string, string> },
  addresses: InterfaceAddresses = os.networkInterfaces,
): Promise<NetworkInterfaceInfo[]> {
  const addrMap = addresses();
  const names = options.include.length ? options.include : await listDir(join(sysRoot, 'class', 'net'));
  const result: NetworkInterfaceInfo[] = [];

  for (const name of names) {
    if (!options.include.length && VIRTUAL.some((re) => re.test(name))) continue;
    const addrs = (addrMap[name] ?? [])
      .filter((a) => a.family === 'IPv4' || (a.family === 'IPv6' && !a.address.startsWith('fe80')))
      .map((a) => a.cidr ?? a.address);
    const hasIpv4 = (addrMap[name] ?? []).some((a) => a.family === 'IPv4');
    if (!options.include.length && !hasIpv4) continue;

    const operstate = await readText(join(sysRoot, 'class', 'net', name, 'operstate'));
    const speed = await readNumber(join(sysRoot, 'class', 'net', name, 'speed'));
    result.push({
      name,
      label: options.labels[name] ?? null,
      up: operstate === 'up' || (operstate === 'unknown' && hasIpv4),
      addresses: addrs,
      speedMbps: speed !== null && speed > 0 ? speed : null,
    });
  }
  return result;
}
