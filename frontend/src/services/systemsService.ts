import type { ConnectionError, OdinStatusResponse, SystemsListResponse } from '@mira/shared';
import { api } from './apiClient';

export const systemsService = {
  listSystems: () => api<SystemsListResponse>('/api/v1/systems'),
  getOdin: () => api<OdinStatusResponse>('/api/v1/systems/odin'),
};

/** Verständliche Beschreibung, warum Odin zuletzt nicht erreichbar war. */
export const connectionErrorText: Record<ConnectionError, string> = {
  not_configured: 'Verbindung zur Odin-API ist nicht eingerichtet',
  timeout: 'Zeitüberschreitung',
  unreachable: 'nicht erreichbar',
  certificate_mismatch: 'Zertifikat stimmt nicht mit dem hinterlegten Fingerprint überein',
  unauthorized: 'Zugriffstoken wurde abgelehnt',
  invalid_response: 'ungültige Antwort der Odin-API',
};
