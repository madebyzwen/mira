/**
 * Zentrale Demo-Daten für Phase 1.
 *
 * ALLE Beispielwerte der Oberfläche stammen aus dieser Datei. Komponenten
 * greifen nie direkt hierauf zu, sondern ausschließlich über
 * `src/services/dataService.ts`. Dadurch lässt sich die Datenquelle später
 * durch das MIRA-Backend ersetzen, ohne Seiten oder Komponenten anzupassen.
 */
import type {
  Agent,
  ChartRange,
  ChartTick,
  Disk,
  DockerContainer,
  LlmDownload,
  LlmModel,
  NetworkInterface,
  NetworkShare,
  PowerMeterInfo,
  ServerInfo,
  ServerUtilization,
  SystemEntry,
  Temperature,
  TimeSeries,
  UsageHistory,
  UserProfile,
} from '../types/models';

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen zum Erzeugen reproduzierbarer Beispiel-Zeitreihen  */
/* ------------------------------------------------------------------ */

/** Deterministischer Pseudo-Zufallsgenerator (mulberry32). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bump {
  /** Position 0..1 */
  at: number;
  /** Breite (Standardabweichung) 0..1 */
  width: number;
  height: number;
}

function generateSeries(options: {
  count: number;
  base: number;
  noise: number;
  seed: number;
  bumps?: Bump[];
  last?: number;
  min?: number;
}): number[] {
  const rand = seededRandom(options.seed);
  const values: number[] = [];
  let drift = 0;
  for (let i = 0; i < options.count; i += 1) {
    const x = i / (options.count - 1);
    drift = drift * 0.82 + (rand() - 0.5) * options.noise;
    const bumpSum = (options.bumps ?? []).reduce(
      (sum, b) => sum + b.height * Math.exp(-((x - b.at) ** 2) / (2 * b.width ** 2)),
      0,
    );
    values.push(Math.max(options.min ?? 0, options.base + drift + bumpSum));
  }
  if (options.last !== undefined) {
    values[values.length - 1] = options.last;
  }
  return values;
}

/** Achsenbeschriftung: 24 h-Fenster bis jetzt, alle 4 Stunden ab 20:00. */
const ticks24h: ChartTick[] = ['20:00', '00:00', '04:00', '08:00', '12:00', '16:00'].map(
  (label, i) => ({ label, at: (4 / 3 + i * 4) / 24 }),
);

const ticks7d: ChartTick[] = ['30.10.', '31.10.', '01.11.', '02.11.', '03.11.', '04.11.', '05.11.'].map(
  (label, i) => ({ label, at: (i + 0.5) / 7 }),
);

const ticks30d: ChartTick[] = ['07.10.', '12.10.', '17.10.', '22.10.', '27.10.', '01.11.'].map(
  (label, i) => ({ label, at: (i * 5 + 2) / 30 }),
);

const ticksByRange: Record<ChartRange, ChartTick[]> = {
  '24h': ticks24h,
  '7d': ticks7d,
  '30d': ticks30d,
};

const pointsByRange: Record<ChartRange, number> = { '24h': 145, '7d': 168, '30d': 120 };

/* ------------------------------------------------------------------ */
/* Benutzer                                                            */
/* ------------------------------------------------------------------ */

export const demoUser: UserProfile = {
  displayName: 'Sven',
  username: 'sven',
};

/* ------------------------------------------------------------------ */
/* Systeme                                                             */
/* ------------------------------------------------------------------ */

export const demoSystems: SystemEntry[] = [
  { id: 'odin', label: 'Odin', path: '/systeme/odin', status: 'online', kind: 'server', description: 'KI-Server' },
  {
    id: 'shelly-plug',
    label: 'Shelly Plug',
    path: '/systeme/shelly-plug',
    status: 'online',
    kind: 'power-meter',
    description: 'Strommessung für Odin',
  },
];

export const demoOdin: ServerInfo = {
  id: 'odin',
  name: 'Odin',
  role: 'KI-Server',
  status: 'online',
  os: 'Ubuntu Server 26.04 LTS',
  kernel: '7.0.0-42-generic',
  uptime: '3 Tage, 14:27 h',
  hardware: {
    cpuModel: 'i7-14700',
    cpuCores: '20 Cores (8P + 12E)',
    ramTotalGb: 64,
    ramType: 'DDR4-3200',
    gpuModel: 'Radeon AI Pro R9700',
    vramTotalGb: 32,
  },
};

export const demoOdinUtilization: ServerUtilization = {
  cpuPercent: 3,
  ramUsedGb: 6.4,
  gpuPercent: 2,
  vramUsedGb: 19.4,
  systemLoad: 0.1,
};

export const demoOdinUsageHistory: Record<ChartRange, UsageHistory> = {
  '24h': {
    cpu: {
      ticks: ticksByRange['24h'],
      values: generateSeries({
        count: pointsByRange['24h'],
        base: 19,
        noise: 2.2,
        seed: 11,
        bumps: [{ at: 0.52, width: 0.035, height: 13 }],
      }),
    },
    gpu: {
      ticks: ticksByRange['24h'],
      values: generateSeries({
        count: pointsByRange['24h'],
        base: 5.5,
        noise: 1.4,
        seed: 12,
        bumps: [{ at: 0.52, width: 0.04, height: 3 }],
      }),
    },
  },
  '7d': {
    cpu: {
      ticks: ticksByRange['7d'],
      values: generateSeries({
        count: pointsByRange['7d'],
        base: 17,
        noise: 4,
        seed: 21,
        bumps: [
          { at: 0.22, width: 0.02, height: 22 },
          { at: 0.58, width: 0.03, height: 30 },
          { at: 0.86, width: 0.02, height: 15 },
        ],
      }),
    },
    gpu: {
      ticks: ticksByRange['7d'],
      values: generateSeries({
        count: pointsByRange['7d'],
        base: 6,
        noise: 2.5,
        seed: 22,
        bumps: [
          { at: 0.22, width: 0.02, height: 35 },
          { at: 0.58, width: 0.03, height: 48 },
        ],
      }),
    },
  },
  '30d': {
    cpu: {
      ticks: ticksByRange['30d'],
      values: generateSeries({
        count: pointsByRange['30d'],
        base: 18,
        noise: 5,
        seed: 31,
        bumps: [
          { at: 0.3, width: 0.03, height: 20 },
          { at: 0.7, width: 0.04, height: 25 },
        ],
      }),
    },
    gpu: {
      ticks: ticksByRange['30d'],
      values: generateSeries({
        count: pointsByRange['30d'],
        base: 7,
        noise: 3,
        seed: 32,
        bumps: [
          { at: 0.3, width: 0.03, height: 28 },
          { at: 0.7, width: 0.04, height: 40 },
        ],
      }),
    },
  },
};

export const demoOdinDisks: Disk[] = [
  { name: 'NVMe (System)', usedGb: 811, totalGb: 1024 },
  { name: 'SSD (Daten)', usedGb: 312, totalGb: 1024 },
];

export const demoOdinNas: NetworkShare = {
  mountPoint: '/mnt/asgard',
  source: '10.10.40.1 (Asgard)',
  usedTb: 1.44,
  totalTb: 4,
};

export const demoOdinNetwork: NetworkInterface[] = [
  { name: 'Server-VLAN', device: 'eno1.40', address: '10.10.40.10 / 24', kind: 'vlan' },
  { name: '10-GbE P2P', device: 'enp8s0f1', address: '10.11.40.10 / 24', kind: 'p2p' },
];

export const demoOdinTemperatures: Temperature[] = [
  { sensor: 'cpu', label: 'CPU', celsius: 42 },
  { sensor: 'gpu', label: 'GPU', celsius: 38 },
  { sensor: 'nvme', label: 'NVMe', celsius: 36 },
];

/* ------------------------------------------------------------------ */
/* Docker                                                              */
/* ------------------------------------------------------------------ */

export const demoDockerContainers: DockerContainer[] = [
  { name: 'odin-llama-server', state: 'healthy', uptime: 'Up 18 min' },
  { name: 'portainer_agent', state: 'running', uptime: 'Up 18 min' },
];

/* ------------------------------------------------------------------ */
/* Shelly Plug                                                         */
/* ------------------------------------------------------------------ */

export const demoShellyPlug: PowerMeterInfo = {
  id: 'shelly-plug',
  name: 'Shelly Plug',
  deviceName: 'Shelly Plug PM – Odin',
  description: 'Strommessung für Odin',
  status: 'online',
  currentPowerW: 75.5,
  energyTodayKwh: 1.84,
  energyMonthKwh: 47.6,
  costTodayEur: 0.55,
  costMonthEur: 14.28,
  ipAddress: '10.10.40.25',
  connection: 'Lokal',
  wifiSignalDbm: -58,
  firmware: '1.5.2',
  measureIntervalS: 10,
  host: 'Odin',
};

export const demoShellyPowerHistory: Record<ChartRange, TimeSeries> = {
  '24h': {
    ticks: ticksByRange['24h'],
    values: generateSeries({
      count: pointsByRange['24h'],
      base: 69,
      noise: 3.2,
      seed: 41,
      min: 40,
      last: demoShellyPlug.currentPowerW,
      bumps: [
        { at: 0.47, width: 0.06, height: 20 },
        { at: 0.66, width: 0.035, height: 18 },
        { at: 0.8, width: 0.05, height: 12 },
        { at: 0.6, width: 0.06, height: 8 },
      ],
    }),
  },
  '7d': {
    ticks: ticksByRange['7d'],
    values: generateSeries({
      count: pointsByRange['7d'],
      base: 72,
      noise: 6,
      seed: 42,
      min: 40,
      last: demoShellyPlug.currentPowerW,
      bumps: [
        { at: 0.22, width: 0.02, height: 35 },
        { at: 0.58, width: 0.03, height: 42 },
        { at: 0.86, width: 0.02, height: 20 },
      ],
    }),
  },
  '30d': {
    ticks: ticksByRange['30d'],
    values: generateSeries({
      count: pointsByRange['30d'],
      base: 70,
      noise: 7,
      seed: 43,
      min: 40,
      last: demoShellyPlug.currentPowerW,
      bumps: [
        { at: 0.3, width: 0.03, height: 30 },
        { at: 0.7, width: 0.04, height: 38 },
      ],
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

/** Phase 1: bewusst leer – es werden noch keine Agenten angebunden. */
export const demoAgents: Agent[] = [];

/* ------------------------------------------------------------------ */
/* LLM                                                                 */
/* ------------------------------------------------------------------ */

export const demoLlmModels: LlmModel[] = [
  {
    id: 'qwen3.6-35b-a3b-q4km',
    fileName: 'Qwen3.6-35B-A3B-Q4_K_M.gguf',
    displayName: 'Qwen3.6-35B-A3B',
    family: 'Qwen3.6',
    parameters: '35B (A3B)',
    variant: 'Reasoning',
    type: 'LLM',
    sizeGb: 19.2,
    quantization: 'Q4_K_M',
    modifiedAt: '2026-11-02T22:14:00',
    path: '/models/Qwen3.6-35B-A3B-Q4_K_M.gguf',
    availableInOpenWebUi: true,
  },
  {
    id: 'qwen3-32b-q5km',
    fileName: 'Qwen3-32B-Q5_K_M.gguf',
    displayName: 'Qwen3-32B',
    family: 'Qwen3',
    parameters: '32B',
    variant: 'General',
    type: 'LLM',
    sizeGb: 22.1,
    quantization: 'Q5_K_M',
    modifiedAt: '2026-11-01T18:37:00',
    path: '/models/Qwen3-32B-Q5_K_M.gguf',
    availableInOpenWebUi: true,
  },
  {
    id: 'qwen3.8-27b-q4km',
    fileName: 'Qwen3.8-27B-Q4_K_M.gguf',
    displayName: 'Qwen3.8-27B',
    family: 'Qwen3.8',
    parameters: '27B',
    variant: 'General',
    type: 'LLM',
    sizeGb: 18.0,
    quantization: 'Q4_K_M',
    modifiedAt: '2026-11-02T09:22:00',
    path: '/models/Qwen3.8-27B-Q4_K_M.gguf',
    availableInOpenWebUi: false,
  },
  {
    id: 'glm-4.7-flash-q4k',
    fileName: 'GLM-4.7-Flash-Q4_K.gguf',
    displayName: 'GLM-4.7-Flash',
    family: 'GLM-4.7',
    parameters: 'Flash',
    variant: 'General',
    type: 'LLM',
    sizeGb: 17.0,
    quantization: 'Q4_K',
    modifiedAt: '2026-11-01T16:11:00',
    path: '/models/GLM-4.7-Flash-Q4_K.gguf',
    availableInOpenWebUi: true,
  },
  {
    id: 'gemma-4-31b-it-ud-q4kxl',
    fileName: 'gemma-4-31B-it-UD-Q4_K_XL.gguf',
    displayName: 'Gemma-4-31B',
    family: 'Gemma 4',
    parameters: '31B',
    variant: 'Instruct',
    type: 'LLM',
    sizeGb: 18.0,
    quantization: 'Q4_K_XL',
    modifiedAt: '2026-11-01T14:05:00',
    path: '/models/gemma-4-31B-it-UD-Q4_K_XL.gguf',
    availableInOpenWebUi: true,
  },
];

export const demoLlmTargetDirectories: string[] = ['/models'];

export const demoLlmDownloads: LlmDownload[] = [
  {
    fileName: 'Qwen3.6-35B-A3B-Q4_K_M.gguf',
    downloadedGb: 12.3,
    totalGb: 19.2,
    speedMbS: 112,
  },
];
