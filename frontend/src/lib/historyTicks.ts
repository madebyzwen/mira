import type { ChartRange, ChartTick } from '../types/models';

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ddmm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;

/**
 * Beschriftung der x-Achse aus den Zeitpunkten eines Verlaufs (Ortszeit):
 * 1 h → alle 10 Minuten, 24 h → alle 4 Stunden, 7 Tage → täglich, 30 Tage → alle 5 Tage.
 * Positionen passen zu den Punkten des Diagramms (erster Punkt links, letzter rechts).
 */
export function historyTicks(range: ChartRange, timestamps: string[]): ChartTick[] {
  if (timestamps.length < 2) return [];
  const from = new Date(timestamps[0]).getTime();
  const to = new Date(timestamps[timestamps.length - 1]).getTime();
  const span = to - from;
  const ticks: ChartTick[] = [];
  const push = (t: number, label: string) => {
    const at = (t - from) / span;
    // Ganz am Rand würden die Beschriftungen abgeschnitten
    if (at >= 0.03 && at <= 0.97) ticks.push({ at, label });
  };

  const d = new Date(from);
  if (range === '1h' || range === '24h') {
    const minutes = range === '1h' ? 10 : 4 * 60;
    d.setSeconds(0, 0);
    for (; d.getTime() <= to; d.setMinutes(d.getMinutes() + 1)) {
      if ((d.getHours() * 60 + d.getMinutes()) % minutes === 0) push(d.getTime(), hhmm(d));
    }
    return ticks;
  }

  const every = range === '7d' ? 1 : 5;
  d.setHours(0, 0, 0, 0);
  for (; d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    // Fester Raster (Tage seit 1970), damit die Beschriftungen nicht täglich springen
    const dayNumber = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
    if (d.getTime() >= from && dayNumber % every === 0) push(d.getTime(), ddmm(d));
  }
  return ticks;
}

/**
 * Beschriftung je Punkt für die Werteanzeige beim Überfahren mit der Maus.
 * Ein Punkt steht für einen Zeitabschnitt (Mittelwert) – daher „von – bis“,
 * bei Minutenwerten nur die Uhrzeit.
 */
export function historyPointLabels(range: ChartRange, stepSeconds: number, timestamps: string[]): string[] {
  return timestamps.map((ts) => {
    const start = new Date(ts);
    const end = new Date(start.getTime() + stepSeconds * 1000);
    if (range === '1h') return `${hhmm(start)} Uhr`;
    if (range === '24h') return `${hhmm(start)} – ${hhmm(end)} Uhr`;
    return `${ddmm(start)} ${hhmm(start)} – ${ddmm(end) === ddmm(start) ? '' : `${ddmm(end)} `}${hhmm(end)} Uhr`;
  });
}
