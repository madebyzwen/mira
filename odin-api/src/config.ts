import fs from 'node:fs';
import { z } from 'zod';

/**
 * Konfiguration der Odin-API (`/etc/mira-odin-api/config.json`).
 * Wird vom Installationsskript angelegt und kann danach von Hand angepasst werden.
 */
const configSchema = z.object({
  listen: z.object({
    /** Nur diese Adresse – die LAN-Schnittstelle im Server-VLAN */
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(8443),
  }),
  tls: z.object({
    certFile: z.string(),
    keyFile: z.string(),
  }),
  /** Datei mit dem SHA-256-Hash (hex) des Zugriffstokens */
  tokenHashFile: z.string(),
  /** IP-Adressen, die überhaupt eine Verbindung aufbauen dürfen (Asgard) */
  allowedClients: z.array(z.string().min(1)).min(1),
  /** Anzuzeigende Datenträger (Einhängepunkte) */
  disks: z
    .array(z.object({ mount: z.string().min(1), label: z.string().min(1) }))
    .default([{ mount: '/', label: 'System' }]),
  network: z
    .object({
      /** Nur diese Schnittstellen; leer = alle physischen mit IPv4-Adresse */
      include: z.array(z.string()).default([]),
      /** Anzeigenamen, z. B. { "eno1.40": "Server-VLAN" } */
      labels: z.record(z.string(), z.string()).default({}),
    })
    .default({ include: [], labels: {} }),
  /** Werte, die ohne Root-Rechte nicht auslesbar sind */
  labels: z
    .object({
      gpuModel: z.string().optional(),
      ramType: z.string().optional(),
    })
    .default({}),
  /** Nur für Tests: alternative Wurzeln für /proc, /sys und /etc */
  paths: z
    .object({
      proc: z.string().default('/proc'),
      sys: z.string().default('/sys'),
      etc: z.string().default('/etc'),
    })
    .default({ proc: '/proc', sys: '/sys', etc: '/etc' }),
});

export type OdinApiConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): OdinApiConfig {
  return configSchema.parse(raw);
}

export function loadConfigFile(file: string): OdinApiConfig {
  return parseConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}
