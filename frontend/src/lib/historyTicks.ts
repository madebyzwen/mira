import type { HistoryResponse } from '@mira/shared';
import type { ChartTick } from '../types/models';

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Beschriftung der x-Achse aus den Zeitstempeln des Verlaufs (Ortszeit):
 * 24 h → alle 4 Stunden, 7 Tage → täglich, 30 Tage → alle 5 Tage.
 * Positionen passen zu den Punkten des Diagramms (erster Punkt links, letzter rechts).
 */
export function historyTicks(history: HistoryResponse): ChartTick[] {
  const { points } = history;
  if (points.length < 2) return [];
  const from = new Date(points[0].ts).getTime();
  const to = new Date(points[points.length - 1].ts).getTime();
  const span = to - from;
  const ticks: ChartTick[] = [];
  const push = (t: number, label: string) => {
    const at = (t - from) / span;
    // Ganz am Rand würden die Beschriftungen abgeschnitten
    if (at >= 0.03 && at <= 0.97) ticks.push({ at, label });
  };

  const d = new Date(from);
  if (history.range === '24h') {
    d.setMinutes(0, 0, 0);
    for (; d.getTime() <= to; d.setHours(d.getHours() + 1)) {
      if (d.getTime() >= from && d.getHours() % 4 === 0) push(d.getTime(), `${pad(d.getHours())}:00`);
    }
    return ticks;
  }

  const every = history.range === '7d' ? 1 : 5;
  d.setHours(0, 0, 0, 0);
  for (; d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    // Fester Raster (Tage seit 1970), damit die Beschriftungen nicht täglich springen
    const dayNumber = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
    if (d.getTime() >= from && dayNumber % every === 0) push(d.getTime(), `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`);
  }
  return ticks;
}
