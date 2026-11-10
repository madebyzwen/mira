import { useId } from 'react';

/** Stilisierte Darstellung des KI-Servers (Tower mit Glasseite und RGB-Lüftern). */
export function ServerTower({ className, label = 'KI-Server' }: { className?: string; label?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const fans = [52, 100, 148];

  return (
    <svg className={className} viewBox="0 0 200 210" role="img" aria-label={label}>
      <defs>
        <linearGradient id={id('case')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a2d36" />
          <stop offset="1" stopColor="#0d0f15" />
        </linearGradient>
        <linearGradient id={id('front')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1b1d25" />
          <stop offset="1" stopColor="#0a0b10" />
        </linearGradient>
        <radialGradient id={id('glass')} cx="0.45" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#b24cff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#5b18b8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#12061f" />
        </radialGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('fan')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#1a0b2b" />
          <stop offset="0.7" stopColor="#2c0f4f" />
          <stop offset="1" stopColor="#d36bff" />
        </radialGradient>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="105" cy="198" rx="85" ry="10" fill={`url(#${id('shadow')})`} />

      {/* Seitenteil mit Glasfenster */}
      <polygon points="28,30 128,14 128,192 28,180" fill={`url(#${id('case')})`} />
      <polygon points="38,40 120,27 120,180 38,170" fill={`url(#${id('glass')})`} />
      {/* Innenleben: Mainboard, GPU, Lichtleiste */}
      <polygon points="50,52 108,43 108,110 50,116" fill="#16082a" opacity="0.55" />
      <polygon points="48,124 112,118 112,134 48,140" fill="#0c0613" opacity="0.85" />
      <polygon points="48,124 112,118 112,120 48,126" fill="#e08bff" opacity="0.9" />
      <rect x="70" y="62" width="22" height="22" rx="3" fill="#0d0716" opacity="0.8" transform="skewY(-8)" />
      <polygon points="38,40 120,27 120,180 38,170" fill={`url(#${id('sheen')})`} />
      <polygon points="38,40 120,27 120,180 38,170" fill="none" stroke="#3b3f4c" strokeWidth="1.5" />

      {/* Front mit drei Lüftern */}
      <polygon points="128,14 172,24 172,184 128,192" fill={`url(#${id('front')})`} />
      <polygon points="128,14 172,24 172,26 128,17" fill="#4a4e5c" />
      {fans.map((cy) => (
        <g key={cy}>
          <ellipse cx="150" cy={cy + 6} rx="15" ry="20" fill="#c46bff" opacity="0.65" filter={`url(#${id('glow')})`} />
          <ellipse cx="150" cy={cy + 6} rx="15" ry="20" fill={`url(#${id('fan')})`} />
          <ellipse cx="150" cy={cy + 6} rx="15" ry="20" fill="none" stroke="#e7a6ff" strokeWidth="2.2" />
          <ellipse cx="150" cy={cy + 6} rx="5" ry="7" fill="#24113a" stroke="#8d4fd0" strokeWidth="1" />
        </g>
      ))}

      {/* Kanten / Füße */}
      <line x1="128" y1="14" x2="128" y2="192" stroke="#5a5f6e" strokeWidth="1.2" />
      <polygon points="28,30 128,14 128,17 28,33" fill="#555a68" />
      <rect x="36" y="180" width="14" height="5" rx="2" fill="#0a0b0f" />
      <rect x="150" y="186" width="14" height="5" rx="2" fill="#0a0b0f" />
    </svg>
  );
}
