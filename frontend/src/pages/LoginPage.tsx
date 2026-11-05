import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react';
import { MiraLogo } from '../components/brand/MiraLogo';
import { GlowWave } from '../components/illustrations/GlowWaves';

/**
 * Login – Phase 1: DEMO-Anmeldung.
 * Es findet keine Authentifizierung statt; die Eingaben werden weder geprüft
 * noch gespeichert oder übertragen. „Anmelden“ führt direkt zum Dashboard.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
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

        <form className="login__card" onSubmit={onSubmit}>
          <div className="login__card-head">
            <h2>Anmeldung</h2>
            <span className="pill pill--violet">Demo</span>
          </div>
          <p className="login__hint">Bitte mit deinem MIRA-Account anmelden.</p>

          <label className="field">
            <span className="visually-hidden">Benutzername</span>
            <User className="field__icon" size={30} strokeWidth={1.6} aria-hidden />
            <input
              className="field__input"
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Benutzername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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

          <button type="submit" className="button button--primary button--block button--lg">
            <LogIn size={24} />
            <span>Anmelden</span>
          </button>

          <p className="login__demo-note">
            Demo-Anmeldung: Es findet noch keine echte Authentifizierung statt. Die Eingaben werden nicht geprüft oder
            gespeichert.
          </p>
        </form>
      </div>
    </div>
  );
}
