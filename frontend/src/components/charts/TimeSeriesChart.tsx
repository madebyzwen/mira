import { useId, useState, type PointerEvent } from 'react';
import type { ChartTick } from '../../types/models';
import { rem } from '../../lib/size';

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

/** Eine Ebene des Diagramms: eigene y-Achse (eine Einheit), gemeinsame Zeitachse. */
export interface ChartPanel {
  /** Überschrift der Ebene in der Werteanzeige, z. B. „Auslastung“ */
  label?: string;
  series: ChartSeries[];
  yMax: number;
  yStep: number;
  formatY: (value: number) => string;
  /** Darstellung der Werte in der Werteanzeige (Standard: wie die y-Achse) */
  formatValue?: (value: number) => string;
  /** Höhe der Zeichenfläche in px (Entwurf; gesetzt als rem, skaliert mit der Grundgröße) */
  height: number;
  /** Flächenfüllung unter den Linien */
  area?: 'strong' | 'soft' | 'none';
}

interface MultiPanelChartProps {
  panels: ChartPanel[];
  ticks: ChartTick[];
  ariaLabel: string;
  legend?: boolean;
  /** Hinweis, wenn keine Reihe einen Wert enthält (z. B. „Verlauf wird aufgebaut …“) */
  emptyText?: string;
  /** Zeit je Punkt – aktiviert die Werteanzeige beim Überfahren mit Maus oder Finger */
  pointLabels?: string[];
  /** Markierung + Wert am rechten Ende der ersten Reihe der ersten Ebene */
  endLabel?: string;
}

const VB_W = 1000;
const VB_H = 300;
/** Abstand zwischen zwei Ebenen in px (Entwurf; gesetzt als rem) */
const PANEL_GAP = 28;
const X_AXIS_HEIGHT = 30;

type Point = [number, number];

const clampTo = (v: number, yMax: number) => Math.min(Math.max(v, 0), yMax);

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
    current.push([x, VB_H - (clampTo(v, yMax) / yMax) * VB_H]);
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

function yTicksOf(yMax: number, yStep: number): number[] {
  const ticks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) ticks.push(v);
  return ticks;
}

/**
 * Zeitreihen-Diagramm mit einer oder mehreren Ebenen untereinander (gemeinsame
 * Zeitachse). Jede Ebene hat genau eine Einheit; die Werteanzeige beim Überfahren
 * zeigt die Werte aller Ebenen zum selben Zeitpunkt.
 */
export function MultiPanelChart({ panels, ticks, ariaLabel, legend = false, emptyText, pointLabels, endLabel }: MultiPanelChartProps) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const allSeries = panels.flatMap((p) => p.series);
  const count = Math.max(0, ...allSeries.map((s) => s.values.length));
  const interactive = Boolean(pointLabels) && count > 1;
  const hoverIndex = interactive && hover !== null && hover < count ? hover : null;
  const isEmpty = allSeries.every((s) => s.values.every((v) => v === null));

  // Oberkante jeder Ebene (px), für die Punkte der Werteanzeige
  const tops = panels.map((_, i) => panels.slice(0, i).reduce((sum, p) => sum + p.height + PANEL_GAP, 0));
  const plotsHeight = tops[tops.length - 1] + panels[panels.length - 1].height;
  const rows = panels.flatMap((p, i) => (i === 0 ? [rem(p.height)] : [rem(PANEL_GAP), rem(p.height)]));
  const rowOf = (i: number) => i * 2 + 1;
  const xRow = rows.length + 1;

  // Legende: jede Farbe (= Bauteil) einmal, auch wenn sie in mehreren Ebenen vorkommt
  const legendItems = allSeries.filter((s, i) => allSeries.findIndex((o) => o.label === s.label && o.color === s.color) === i);

  /** Nächstgelegenen Punkt zur Zeigerposition bestimmen */
  const track = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    setHover(Math.round((x / rect.width) * (count - 1)));
  };

  const first = panels[0].series[0];
  const lastValue = first?.values.at(-1) ?? null;

  return (
    <figure className="ts-chart" aria-label={ariaLabel} role="img">
      <div className="ts-chart__grid" style={{ gridTemplateRows: `${rows.join(' ')} ${rem(X_AXIS_HEIGHT)}` }}>
        {panels.map((panel, pi) => {
          const yTicks = yTicksOf(panel.yMax, panel.yStep);
          const area = panel.area ?? 'soft';
          return [
            <div key={`y${pi}`} className="ts-chart__y" style={{ gridRow: rowOf(pi) }}>
              {yTicks.map((v) => (
                <span key={v} style={{ bottom: `${(v / panel.yMax) * 100}%` }}>
                  {panel.formatY(v)}
                </span>
              ))}
            </div>,
            <div key={`p${pi}`} className="ts-chart__plot" style={{ gridRow: rowOf(pi) }}>
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden>
                <defs>
                  {panel.series.map((s, i) => (
                    <linearGradient key={s.label} id={`${uid}-fill-${pi}-${i}`} x1="0" y1="0" x2="0" y2="1">
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
                    y1={VB_H - (v / panel.yMax) * VB_H}
                    y2={VB_H - (v / panel.yMax) * VB_H}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {panel.series.map((s, i) => {
                  const segments = toSegments(s.values, panel.yMax);
                  return (
                    <g key={s.label}>
                      {area !== 'none' &&
                        segments.map((seg) => <path key={`a${seg[0][0]}`} d={areaPath(seg)} fill={`url(#${uid}-fill-${pi}-${i})`} />)}
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
              {pi === 0 && endLabel && lastValue !== null && (
                <>
                  <span className="ts-chart__marker" style={{ bottom: `${(lastValue / panel.yMax) * 100}%` }} />
                  <span className="ts-chart__marker-label" style={{ bottom: `${(lastValue / panel.yMax) * 100}%` }}>
                    {endLabel}
                  </span>
                </>
              )}
            </div>,
          ];
        })}

        {/* Fläche über allen Ebenen: Zeigerposition, Werteanzeige, Hinweis bei fehlenden Daten */}
        <div
          className={['ts-chart__overlay', interactive && 'is-interactive'].filter(Boolean).join(' ')}
          style={{ gridRow: `1 / ${xRow}` }}
          onPointerMove={interactive ? track : undefined}
          onPointerDown={interactive ? track : undefined}
          onPointerLeave={interactive ? () => setHover(null) : undefined}
        >
          {isEmpty && emptyText && <span className="ts-chart__empty">{emptyText}</span>}
          {hoverIndex !== null && pointLabels && (
            <HoverInfo
              index={hoverIndex}
              left={(hoverIndex / (count - 1)) * 100}
              label={pointLabels[hoverIndex] ?? ''}
              panels={panels}
              tops={tops}
              plotsHeight={plotsHeight}
            />
          )}
        </div>

        <div className="ts-chart__x" style={{ gridRow: xRow }}>
          {ticks.map((t) => (
            <span key={t.label} style={{ left: `${t.at * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {legend && (
        <figcaption className="ts-chart__legend">
          {legendItems.map((s) => (
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

interface HoverInfoProps {
  index: number;
  /** Position in Prozent der Breite */
  left: number;
  label: string;
  panels: ChartPanel[];
  tops: number[];
  plotsHeight: number;
}

/** Senkrechte Linie über alle Ebenen, Punkte auf den Reihen und Werte-Box zur Zeigerposition. */
function HoverInfo({ index, left, label, panels, tops, plotsHeight }: HoverInfoProps) {
  return (
    <>
      <span className="ts-chart__cursor" style={{ left: `${left}%`, height: rem(plotsHeight) }} />
      {panels.flatMap((panel, pi) =>
        panel.series.map((s) => {
          const v = s.values[index];
          if (v === null || v === undefined) return null;
          const top = tops[pi] + (1 - clampTo(v, panel.yMax) / panel.yMax) * panel.height;
          return <span key={`${pi}-${s.label}`} className={`ts-chart__dot ts-chart__dot--${s.color}`} style={{ left: `${left}%`, top: rem(top) }} />;
        }),
      )}
      <div className={['ts-chart__tooltip', left > 60 && 'is-left'].filter(Boolean).join(' ')} style={{ left: `${left}%` }} role="status">
        <div className="ts-chart__tooltip-time">{label}</div>
        {panels.map((panel, pi) => (
          <div key={pi} className="ts-chart__tooltip-group">
            {panel.label && panels.length > 1 && <div className="ts-chart__tooltip-heading">{panel.label}</div>}
            {panel.series.map((s) => {
              const v = s.values[index];
              const format = panel.formatValue ?? panel.formatY;
              return (
                <div key={s.label} className="ts-chart__tooltip-row">
                  <span className={`ts-chart__legend-dot ts-chart__legend-dot--${s.color}`} />
                  <span>{s.label}</span>
                  <strong>{v === null || v === undefined ? 'keine Messung' : format(v)}</strong>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
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
  /** Gesamthöhe inkl. Zeitachse in px (Entwurf; gesetzt als rem) */
  height?: number;
  ariaLabel: string;
  emptyText?: string;
  pointLabels?: string[];
  formatValue?: (value: number) => string;
}

/** Diagramm mit einer Ebene (z. B. Leistung des Shelly Plug). */
export function TimeSeriesChart({ series, yMax, yStep, formatY, formatValue, area = 'soft', height = 160, ...rest }: TimeSeriesChartProps) {
  return <MultiPanelChart panels={[{ series, yMax, yStep, formatY, formatValue, area, height: height - X_AXIS_HEIGHT }]} {...rest} />;
}
