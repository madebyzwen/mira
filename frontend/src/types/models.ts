/**
 * Domänen-Typen der MIRA-Weboberfläche.
 *
 * Diese Typen beschreiben die Daten, die die Oberfläche anzeigt. In Phase 1
 * werden sie aus `src/data/demoData.ts` befüllt; später liefert das
 * MIRA-Backend dieselben Strukturen über seine API.
 */

export type OnlineStatus = 'online' | 'offline';

export interface UserProfile {
  displayName: string;
  username: string;
}

/* ---------- Zeitreihen / Diagramme ---------- */

export type ChartRange = '24h' | '7d' | '30d';

export interface ChartTick {
  label: string;
  /** Position auf der x-Achse, 0 = links, 1 = rechts */
  at: number;
}

export interface TimeSeries {
  ticks: ChartTick[];
  /** Gleichmäßig verteilte Messwerte von links nach rechts */
  values: number[];
}

/* ---------- Odin (KI-Server) ---------- */

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

export interface UsageHistory {
  cpu: TimeSeries;
  gpu: TimeSeries;
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

export interface PowerMeterInfo {
  id: string;
  name: string;
  deviceName: string;
  description: string;
  status: OnlineStatus;
  currentPowerW: number;
  energyTodayKwh: number;
  energyMonthKwh: number;
  costTodayEur: number;
  costMonthEur: number;
  ipAddress: string;
  connection: string;
  wifiSignalDbm: number;
  firmware: string;
  measureIntervalS: number;
  host: string;
}

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
