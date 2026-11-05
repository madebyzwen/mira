import { useId } from 'react';

/**
 * Zwischenstecker mit violettem LED-Ring in Dreiviertel-Ansicht.
 * Aufbau (hinten → vorne): Schatten, Stifte, Gehäusezylinder, Leuchtring,
 * Frontfläche, vertiefte Schuko-Dose.
 */
export function ShellyPlugIllustration({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;

  // Geometrie
  const front = { cx: 168, cy: 100, rx: 58, ry: 72 };
  const back = { cx: 114, cy: 91 };

  return (
    <svg className={className} viewBox="0 0 250 200" role="img" aria-label="Shelly Plug">
      <defs>
        {/* Metallische Stifte */}
        <linearGradient id={id('pin')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfbfd" />
          <stop offset="0.35" stopColor="#d4d4dc" />
          <stop offset="0.7" stopColor="#8d8d99" />
          <stop offset="1" stopColor="#55555f" />
        </linearGradient>
        <linearGradient id={id('pinFar')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9c9d1" />
          <stop offset="0.5" stopColor="#85858f" />
          <stop offset="1" stopColor="#45454e" />
        </linearGradient>

        {/* Gehäusezylinder: links im Schatten, zur Front hin hell */}
        <linearGradient id={id('body')} gradientUnits="userSpaceOnUse" x1="54" y1="0" x2="172" y2="0">
          <stop offset="0" stopColor="#8e8e9b" />
          <stop offset="0.22" stopColor="#c4c4cf" />
          <stop offset="0.55" stopColor="#ececf1" />
          <stop offset="0.85" stopColor="#f8f8fb" />
          <stop offset="1" stopColor="#dcdce4" />
        </linearGradient>
        <linearGradient id={id('bodyShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.75" stopColor="#3a3a48" stopOpacity="0" />
          <stop offset="1" stopColor="#3a3a48" stopOpacity="0.45" />
        </linearGradient>
        {/* violetter Widerschein des LED-Rings auf dem Gehäuse */}
        <linearGradient id={id('bodyGlow')} gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="168" y2="0">
          <stop offset="0" stopColor="#b44cff" stopOpacity="0" />
          <stop offset="1" stopColor="#b44cff" stopOpacity="0.35" />
        </linearGradient>

        {/* Frontfläche */}
        <radialGradient id={id('face')} cx="0.42" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f3f3f7" />
          <stop offset="1" stopColor="#d9d9e2" />
        </radialGradient>
        <linearGradient id={id('bezel')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6f6f9" />
          <stop offset="1" stopColor="#c3c3ce" />
        </linearGradient>

        {/* Dose */}
        <radialGradient id={id('recessWall')} cx="0.7" cy="0.55" r="0.75">
          <stop offset="0" stopColor="#d8d8e0" />
          <stop offset="1" stopColor="#a9a9b6" />
        </radialGradient>
        <radialGradient id={id('recessFloor')} cx="0.45" cy="0.38" r="0.75">
          <stop offset="0" stopColor="#fbfbfd" />
          <stop offset="1" stopColor="#dadae2" />
        </radialGradient>
        <radialGradient id={id('hole')} cx="0.6" cy="0.6" r="0.6">
          <stop offset="0" stopColor="#1d1d24" />
          <stop offset="1" stopColor="#4a4a55" />
        </radialGradient>
        <linearGradient id={id('clip')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a8a95" />
          <stop offset="0.5" stopColor="#f2f2f6" />
          <stop offset="1" stopColor="#9a9aa5" />
        </linearGradient>

        {/* Leuchteffekte */}
        <filter id={id('ledBlur')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={id('soft')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#9b30ff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#9b30ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.75" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('bodyClip')}>
          <path d={bodyPath(back, front)} />
          <ellipse cx={back.cx} cy={back.cy} rx={front.rx} ry={front.ry} />
        </clipPath>
      </defs>

      {/* Umgebung */}
      <ellipse cx="172" cy="100" rx="88" ry="96" fill={url('halo')} />
      <ellipse cx="140" cy="182" rx="92" ry="10" fill={url('shadow')} />

      {/* Steckerstifte (hinter dem Gehäuse) */}
      <rect x="20" y="99" width="76" height="10" rx="5" fill={url('pinFar')} />
      <rect x="8" y="80" width="88" height="12" rx="6" fill={url('pin')} />
      <ellipse cx="14" cy="86" rx="2.2" ry="5" fill="#ffffff" opacity="0.5" />

      {/* Gehäusezylinder */}
      <g clipPath={url('bodyClip')}>
        <rect x="40" y="10" width="140" height="180" fill={url('body')} />
        <rect x="40" y="10" width="140" height="180" fill={url('bodyShade')} />
        <rect x="40" y="10" width="140" height="180" fill={url('bodyGlow')} />
        {/* Glanzlicht */}
        <path d="M84 40 C 104 26, 136 24, 160 32" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.85" filter={url('soft')} />
      </g>
      {/* Logo auf der Gehäuseseite */}
      <text
        x="66"
        y="58"
        fontFamily="'Brush Script MT', 'Segoe Script', Georgia, serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="14"
        fill="#7f7f8c"
        transform="rotate(16 66 58)"
      >
        Shelly
      </text>

      {/* Front: Lünette, LED-Ring, Fläche */}
      <ellipse cx={front.cx} cy={front.cy} rx={front.rx + 4} ry={front.ry + 4} fill={url('bezel')} />
      <ellipse
        cx={front.cx}
        cy={front.cy}
        rx={front.rx + 1}
        ry={front.ry + 1}
        fill="none"
        stroke="#b23cff"
        strokeWidth="14"
        filter={url('ledBlur')}
      />
      <ellipse cx={front.cx} cy={front.cy} rx={front.rx + 1} ry={front.ry + 1} fill="none" stroke="#c24dff" strokeWidth="4.5" />
      <ellipse cx={front.cx} cy={front.cy} rx={front.rx + 1} ry={front.ry + 1} fill="none" stroke="#f4dcff" strokeWidth="1.3" />
      <ellipse cx={front.cx} cy={front.cy} rx={front.rx - 2} ry={front.ry - 2} fill={url('face')} />
      <ellipse cx={front.cx} cy={front.cy} rx={front.rx - 2} ry={front.ry - 2} fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />

      {/* Vertiefte Schuko-Dose */}
      <ellipse cx={front.cx + 3} cy={front.cy + 1} rx="41" ry="51" fill={url('recessWall')} />
      <ellipse cx={front.cx + 7} cy={front.cy + 3} rx="36" ry="46" fill={url('recessFloor')} />
      <ellipse cx={front.cx + 3} cy={front.cy + 1} rx="41" ry="51" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.8" />
      {/* Erdungsbügel */}
      <rect x={front.cx + 1} y={front.cy - 47} width="13" height="6" rx="2" fill={url('clip')} />
      <rect x={front.cx + 1} y={front.cy + 48} width="13" height="6" rx="2" fill={url('clip')} />
      {/* Kontaktöffnungen */}
      <ellipse cx={front.cx - 7} cy={front.cy + 3} rx="5" ry="6.5" fill={url('hole')} />
      <ellipse cx={front.cx + 21} cy={front.cy + 3} rx="5" ry="6.5" fill={url('hole')} />
      <ellipse cx={front.cx - 6} cy={front.cy + 5} rx="4" ry="5" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
      <ellipse cx={front.cx + 22} cy={front.cy + 5} rx="4" ry="5" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
    </svg>
  );
}

/** Mantelfläche zwischen hinterer und vorderer Ellipse (obere und untere Tangente). */
function bodyPath(back: { cx: number; cy: number }, front: { cx: number; cy: number; rx: number; ry: number }): string {
  const top = (c: { cx: number; cy: number }) => `${c.cx} ${c.cy - front.ry}`;
  const bottom = (c: { cx: number; cy: number }) => `${c.cx} ${c.cy + front.ry}`;
  return `M ${top(back)} L ${top(front)} A ${front.rx} ${front.ry} 0 0 1 ${bottom(front)} L ${bottom(back)} Z`;
}
