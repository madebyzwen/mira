import { useId } from 'react';
import type { ChartTick } from '../../types/models';

export type SeriesColor = 'violet' | 'cyan';

const colors: Record<SeriesColor, { line: string; fillTop: string }> = {
  violet: { line: '#c04cf5', fillTop: 'rgba(150, 40, 235, 0.75)' },
  cyan: { line: '#1fb6f5', fillTop: 'rgba(31, 182, 245, 0.18)' },
};

export interface ChartSeries {
  label: string;
  /** `null` = keine Messung → die Linie wird dort unterbrochen (Lücke bleibt sichtbar) */
  values: (number | null)[];
  color: SeriesColor;
}

interface TimeSeriesChartProps {
  series: ChartSeries[];
  ticks: ChartTick[];
  yMax: number;
  yStep: number;
  formatY: (value: number) => string;
  /** Flächenfüllung unter der ersten Reihe */
  area?: 'strong' | 'soft';
  /** Markierung + Wert am rechten Ende der ersten Reihe */
  endLabel?: string;
  legend?: boolean;
  height?: number;
  ariaLabel: string;
  /** Hinweis, wenn keine Reihe einen Wert enthält (z. B. „Verlauf wird aufgebaut …“) */
  emptyText?: string;
}

const VB_W = 1000;
const VB_H = 300;

type Point = [number, number];

/** Zerlegt eine Reihe an fehlenden Werten in zusammenhängende Abschnitte. */
function toSegments(values: (number | null)[], yMax: number): Point[][] {
  const n = values.length;
  const segments: Point[][] = [];
  let current: Point[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    const x = n > 1 ? (i / (n - 1)) * VB_W : 0;
    current.push([x, VB_H - (Math.min(Math.max(v, 0), yMax) / yMax) * VB_H]);
  });
  if (current.length) segments.push(current);
  return segments;
}

function linePath(points: Point[]): string {
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  // Einzelner Messpunkt zwischen zwei Lücken: als kurzer Strich (runde Kappe → Punkt) zeichnen
  return points.length === 1 ? `${path} h1` : path;
}

function areaPath(points: Point[]): string {
  const firstX = points[0][0];
  const lastX = points[points.length - 1][0] + (points.length === 1 ? 1 : 0);
  return `${linePath(points)} L${lastX.toFixed(1)} ${VB_H} L${firstX.toFixed(1)} ${VB_H} Z`;
}

export function TimeSeriesChart({
  series,
  ticks,
  yMax,
  yStep,
  formatY,
  area = 'soft',
  endLabel,
  legend = false,
  height = 160,
  ariaLabel,
  emptyText,
}: TimeSeriesChartProps) {
  const uid = useId().replace(/:/g, '');
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) yTicks.push(v);

  const first = series[0];
  const lastValue = first?.values.at(-1) ?? null;
  const isEmpty = series.every((s) => s.values.every((v) => v === null));

  return (
    <figure className="ts-chart" aria-label={ariaLabel} role="img">
      <div className="ts-chart__grid" style={{ height }}>
        <div className="ts-chart__y">
          {yTicks.map((v) => (
            <span key={v} style={{ bottom: `${(v / yMax) * 100}%` }}>
              {formatY(v)}
            </span>
          ))}
        </div>
        <div className="ts-chart__plot">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.label} id={`${uid}-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={colors[s.color].fillTop} />
                  <stop offset="1" stopColor={colors[s.color].fillTop} stopOpacity={area === 'strong' && i === 0 ? 0.12 : 0} />
                </linearGradient>
              ))}
            </defs>
            {yTicks.map((v) => (
              <line
                key={v}
                className="ts-chart__gridline"
                x1={0}
                x2={VB_W}
                y1={VB_H - (v / yMax) * VB_H}
                y2={VB_H - (v / yMax) * VB_H}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map((s, i) => {
              const segments = toSegments(s.values, yMax);
              return (
                <g key={s.label}>
                  {segments.map((seg) => (
                    <path key={`a${seg[0][0]}`} d={areaPath(seg)} fill={`url(#${uid}-fill-${i})`} />
                  ))}
                  {segments.map((seg) => (
                    <path
                      key={`l${seg[0][0]}`}
                      d={linePath(seg)}
                      fill="none"
                      stroke={colors[s.color].line}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      className={`ts-chart__line ts-chart__line--${s.color}`}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          {isEmpty && emptyText && <span className="ts-chart__empty">{emptyText}</span>}
          {endLabel && lastValue !== null && (
            <>
              <span className="ts-chart__marker" style={{ bottom: `${(lastValue / yMax) * 100}%` }} />
              <span className="ts-chart__marker-label" style={{ bottom: `${(lastValue / yMax) * 100}%` }}>
                {endLabel}
              </span>
            </>
          )}
        </div>
        <div className="ts-chart__x">
          {ticks.map((t) => (
            <span key={t.label} style={{ left: `${t.at * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {legend && (
        <figcaption className="ts-chart__legend">
          {series.map((s) => (
            <span key={s.label} className="ts-chart__legend-item">
              <span className={`ts-chart__legend-dot ts-chart__legend-dot--${s.color}`} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
