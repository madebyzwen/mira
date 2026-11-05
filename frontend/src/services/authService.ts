import type { LoginRequest, SessionResponse, SessionUser } from '@mira/shared';
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
};
