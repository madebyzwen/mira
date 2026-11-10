import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ChartRange, OnlineStatus } from '../../types/models';

/* ---------- Pill / Badge ---------- */

export type PillTone = 'online' | 'offline' | 'success' | 'neutral' | 'quant' | 'violet';

export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

const statusText: Record<OnlineStatus, string> = { online: 'Online', offline: 'Offline', unknown: 'Unbekannt' };

export function OnlinePill({ status }: { status: OnlineStatus }) {
  const tone: PillTone = status === 'online' ? 'online' : status === 'offline' ? 'offline' : 'neutral';
  return <Pill tone={tone}>{statusText[status]}</Pill>;
}

/* ---------- Status-Punkt ---------- */

export function StatusDot({ status = 'online', label }: { status?: OnlineStatus; label?: string }) {
  return (
    <span
      className={`status-dot status-dot--${status}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/* ---------- Fortschrittsbalken ---------- */

export type BarTone = 'green' | 'cyan' | 'magenta' | 'violet';

interface ProgressBarProps {
  value: number;
  tone?: BarTone;
  size?: 'sm' | 'md' | 'lg';
  /** Getönte Spur (Dashboard) statt neutral-grauer Spur */
  tintedTrack?: boolean;
  label?: string;
}

export function ProgressBar({ value, tone = 'violet', size = 'md', tintedTrack = false, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={['progress', `progress--${tone}`, `progress--${size}`, tintedTrack && 'progress--tinted'].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div className="progress__fill" style={{ width: `${Math.max(clamped, 3)}%` }} />
    </div>
  );
}

/* ---------- Icon-Kachel (Seitenkopf) ---------- */

export function IconTile({ children }: { children: ReactNode }) {
  return <span className="icon-tile">{children}</span>;
}

/* ---------- Buttons ---------- */

type ButtonVariant = 'primary' | 'outline' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', icon, children, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={['button', `button--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'danger' | 'ghost';
  children: ReactNode;
}

export function IconButton({ label, tone = 'default', children, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={['icon-button', `icon-button--${tone}`, className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Zeitraum-Reiter ---------- */

const rangeLabels: Record<ChartRange, string> = { '1h': '1 h', '24h': '24 h', '7d': '7 Tage', '30d': '30 Tage' };

export const rangeTitleSuffix: Record<ChartRange, string> = {
  '1h': 'letzte Stunde',
  '24h': 'letzten 24 Stunden',
  '7d': 'letzte 7 Tage',
  '30d': 'letzte 30 Tage',
};

export function RangeTabs({ value, onChange }: { value: ChartRange; onChange: (r: ChartRange) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="Zeitraum">
      {(Object.keys(rangeLabels) as ChartRange[]).map((r) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={value === r}
          className={['segmented__item', value === r && 'is-active'].filter(Boolean).join(' ')}
          onClick={() => onChange(r)}
        >
          {rangeLabels[r]}
        </button>
      ))}
    </div>
  );
}

/* ---------- Zentrierte Hinweis-Fläche (Agents, Konfiguration) ---------- */

interface CenteredMessageProps {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}

export function CenteredMessage({ icon, title, text, children }: CenteredMessageProps) {
  return (
    <div className="centered-message">
      <span className="centered-message__icon">{icon}</span>
      <h2 className="centered-message__title">{title}</h2>
      {text && <p className="centered-message__text">{text}</p>}
      {children}
    </div>
  );
}

/* ---------- Kennzahl mit Icon (KI-Server, Shelly) ---------- */

interface StatProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}

export function Stat({ icon, label, value, detail, className }: StatProps) {
  return (
    <div className={['stat', className].filter(Boolean).join(' ')}>
      <span className="stat__icon">{icon}</span>
      <div className="stat__text">
        <span className="stat__label">{label}</span>
        <span className="stat__value">{value}</span>
        {detail && <span className="stat__detail">{detail}</span>}
      </div>
    </div>
  );
}
