import { useId } from 'react';

interface SparklineProps {
  values: number[];
  min?: number;
  max?: number;
  className?: string;
}

/** Kompakter Verlauf mit Flächenfüllung (Dashboard „Verbrauch“). */
export function Sparkline({ values, min, max, className }: SparklineProps) {
  const uid = useId().replace(/:/g, '');
  const W = 300;
  const H = 80;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - ((v - lo) / span) * H] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  return (
    <svg className={['sparkline', className].filter(Boolean).join(' ')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(150, 40, 235, 0.85)" />
          <stop offset="1" stopColor="rgba(150, 40, 235, 0.05)" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${uid}-f)`} />
      <path d={line} fill="none" stroke="#d65cf7" strokeWidth={2} vectorEffect="non-scaling-stroke" className="sparkline__line" />
    </svg>
  );
}
