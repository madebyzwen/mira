import { z } from 'zod';

/**
 * Verträge des MIRA-Agents (KI-Server → MIRA).
 * Werte, die auf einem System nicht ermittelbar sind, werden als `null`
 * geliefert – es wird nie geschätzt.
 */

export const AGENT_API_VERSION = '1';

export const agentHealthSchema = z.object({
  status: z.literal('ok'),
  /** Version des Protokolls (Verträge), nicht des Pakets */
  apiVersion: z.string(),
  hostname: z.string(),
  /** Paketversion des Agents (z. B. `0.2.0`) – erst ab 0.1.4 gemeldet */
  version: z.string().optional(),
});
export type AgentHealth = z.infer<typeof agentHealthSchema>;

export const systemInfoSchema = z.object({
  hostname: z.string(),
  os: z.object({
    name: z.string(),
    kernel: z.string(),
  }),
  cpu: z.object({
    model: z.string(),
    physicalCores: z.number().int().nullable(),
    threads: z.number().int(),
    /** Nur bei Hybrid-CPUs (Intel P-/E-Kerne) */
    performanceCores: z.number().int().nullable(),
    efficiencyCores: z.number().int().nullable(),
  }),
  memory: z.object({
    totalBytes: z.number(),
    /** z. B. „DDR4-3200“ – nur wenn in der Konfiguration hinterlegt */
    type: z.string().nullable(),
  }),
  gpu: z
    .object({
      model: z.string().nullable(),
      vramTotalBytes: z.number().nullable(),
    })
    .nullable(),
  bootTime: z.string(),
});
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const temperatureSchema = z.object({
  sensor: z.enum(['cpu', 'gpu', 'nvme']),
  label: z.string(),
  celsius: z.number(),
});

export const diskSchema = z.object({
  mount: z.string(),
  label: z.string(),
  device: z.string().nullable(),
  fsType: z.string().nullable(),
  totalBytes: z.number(),
  usedBytes: z.number(),
});

export const NETWORK_SHARE_STATES = ['mounted', 'automount', 'unmounted'] as const;

export const networkShareSchema = z.object({
  mount: z.string(),
  source: z.string(),
  fsType: z.string(),
  /**
   * mounted   = eingehängt (Belegung bekannt)
   * automount = eingetragen mit x-systemd.automount, wartet auf den ersten Zugriff
   * unmounted = in /etc/fstab eingetragen, aber nicht eingehängt
   * Fehlt bei Agent-Versionen ≤ 0.1.1 (dort wurden nur eingehängte Laufwerke geliefert).
   */
  state: z.enum(NETWORK_SHARE_STATES).optional(),
  totalBytes: z.number().nullable(),
  usedBytes: z.number().nullable(),
});

export const networkInterfaceSchema = z.object({
  name: z.string(),
  label: z.string().nullable(),
  up: z.boolean(),
  addresses: z.array(z.string()),
  speedMbps: z.number().nullable(),
});

export const systemMetricsSchema = z.object({
  ts: z.string(),
  uptimeSeconds: z.number(),
  cpu: z.object({ usagePercent: z.number().nullable() }),
  load: z.object({ one: z.number(), five: z.number(), fifteen: z.number() }),
  memory: z.object({
    totalBytes: z.number(),
    usedBytes: z.number(),
    availableBytes: z.number(),
  }),
  gpu: z
    .object({
      usagePercent: z.number().nullable(),
      vramUsedBytes: z.number().nullable(),
      vramTotalBytes: z.number().nullable(),
    })
    .nullable(),
  temperatures: z.array(temperatureSchema),
  disks: z.array(diskSchema),
  networkShares: z.array(networkShareSchema),
  network: z.array(networkInterfaceSchema),
});
export type SystemMetrics = z.infer<typeof systemMetricsSchema>;
export type Temperature = z.infer<typeof temperatureSchema>;
export type DiskUsage = z.infer<typeof diskSchema>;
export type NetworkShare = z.infer<typeof networkShareSchema>;
export type NetworkInterfaceInfo = z.infer<typeof networkInterfaceSchema>;
