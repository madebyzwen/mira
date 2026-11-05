import { useId } from 'react';

interface MiraLogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

/** MIRA-Bildmarke: geschwungenes „M“ im Violett-Verlauf. */
export function MiraLogo({ size = 40, glow = true, className }: MiraLogoProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={className}
      width={size}
      height={(size * 76) / 100}
      viewBox="0 0 100 76"
      role="img"
      aria-label="MIRA"
    >
      <defs>
        <linearGradient id={`${uid}-main`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5b8ff" />
          <stop offset="0.35" stopColor="#d24bf2" />
          <stop offset="1" stopColor="#6a1fe0" />
        </linearGradient>
        <linearGradient id={`${uid}-side`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b36f0" />
          <stop offset="1" stopColor="#4c12b8" />
        </linearGradient>
        <linearGradient id={`${uid}-hi`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {glow && (
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.75  0 0 0 0 0.25  0 0 0 0 1  0 0 0 0.8 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? `url(#${uid}-glow)` : undefined}>
        {/* äußere Schenkel (Rückseite des Bandes) */}
        <path d="M14 66 L21 14" stroke={`url(#${uid}-side)`} strokeWidth="15" strokeLinecap="round" fill="none" />
        <path d="M86 66 L79 14" stroke={`url(#${uid}-side)`} strokeWidth="15" strokeLinecap="round" fill="none" />
        {/* mittleres V (Vorderseite des Bandes) */}
        <path
          d="M21 14 L50 48 L79 14"
          stroke={`url(#${uid}-main)`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M21 14 L50 48 L79 14"
          stroke={`url(#${uid}-hi)`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          transform="translate(0 -3)"
        />
      </g>
    </svg>
  );
}

interface MiraWordmarkProps {
  tagline?: boolean;
}

export function MiraWordmark({ tagline = false }: MiraWordmarkProps) {
  return (
    <span className="wordmark">
      <span className="wordmark__name">MIRA</span>
      {tagline && <span className="wordmark__tagline">Home Server Orchestrator</span>}
    </span>
  );
}
