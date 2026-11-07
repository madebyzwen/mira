import type { NotificationsResponse, UpdateCheckError, UpdateStatusResponse } from '@mira/shared';
import { api } from './apiClient';

export const notificationsService = {
  /** `refresh` nur beim Laden der Oberfläche – stößt im Backend die Update-Prüfung des Tages an. */
  list: (refresh = false) => api<NotificationsResponse>(`/api/v1/notifications${refresh ? '?refresh=true' : ''}`),
  markRead: (ids?: number[]) => api<void>('/api/v1/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
  dismiss: (id: number) => api<void>(`/api/v1/notifications/${id}`, { method: 'DELETE' }),
  getUpdateStatus: () => api<UpdateStatusResponse>('/api/v1/system/update'),
};

/** Verständliche Beschreibung, warum die letzte Update-Prüfung fehlgeschlagen ist. */
export const updateCheckErrorText: Record<UpdateCheckError, string> = {
  unreachable: 'GitHub nicht erreichbar – bitte Internetzugang von MIRA prüfen',
  timeout: 'GitHub hat nicht rechtzeitig geantwortet',
  rate_limited: 'GitHub hat die Anfrage vorübergehend abgelehnt (Abfragelimit)',
  invalid_response: 'unerwartete Antwort von GitHub',
};
