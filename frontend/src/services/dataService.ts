/**
 * Datenzugriffsschicht der Weboberfläche.
 *
 * Phase 1: Alle Funktionen liefern synchron die zentralen Demo-Daten aus
 * `src/data/demoData.ts`. Es finden KEINE Netzwerkanfragen statt – weder an
 * ein Backend noch an Odin oder den Shelly Plug.
 *
 * Später: Diese Datei ist die einzige Stelle, die auf die MIRA-Backend-API
 * umgestellt wird (z. B. `fetch('/api/systems/odin')`). Das Frontend spricht
 * dabei nie direkt mit Odin, sondern immer nur mit dem MIRA-Backend.
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
  UsageHistory,
} from '../types/models';

export const isDemoMode = true;

export const dataService = {
  getSystems: (): SystemEntry[] => demo.demoSystems,

  getOdin: (): ServerInfo => demo.demoOdin,
  getOdinUtilization: (): ServerUtilization => demo.demoOdinUtilization,
  getOdinUsageHistory: (range: ChartRange): UsageHistory => demo.demoOdinUsageHistory[range],
  getOdinDisks: (): Disk[] => demo.demoOdinDisks,
  getOdinNetworkShare: (): NetworkShare => demo.demoOdinNas,
  getOdinNetworkInterfaces: (): NetworkInterface[] => demo.demoOdinNetwork,
  getOdinTemperatures: (): Temperature[] => demo.demoOdinTemperatures,

  getDockerContainers: (): DockerContainer[] => demo.demoDockerContainers,

  getShellyPlug: (): PowerMeterInfo => demo.demoShellyPlug,
  getShellyPowerHistory: (range: ChartRange): TimeSeries => demo.demoShellyPowerHistory[range],

  getAgents: (): Agent[] => demo.demoAgents,

  getLlmModels: (): LlmModel[] => demo.demoLlmModels,
  getLlmTargetDirectories: (): string[] => demo.demoLlmTargetDirectories,
  getLlmDownloads: (): LlmDownload[] => demo.demoLlmDownloads,
};
