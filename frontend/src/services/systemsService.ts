import {
  AI_SERVER_SLUG,
  SHELLY_SLUG,
  type AiServerStatusResponse,
  type ConnectionError,
  type ConsumptionPeriod,
  type CreateEnergyPrice,
  type DatabaseStatsResponse,
  type EnergyPricesResponse,
  type HistoryRange,
  type HistoryResponse,
  type LoggerConnectionError,
  type MeterError,
  type PowerHistoryResponse,
  type ShellyConsumptionResponse,
  type ShellyStatusResponse,
  type ShellySummaryResponse,
  type SystemsListResponse,
} from '@mira/shared';
import { api } from './apiClient';

export const systemsService = {
  listSystems: () => api<SystemsListResponse>('/api/v1/systems'),
  getAiServer: () => api<AiServerStatusResponse>(`/api/v1/systems/${AI_SERVER_SLUG}`),
  getAiServerHistory: (range: HistoryRange) => api<HistoryResponse>(`/api/v1/systems/${AI_SERVER_SLUG}/history?range=${range}`),

  // Shelly Plug – Messwerte vom Shelly-Logger, Kosten aus dem Strompreis in MIRA
  getShelly: () => api<ShellyStatusResponse>(`/api/v1/systems/${SHELLY_SLUG}`),
  getShellySummary: () => api<ShellySummaryResponse>(`/api/v1/systems/${SHELLY_SLUG}/summary`),
  getShellyConsumption: (period: ConsumptionPeriod, date?: string) =>
    api<ShellyConsumptionResponse>(`/api/v1/systems/${SHELLY_SLUG}/consumption?period=${period}${date ? `&date=${date}` : ''}`),
  getShellyHistory: (range: HistoryRange) => api<PowerHistoryResponse>(`/api/v1/systems/${SHELLY_SLUG}/history?range=${range}`),
  getShellyDatabase: () => api<DatabaseStatsResponse>(`/api/v1/systems/${SHELLY_SLUG}/database`),
  getEnergyPrices: () => api<EnergyPricesResponse>(`/api/v1/systems/${SHELLY_SLUG}/prices`),
  setEnergyPrice: (price: CreateEnergyPrice) => api<EnergyPricesResponse>(`/api/v1/systems/${SHELLY_SLUG}/prices`, { method: 'POST', body: price }),
  deleteEnergyPrice: (id: number) => api<EnergyPricesResponse>(`/api/v1/systems/${SHELLY_SLUG}/prices/${id}`, { method: 'DELETE' }),
};

/** Verständliche Beschreibung, warum der Shelly-Logger nicht erreichbar ist. */
export const loggerErrorText: Record<LoggerConnectionError, string> = {
  not_configured: 'Verbindung zum Shelly-Logger ist nicht eingerichtet (MIRA_SHELLY_LOGGER_URL)',
  timeout: 'Shelly-Logger antwortet nicht (Zeitüberschreitung)',
  unreachable: 'Shelly-Logger nicht erreichbar',
  unauthorized: 'Zugriffstoken wurde vom Shelly-Logger abgelehnt',
  invalid_response: 'ungültige Antwort des Shelly-Loggers',
};

/** Verständliche Beschreibung, warum der Logger den Shelly zuletzt nicht abfragen konnte. */
export const meterErrorText: Record<MeterError, string> = {
  timeout: 'Shelly antwortet nicht (Zeitüberschreitung)',
  unreachable: 'Shelly nicht erreichbar',
  unauthorized: 'Passwort wurde vom Shelly abgelehnt',
  invalid_response: 'ungültige Antwort des Shelly',
  unsupported_device: 'Gerät wird nicht unterstützt',
  no_meter: 'Shelly meldet keine Messwerte',
};

/** Verständliche Beschreibung, warum der KI-Server zuletzt nicht erreichbar war. */
export const connectionErrorText: Record<ConnectionError, string> = {
  not_configured: 'Verbindung zum KI-Server ist nicht eingerichtet',
  timeout: 'Zeitüberschreitung',
  unreachable: 'nicht erreichbar',
  certificate_mismatch: 'Zertifikat stimmt nicht mit dem hinterlegten Fingerprint überein',
  unauthorized: 'Zugriffstoken wurde abgelehnt',
  invalid_response: 'ungültige Antwort des Agents auf dem KI-Server',
};
