import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { MiraLogo } from '../components/brand/MiraLogo';
import { useAuth } from './AuthContext';

/** Schützt alle Seiten innerhalb der App: ohne Anmeldung → Login-Seite. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, retry } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="auth-splash" aria-busy="true" aria-label="MIRA wird geladen">
        <MiraLogo size={72} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="auth-splash">
        <MiraLogo size={72} />
        <p>MIRA ist gerade nicht erreichbar.</p>
        <button type="button" className="button button--outline button--sm" onClick={retry}>
          <RefreshCw size={18} />
          <span>Erneut versuchen</span>
        </button>
      </div>
    );
  }

  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
