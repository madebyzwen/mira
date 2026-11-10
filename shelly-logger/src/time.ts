/**
 * Kalender in einer festen Zeitzone (Standard `Europe/Berlin`) – unabhängig von der
 * Zeitzone des Containers. Gespeichert wird immer in UTC (Millisekunden); Tage,
 * Wochen, Monate und Jahre ergeben sich erst bei der Auswertung.
 *
 * Sommer-/Winterzeit: Ein Kalendertag dauert 23, 24 oder 25 Stunden. Alle Grenzen
 * werden daher über den tatsächlichen UTC-Versatz zum jeweiligen Zeitpunkt berechnet.
 */

/** Kalendertag als `JJJJ-MM-TT` */
export type DayKey = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wirft einen Fehler, wenn die Zeitzone unbekannt ist. */
export function assertTimeZone(timeZone: string): void {
  formatter(timeZone);
}

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(ts: number, timeZone: string): Wall {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** UTC-Versatz der Zeitzone zum Zeitpunkt `ts` in ms (Berlin: +1 h bzw. +2 h). */
export function offsetMs(ts: number, timeZone: string): number {
  const w = wallClock(ts, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function dayKey(year: number, month: number, day: number): DayKey {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseDayKey(key: DayKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Kalendertag (Ortszeit), in den der Zeitpunkt fällt. */
export function dayKeyOf(ts: number, timeZone: string): DayKey {
  const w = wallClock(ts, timeZone);
  return dayKey(w.year, w.month, w.day);
}

/** Gültiger Kalendertag? (z. B. kein 31.02.) */
export function isValidDayKey(key: DayKey): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Kalenderrechnung ohne Zeitzone: Tag ± n */
export function addDays(key: DayKey, n: number): DayKey {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** UTC-Zeitpunkt von 00:00 Uhr Ortszeit am angegebenen Tag. */
export function startOfDay(key: DayKey, timeZone: string): number {
  const { year, month, day } = parseDayKey(key);
  const wallMidnight = Date.UTC(year, month - 1, day);
  // Zweistufig: Der Versatz kurz vor und nach Mitternacht kann sich unterscheiden.
  let ts = wallMidnight - offsetMs(wallMidnight, timeZone);
  ts = wallMidnight - offsetMs(ts, timeZone);
  return ts;
}

/** Wochentag 1 = Montag … 7 = Sonntag */
export function weekday(key: DayKey): number {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
}

export interface CalendarPeriod {
  /** erster Tag (Ortszeit) */
  first: DayKey;
  /** erster Tag des Folgezeitraums */
  next: DayKey;
}

/** Tag, Woche (Montag–Sonntag), Monat oder Jahr, in den `key` fällt. */
export function periodOf(period: 'day' | 'week' | 'month' | 'year', key: DayKey): CalendarPeriod {
  const { year, month } = parseDayKey(key);
  switch (period) {
    case 'day':
      return { first: key, next: addDays(key, 1) };
    case 'week': {
      const first = addDays(key, 1 - weekday(key));
      return { first, next: addDays(first, 7) };
    }
    case 'month':
      return { first: dayKey(year, month, 1), next: month === 12 ? dayKey(year + 1, 1, 1) : dayKey(year, month + 1, 1) };
    case 'year':
      return { first: dayKey(year, 1, 1), next: dayKey(year + 1, 1, 1) };
  }
}

/** Alle Tage von `first` (einschließlich) bis `next` (ausschließlich). */
export function daysBetween(first: DayKey, next: DayKey): DayKey[] {
  const days: DayKey[] = [];
  for (let d = first; d < next; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Nächster Zeitpunkt nach `from`, an dem die Ortszeit `HH:MM` ist. */
export function nextLocalTime(time: string, from: number, timeZone: string): number {
  const [h, m] = time.split(':').map(Number);
  let key = dayKeyOf(from, timeZone);
  for (let i = 0; i < 3; i++) {
    const start = startOfDay(key, timeZone);
    // Uhrzeit innerhalb des Tages über die Wanduhr bestimmen (robust bei Zeitumstellung)
    const candidate = start + (h * 60 + m) * 60_000;
    const corrected = candidate - (offsetMs(candidate, timeZone) - offsetMs(start, timeZone));
    if (corrected > from) return corrected;
    key = addDays(key, 1);
  }
  throw new Error(`Keine nächste Ausführung für ${time} gefunden`);
}
