import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginRequest, SessionUser } from '@mira/shared';
import { UNAUTHORIZED_EVENT } from '../services/apiClient';
import { authService } from '../services/authService';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'anonymous'; user: null }
  | { status: 'error'; user: null };

interface AuthContextValue {
  state: AuthState;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    authService
      .getSession()
      .then((user) => {
        if (!cancelled) setState(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', user: null });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Läuft eine Session während der Nutzung ab, landet man wieder auf der Login-Seite.
  useEffect(() => {
    const onUnauthorized = () => setState({ status: 'anonymous', user: null });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    const user = await authService.login(credentials);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading', user: null });
    setAttempt((a) => a + 1);
  }, []);

  const value = useMemo(() => ({ state, login, logout, retry }), [state, login, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden');
  return ctx;
}

/** Angemeldeter Benutzer – nur innerhalb geschützter Seiten verwenden. */
export function useCurrentUser(): SessionUser {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('Kein angemeldeter Benutzer');
  return state.user;
}
