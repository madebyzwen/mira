import type { SystemInfo, SystemMetrics } from '@mira/shared';
import type { AgentConfig } from './config.ts';
import { CpuUsageSampler, readCpuInfo } from './collectors/cpu.ts';
import { readGpu, readTemperatures } from './collectors/hardware.ts';
import { readNetwork, type InterfaceAddresses } from './collectors/network.ts';
import { readStorage, type StatFs } from './collectors/storage.ts';
import { readHostname, readLoad, readMemory, readOs, readUptimeSeconds } from './collectors/system.ts';

export interface HostDeps {
  statfs?: StatFs;
  addresses?: InterfaceAddresses;
}

/** Liest alle Systemdaten des KI-Servers – ausschließlich lesend. */
export class Host {
  private readonly config: AgentConfig;
  private readonly deps: HostDeps;
  private readonly cpu: CpuUsageSampler;

  constructor(config: AgentConfig, deps: HostDeps = {}) {
    this.config = config;
    this.deps = deps;
    this.cpu = new CpuUsageSampler(config.paths.proc);
  }

  async info(): Promise<SystemInfo> {
    const { proc, sys, etc } = this.config.paths;
    const [hostname, os, cpu, memory, gpu, uptime] = await Promise.all([
      readHostname(proc),
      readOs(proc, etc),
      readCpuInfo(proc, sys),
      readMemory(proc),
      readGpu(sys, this.config.labels.gpuModel),
      readUptimeSeconds(proc),
    ]);
    return {
      hostname,
      os,
      cpu,
      memory: { totalBytes: memory.totalBytes, type: this.config.labels.ramType ?? null },
      gpu: gpu ? { model: gpu.model, vramTotalBytes: gpu.vramTotalBytes } : null,
      bootTime: new Date(Date.now() - uptime * 1000).toISOString(),
    };
  }

  async metrics(): Promise<SystemMetrics> {
    const { proc, sys } = this.config.paths;
    const [usage, load, memory, gpu, temperatures, storage, network, uptime] = await Promise.all([
      this.cpu.usagePercent(),
      readLoad(proc),
      readMemory(proc),
      readGpu(sys),
      readTemperatures(sys),
      readStorage(proc, this.config.disks, this.deps.statfs, this.config.paths.etc),
      readNetwork(sys, this.config.network, this.deps.addresses),
      readUptimeSeconds(proc),
    ]);
    return {
      ts: new Date().toISOString(),
      uptimeSeconds: uptime,
      cpu: { usagePercent: usage },
      load,
      memory,
      gpu: gpu ? { usagePercent: gpu.usagePercent, vramUsedBytes: gpu.vramUsedBytes, vramTotalBytes: gpu.vramTotalBytes } : null,
      temperatures,
      disks: storage.disks,
      networkShares: storage.networkShares,
      network,
    };
  }
}
