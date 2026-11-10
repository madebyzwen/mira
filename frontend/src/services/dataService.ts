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
  Disk,
  DockerContainer,
  LlmDownload,
  LlmModel,
  NetworkInterface,
  ServerInfo,
  ServerUtilization,
  SystemEntry,
  Temperature,
} from '../types/models';

export const isDemoMode = true;

export const dataService = {
  getSystems: (): SystemEntry[] => demo.demoSystems,

  getAiServer: (): ServerInfo => demo.demoAiServer,
  getAiServerUtilization: (): ServerUtilization => demo.demoAiServerUtilization,
  getAiServerDisks: (): Disk[] => demo.demoAiServerDisks,
  getAiServerNetworkInterfaces: (): NetworkInterface[] => demo.demoAiServerNetwork,
  getAiServerTemperatures: (): Temperature[] => demo.demoAiServerTemperatures,

  getDockerContainers: (): DockerContainer[] => demo.demoDockerContainers,

  /** Beispielwerte, auf das einheitliche Zeitraster bis jetzt gelegt */

  getAgents: (): Agent[] => demo.demoAgents,

  getLlmModels: (): LlmModel[] => demo.demoLlmModels,
  getLlmTargetDirectories: (): string[] => demo.demoLlmTargetDirectories,
  getLlmDownloads: (): LlmDownload[] => demo.demoLlmDownloads,
};
