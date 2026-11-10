import { HISTORY_GRID } from '@mira/shared';
/**
 * Datenzugriffsschicht der Weboberfläche.
 *
 * Phase 1: Alle Funktionen liefern synchron die zentralen Demo-Daten aus
 * `src/data/demoData.ts`. Es finden KEINE Netzwerkanfragen statt – weder an
 * ein Backend noch an den KI-Server oder den Shelly Plug.
 *
 * Später: Diese Datei ist die einzige Stelle, die auf die MIRA-Backend-API
 * umgestellt wird (z. B. `fetch('/api/v1/systems/ai-server')`). Das Frontend spricht
 * dabei nie direkt mit dem KI-Server, sondern immer nur mit dem MIRA-Backend.
 */
import * as demo from '../data/demoData';
import type {
  Agent,
  ChartRange,
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
} from '../types/models';

export const isDemoMode = true;

export const dataService = {
  getSystems: (): SystemEntry[] => demo.demoSystems,

  getAiServer: (): ServerInfo => demo.demoAiServer,
  getAiServerUtilization: (): ServerUtilization => demo.demoAiServerUtilization,
  getAiServerDisks: (): Disk[] => demo.demoAiServerDisks,
  getAiServerNetworkShare: (): NetworkShare => demo.demoAiServerNas,
  getAiServerNetworkInterfaces: (): NetworkInterface[] => demo.demoAiServerNetwork,
  getAiServerTemperatures: (): Temperature[] => demo.demoAiServerTemperatures,

  getDockerContainers: (): DockerContainer[] => demo.demoDockerContainers,

  getShellyPlug: (): PowerMeterInfo => demo.demoShellyPlug,
  /** Beispielwerte, auf das einheitliche Zeitraster bis jetzt gelegt */
  getShellyPowerHistory: (range: ChartRange): TimeSeries => {
    const { points, stepSeconds } = HISTORY_GRID[range];
    const step = stepSeconds * 1000;
    const last = Math.floor(Date.now() / step) * step;
    const timestamps = Array.from({ length: points }, (_, i) => new Date(last - (points - 1 - i) * step).toISOString());
    return { range, stepSeconds, timestamps, values: demo.demoShellyPowerHistory[range] };
  },

  getAgents: (): Agent[] => demo.demoAgents,

  getLlmModels: (): LlmModel[] => demo.demoLlmModels,
  getLlmTargetDirectories: (): string[] => demo.demoLlmTargetDirectories,
  getLlmDownloads: (): LlmDownload[] => demo.demoLlmDownloads,
};
