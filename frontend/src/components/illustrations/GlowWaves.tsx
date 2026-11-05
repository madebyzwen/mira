import { useId } from 'react';

/** Leuchtende Wellen-Flächen für den Login-Hintergrund und die Sidebar. */
export function GlowWave({ className, flip = false }: { className?: string; flip?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  return (
    <svg
      className={className}
      viewBox="0 0 900 420"
      preserveAspectRatio="none"
      aria-hidden
      style={flip ? { transform: 'scale(-1, -1)' } : undefined}
    >
      <defs>
        <linearGradient id={id('fill')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a14ad" stopOpacity="0.75" />
          <stop offset="0.55" stopColor="#1e0850" stopOpacity="0.45" />
          <stop offset="1" stopColor="#0a0420" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('edge')} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7d2cf0" stopOpacity="0" />
          <stop offset="0.35" stopColor="#c46bff" stopOpacity="1" />
          <stop offset="0.6" stopColor="#f3d9ff" stopOpacity="1" />
          <stop offset="1" stopColor="#8f3df5" stopOpacity="0" />
        </linearGradient>
        <filter id={id('blur')} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      {/* hintere, weiche Fläche */}
      <path d="M0 0 H900 C760 40 640 120 500 210 C360 300 200 340 0 380 Z" fill={`url(#${id('fill')})`} opacity="0.55" />
      {/* vordere Fläche */}
      <path d="M0 0 H820 C700 60 600 150 470 220 C330 295 170 310 0 330 Z" fill={`url(#${id('fill')})`} />
      {/* Lichtkante */}
      <path
        d="M0 330 C170 310 330 295 470 220 C600 150 700 60 820 0"
        fill="none"
        stroke={`url(#${id('edge')})`}
        strokeWidth="10"
        filter={`url(#${id('blur')})`}
      />
      <path d="M0 330 C170 310 330 295 470 220 C600 150 700 60 820 0" fill="none" stroke={`url(#${id('edge')})`} strokeWidth="2" />
    </svg>
  );
}
