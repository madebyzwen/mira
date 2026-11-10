import { describe, expect, it } from 'vitest';
import { systemInfoSchema, systemMetricsSchema } from '@mira/shared';
import { parseProcStat, readCpuInfo, usageBetween } from '../src/collectors/cpu.ts';
import { parseRangeList, unescapeMount } from '../src/collectors/fsutil.ts';
import { readGpu, readTemperatures } from '../src/collectors/hardware.ts';
import { readNetwork } from '../src/collectors/network.ts';
import { parseFstabNetworkShares, parseMounts, readStorage } from '../src/collectors/storage.ts';
import { parseMeminfo, readOs } from '../src/collectors/system.ts';
import { Host } from '../src/host.ts';
import { createFixtureRoot, fixtureAddresses, fixtureConfig, fixtureStatFs } from './fixtureHost.ts';

describe('CPU', () => {
  it('berechnet die Auslastung aus zwei /proc/stat-Messungen', () => {
    const a = parseProcStat('cpu  1000 0 500 8000 500 0 0 0 0 0')!;
    const b = parseProcStat('cpu  1100 0 550 8300 550 0 0 0 0 0')!;
    // 500 Ticks gesamt, davon 350 idle (300 idle + 50 iowait) → 30 %
    expect(usageBetween(a, b)).toBe(30);
  });

  it('liefert null statt einer erfundenen Zahl, wenn keine Zeit vergangen ist', () => {
    const a = parseProcStat('cpu  1 0 1 1 0 0 0 0')!;
    expect(usageBetween(a, a)).toBeNull();
  });

  it('erkennt Modell, Kerne, Threads und P-/E-Kerne einer Hybrid-CPU', async () => {
    const root = createFixtureRoot();
    const info = await readCpuInfo(`${root}/proc`, `${root}/sys`);
    expect(info).toEqual({
      model: 'Intel(R) Core(TM) i7-14700',
      physicalCores: 4,
      threads: 6,
      performanceCores: 2,
      efficiencyCores: 2,
    });
  });

  it('meldet bei Nicht-Hybrid-CPUs keine P-/E-Kerne', async () => {
    const root = createFixtureRoot({ 'sys/devices/cpu_core/cpus': null, 'sys/devices/cpu_atom/cpus': null });
    const info = await readCpuInfo(`${root}/proc`, `${root}/sys`);
    expect(info.performanceCores).toBeNull();
    expect(info.efficiencyCores).toBeNull();
  });

  it('versteht CPU-Bereichsangaben', () => {
    expect(parseRangeList('0-3,8,10-11')).toEqual([0, 1, 2, 3, 8, 10, 11]);
  });
});

describe('Speicher und System', () => {
  it('liest RAM aus /proc/meminfo (genutzt = gesamt − verfügbar)', () => {
    expect(parseMeminfo('MemTotal:       1000 kB\nMemAvailable:    250 kB\n')).toEqual({
      totalBytes: 1_024_000,
      availableBytes: 256_000,
      usedBytes: 768_000,
    });
  });

  it('liest Betriebssystem und Kernel', async () => {
    const root = createFixtureRoot();
    expect(await readOs(`${root}/proc`, `${root}/etc`)).toEqual({ name: 'Ubuntu 26.04.1 LTS', kernel: '7.0.0-42-generic' });
  });
});

describe('GPU und Temperaturen', () => {
  it('überspringt die Intel-iGPU und liest die AMD-GPU', async () => {
    const root = createFixtureRoot();
    expect(await readGpu(`${root}/sys`)).toEqual({
      model: null,
      usagePercent: 7,
      vramUsedBytes: Math.round(19.4 * 1024 ** 3),
      vramTotalBytes: 32 * 1024 ** 3,
    });
  });

  it('liefert null, wenn keine AMD-GPU vorhanden ist', async () => {
    const root = createFixtureRoot({ 'sys/class/drm/card2/device/vendor': '0x10de' });
    expect(await readGpu(`${root}/sys`)).toBeNull();
  });

  it('liest CPU-Package-, GPU-Edge- und NVMe-Composite-Temperatur in fester Reihenfolge', async () => {
    const root = createFixtureRoot();
    expect(await readTemperatures(`${root}/sys`)).toEqual([
      { sensor: 'cpu', label: 'CPU', celsius: 42 },
      { sensor: 'gpu', label: 'GPU', celsius: 38 },
      { sensor: 'nvme', label: 'NVMe', celsius: 36.9 },
    ]);
  });
});

describe('Datenträger, Netzlaufwerke und Netzwerk', () => {
  it('löst Escapes in /proc/mounts auf', () => {
    expect(unescapeMount('/mnt/Freigabe\\040Ordner')).toBe('/mnt/Freigabe Ordner');
    expect(parseMounts('//nas/a\\040b /mnt/x cifs rw 0 0')).toEqual([{ source: '//nas/a b', mount: '/mnt/x', fsType: 'cifs' }]);
  });

  it('liefert konfigurierte Datenträger und alle NFS/CIFS-Mounts – ohne bei hängenden Mounts zu blockieren', async () => {
    const root = createFixtureRoot();
    const started = Date.now();
    const result = await readStorage(`${root}/proc`, [{ mount: '/', label: 'NVMe (System)' }], fixtureStatFs, `${root}/etc`);
    expect(Date.now() - started).toBeLessThan(2500);
    expect(result.disks).toEqual([
      {
        mount: '/',
        label: 'NVMe (System)',
        device: '/dev/nvme0n1p5',
        fsType: 'ext4',
        totalBytes: 211_000_000 * 4096,
        usedBytes: 51_000_000 * 4096,
      },
    ]);
    expect(result.networkShares).toEqual([
      { mount: '/mnt/nas', source: '//192.0.2.9/nas-freigabe', fsType: 'cifs', state: 'automount', totalBytes: null, usedBytes: null },
      { mount: '/mnt/asgard', source: '10.11.40.1:/volume1/ki', fsType: 'nfs4', state: 'mounted', totalBytes: 1_000_000_000 * 4096, usedBytes: 360_000_000 * 4096 },
      { mount: '/mnt/backup', source: '10.11.40.1:/volume1/backup', fsType: 'nfs4', state: 'unmounted', totalBytes: null, usedBytes: null },
      { mount: '/mnt/smb', source: '//nas/Freigabe Ordner', fsType: 'cifs', state: 'mounted', totalBytes: null, usedBytes: null },
    ]);
  });

  it('löst wartende Automounts nicht aus (kein statfs auf den Einhängepunkt)', async () => {
    const root = createFixtureRoot();
    const touched: string[] = [];
    const spy = async (mount: string) => {
      touched.push(mount);
      return fixtureStatFs(mount);
    };
    await readStorage(`${root}/proc`, [], spy, `${root}/etc`);
    expect(touched).not.toContain('/mnt/nas');
    expect(touched).not.toContain('/mnt/backup');
  });

  it('startet für ein hängendes Netzlaufwerk keinen weiteren statfs-Aufruf (Thread-Pool bleibt frei)', async () => {
    const root = createFixtureRoot();
    let smbCalls = 0;
    const statfs = async (mount: string) => {
      if (mount === '/mnt/smb') smbCalls += 1;
      return fixtureStatFs(mount);
    };
    for (let i = 0; i < 3; i++) {
      const result = await readStorage(`${root}/proc`, [], statfs, `${root}/etc`);
      expect(result.networkShares.find((s) => s.mount === '/mnt/smb')).toMatchObject({ state: 'mounted', totalBytes: null });
    }
    expect(smbCalls).toBe(1);
  }, 10_000);

  it('meldet einen Automount nach dem ersten Zugriff als eingehängt – mit Belegung', async () => {
    const root = createFixtureRoot({
      'proc/mounts': [
        '/dev/nvme0n1p5 / ext4 rw 0 0',
        'systemd-1 /mnt/nas autofs rw 0 0',
        '//192.0.2.9/nas-freigabe /mnt/nas cifs rw 0 0',
      ].join('\n'),
    });
    const statfs = async (mount: string) =>
      mount === '/mnt/nas' ? { blocks: 500_000_000, bfree: 300_000_000, bsize: 4096 } : fixtureStatFs(mount);
    const result = await readStorage(`${root}/proc`, [], statfs, `${root}/etc`);
    expect(result.networkShares.find((s) => s.mount === '/mnt/nas')).toEqual({
      mount: '/mnt/nas',
      source: '//192.0.2.9/nas-freigabe',
      fsType: 'cifs',
      state: 'mounted',
      totalBytes: 500_000_000 * 4096,
      usedBytes: 200_000_000 * 4096,
    });
  });

  it('liest Netzlaufwerke aus /etc/fstab inkl. Automount-Kennzeichen', () => {
    expect(parseFstabNetworkShares('# x\n//h/s /mnt/a cifs _netdev,x-systemd.automount 0 0\nUUID=1 / ext4 defaults 0 1\nh:/e /mnt/b nfs defaults 0 0')).toEqual([
      { source: '//h/s', mount: '/mnt/a', fsType: 'cifs', automount: true },
      { source: 'h:/e', mount: '/mnt/b', fsType: 'nfs', automount: false },
    ]);
  });

  it('liefert physische/VLAN-Schnittstellen mit IPv4 – ohne lo, docker0 und Schnittstellen ohne IPv4', async () => {
    const root = createFixtureRoot();
    const result = await readNetwork(`${root}/sys`, { include: [], labels: { 'eno1.40': 'Server-VLAN' } }, fixtureAddresses);
    expect(result).toEqual([
      { name: 'eno1.40', label: 'Server-VLAN', up: true, addresses: ['10.10.40.10/24'], speedMbps: 2500 },
      { name: 'enp8s0f1', label: null, up: true, addresses: ['10.11.40.10/24'], speedMbps: 10000 },
    ]);
  });
});

describe('Gesamtdaten', () => {
  it('liefert Info und Messwerte, die den gemeinsamen Verträgen entsprechen', async () => {
    const root = createFixtureRoot();
    const host = new Host(fixtureConfig(root), { statfs: fixtureStatFs, addresses: fixtureAddresses });
    const info = systemInfoSchema.parse(await host.info());
    const metrics = systemMetricsSchema.parse(await host.metrics());
    expect(info.gpu?.model).toBe('Radeon AI Pro R9700');
    expect(info.memory.type).toBe('DDR4-3200');
    expect(info.hostname).toBe('ki-server');
    expect(metrics.uptimeSeconds).toBe(307620);
    expect(metrics.load).toEqual({ one: 0.1, five: 0.25, fifteen: 0.3 });
  });
});
