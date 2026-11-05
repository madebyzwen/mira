import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AlertCircle, Eye, EyeOff, Lock, LogIn, User } from 'lucide-react';
import { MiraLogo } from '../components/brand/MiraLogo';
import { GlowWave } from '../components/illustrations/GlowWaves';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../services/apiClient';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_credentials') return 'Benutzername oder Passwort ist falsch.';
    if (err.code === 'rate_limited') {
      const seconds = Number(err.details?.retryAfterSeconds ?? 0);
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `Zu viele Fehlversuche. Bitte in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} erneut versuchen.`;
    }
    if (err.code === 'validation_error') return 'Bitte Benutzername und Passwort eingeben.';
    if (err.code === 'network_error') return 'MIRA ist nicht erreichbar.';
  }
  return 'Die Anmeldung ist fehlgeschlagen.';
}

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  if (state.status === 'authenticated' && !submitting) {
    return <Navigate to={target} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Bitte Benutzername und Passwort eingeben.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ username: username.trim(), password });
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <GlowWave className="login__wave login__wave--top" />
      <GlowWave className="login__wave login__wave--bottom" flip />

      <div className="login__content">
        <div className="login__brand">
          <MiraLogo size={150} />
          <h1 className="login__name">MIRA</h1>
          <p className="login__tagline">Home Server Orchestrator</p>
        </div>

        <form className="login__card" onSubmit={onSubmit} noValidate>
          <div className="login__card-head">
            <h2>Anmeldung</h2>
          </div>
          <p className="login__hint">Bitte mit deinem MIRA-Account anmelden.</p>

          {error && (
            <div className="login__error" role="alert">
              <AlertCircle size={22} aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <label className="field">
            <span className="visually-hidden">Benutzername</span>
            <User className="field__icon" size={30} strokeWidth={1.6} aria-hidden />
            <input
              className="field__input"
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Benutzername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              required
            />
          </label>

          <label className="field">
            <span className="visually-hidden">Passwort</span>
            <Lock className="field__icon" size={30} strokeWidth={1.6} aria-hidden />
            <input
              className="field__input"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
            <button
              type="button"
              className="field__action"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff size={28} /> : <Eye size={28} />}
            </button>
          </label>

          <button type="submit" className="button button--primary button--block button--lg" disabled={submitting}>
            <LogIn size={24} />
            <span>{submitting ? 'Anmeldung läuft …' : 'Anmelden'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
