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
  Disk,
  DockerContainer,
  LlmDownload,
  LlmModel,
  NetworkInterface,
  NetworkShare,
  ServerInfo,
  ServerUtilization,
  SystemEntry,
  Temperature,
} from '../types/models';

/* ------------------------------------------------------------------ */
/* Systeme                                                             */
/* ------------------------------------------------------------------ */

export const demoSystems: SystemEntry[] = [
  { id: 'ai-server', label: 'KI-Server', path: '/systeme/ki-server', status: 'online', kind: 'server', description: 'KI-Server' },
  {
    id: 'shelly-plug',
    label: 'Shelly Plug',
    path: '/systeme/shelly-plug',
    status: 'online',
    kind: 'power-meter',
    description: 'Strommessung für den KI-Server',
  },
];

export const demoAiServer: ServerInfo = {
  id: 'ai-server',
  name: 'KI-Server',
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

export const demoAiServerUtilization: ServerUtilization = {
  cpuPercent: 3,
  ramUsedGb: 6.4,
  gpuPercent: 2,
  vramUsedGb: 19.4,
  systemLoad: 0.1,
};

export const demoAiServerDisks: Disk[] = [
  { name: 'NVMe (System)', usedGb: 811, totalGb: 1024 },
  { name: 'SSD (Daten)', usedGb: 312, totalGb: 1024 },
];

export const demoAiServerNas: NetworkShare = {
  mountPoint: '/mnt/asgard',
  source: '10.10.40.1 (Asgard)',
  usedTb: 1.44,
  totalTb: 4,
};

export const demoAiServerNetwork: NetworkInterface[] = [
  { name: 'Server-VLAN', device: 'eno1.40', address: '10.10.40.10 / 24', kind: 'vlan' },
  { name: '10-GbE P2P', device: 'enp8s0f1', address: '10.11.40.10 / 24', kind: 'p2p' },
];

export const demoAiServerTemperatures: Temperature[] = [
  { sensor: 'cpu', label: 'CPU', celsius: 42 },
  { sensor: 'gpu', label: 'GPU', celsius: 38 },
  { sensor: 'nvme', label: 'NVMe', celsius: 36 },
];

/* ------------------------------------------------------------------ */
/* Docker                                                              */
/* ------------------------------------------------------------------ */

export const demoDockerContainers: DockerContainer[] = [
  { name: 'llama-server', state: 'healthy', uptime: 'Up 18 min' },
  { name: 'portainer_agent', state: 'running', uptime: 'Up 18 min' },
];

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
