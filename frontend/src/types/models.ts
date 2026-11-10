import type { HistoryRange } from '@mira/shared';

/**
 * Domänen-Typen der MIRA-Weboberfläche.
 *
 * Diese Typen beschreiben die Daten, die die Oberfläche anzeigt. In Phase 1
 * werden sie aus `src/data/demoData.ts` befüllt; später liefert das
 * MIRA-Backend dieselben Strukturen über seine API.
 */

export type OnlineStatus = 'online' | 'offline' | 'unknown';

/* ---------- Zeitreihen / Diagramme ---------- */

/** Zeiträume der Verlaufsdiagramme – einheitlich für alle Systeme (Raster: `HISTORY_GRID`) */
export type ChartRange = HistoryRange;

export interface ChartTick {
  label: string;
  /** Position auf der x-Achse, 0 = links, 1 = rechts */
  at: number;
}

/* ---------- KI-Server ---------- */

export interface ServerHardware {
  cpuModel: string;
  cpuCores: string;
  ramTotalGb: number;
  ramType: string;
  gpuModel: string;
  vramTotalGb: number;
}

export interface ServerInfo {
  id: string;
  name: string;
  role: string;
  status: OnlineStatus;
  os: string;
  kernel: string;
  uptime: string;
  hardware: ServerHardware;
}

export interface ServerUtilization {
  cpuPercent: number;
  ramUsedGb: number;
  gpuPercent: number;
  vramUsedGb: number;
  systemLoad: number;
}

export interface Disk {
  name: string;
  usedGb: number;
  totalGb: number;
}

export interface NetworkShare {
  mountPoint: string;
  source: string;
  usedTb: number;
  totalTb: number;
}

export interface NetworkInterface {
  name: string;
  device: string;
  address: string;
  kind: 'vlan' | 'p2p';
}

export interface Temperature {
  sensor: 'cpu' | 'gpu' | 'nvme';
  label: string;
  celsius: number;
}

/* ---------- Docker ---------- */

export type ContainerState = 'healthy' | 'running' | 'stopped';

export interface DockerContainer {
  name: string;
  state: ContainerState;
  uptime: string;
}

/* ---------- Shelly Plug ---------- */

/* ---------- Agents ---------- */

export interface Agent {
  id: string;
  name: string;
  description: string;
  status: OnlineStatus;
}

/* ---------- LLM ---------- */

export interface LlmModel {
  id: string;
  fileName: string;
  /** Kurzname, z. B. für die Anzeige im Dashboard */
  displayName: string;
  family: string;
  parameters: string;
  variant: string;
  type: string;
  sizeGb: number;
  quantization: string;
  /** ISO-8601-Zeitstempel */
  modifiedAt: string;
  path: string;
  availableInOpenWebUi: boolean;
}

export interface LlmDownload {
  fileName: string;
  downloadedGb: number;
  totalGb: number;
  speedMbS: number;
}

/* ---------- Systeme-Navigation ---------- */

export interface SystemEntry {
  id: string;
  label: string;
  path: string;
  status: OnlineStatus;
  kind: 'server' | 'power-meter';
  description: string;
}
