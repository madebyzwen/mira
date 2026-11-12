import type { ChangePasswordRequest, LoginRequest, SessionResponse, SessionUser } from '@mira/shared';
import { api, ApiError } from './apiClient';

export const authService = {
  /** Aktuelle Session prüfen; `null`, wenn nicht angemeldet. */
  async getSession(): Promise<SessionUser | null> {
    try {
      const res = await api<SessionResponse>('/api/v1/auth/session', { silentUnauthorized: true });
      return res.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async login(credentials: LoginRequest): Promise<SessionUser> {
    const res = await api<SessionResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: credentials,
      silentUnauthorized: true,
    });
    return res.user;
  },

  async logout(): Promise<void> {
    await api<void>('/api/v1/auth/logout', { method: 'POST', silentUnauthorized: true });
  },

  /** Passwort ändern – beendet alle Sessions, danach ist eine neue Anmeldung nötig. */
  async changePassword(request: ChangePasswordRequest): Promise<void> {
    await api<void>('/api/v1/auth/password', { method: 'POST', body: request });
  },

  /** Alle Sessions des eigenen Kontos beenden (alle Geräte). */
  async revokeAllSessions(): Promise<void> {
    await api<void>('/api/v1/auth/sessions/revoke', { method: 'POST' });
  },
};
