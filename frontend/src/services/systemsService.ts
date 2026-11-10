import { AI_SERVER_SLUG, type AiServerStatusResponse, type ConnectionError, type HistoryRange, type HistoryResponse, type SystemsListResponse } from '@mira/shared';
import { api } from './apiClient';

export const systemsService = {
  listSystems: () => api<SystemsListResponse>('/api/v1/systems'),
  getAiServer: () => api<AiServerStatusResponse>(`/api/v1/systems/${AI_SERVER_SLUG}`),
  getAiServerHistory: (range: HistoryRange) => api<HistoryResponse>(`/api/v1/systems/${AI_SERVER_SLUG}/history?range=${range}`),
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
