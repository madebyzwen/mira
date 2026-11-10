import { describe, expect, it } from 'vitest';
import { addDays, dayKeyOf, daysBetween, isValidDayKey, nextLocalTime, offsetMs, periodOf, startOfDay, weekday } from '../src/time.ts';

const TZ = 'Europe/Berlin';
const t = (iso: string) => Date.parse(iso);
const H = 3_600_000;

describe('Kalender in Europe/Berlin (Speicherung in UTC)', () => {
  it('kennt Winter- und Sommerzeit', () => {
    expect(offsetMs(t('2026-01-15T12:00:00Z'), TZ)).toBe(1 * H);
    expect(offsetMs(t('2026-07-15T12:00:00Z'), TZ)).toBe(2 * H);
  });

  it('ordnet Zeitpunkte dem lokalen Kalendertag zu', () => {
    expect(dayKeyOf(t('2026-11-09T22:59:59Z'), TZ)).toBe('2026-11-09');
    expect(dayKeyOf(t('2026-11-09T23:00:00Z'), TZ)).toBe('2026-11-10');
  });

  it('Umstellung auf Sommerzeit: der Tag hat 23 Stunden', () => {
    expect(new Date(startOfDay('2026-03-29', TZ)).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(new Date(startOfDay('2026-03-30', TZ)).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(startOfDay('2026-03-30', TZ) - startOfDay('2026-03-29', TZ)).toBe(23 * H);
  });

  it('Umstellung auf Winterzeit: der Tag hat 25 Stunden', () => {
    expect(new Date(startOfDay('2026-10-25', TZ)).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(new Date(startOfDay('2026-10-26', TZ)).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(startOfDay('2026-10-26', TZ) - startOfDay('2026-10-25', TZ)).toBe(25 * H);
  });

  it('Woche beginnt montags 00:00 Uhr – auch über den Jahreswechsel', () => {
    expect(weekday('2026-11-10')).toBe(2);
    expect(periodOf('week', '2026-11-10')).toEqual({ first: '2026-11-09', next: '2026-11-16' });
    expect(periodOf('week', '2026-11-15')).toEqual({ first: '2026-11-09', next: '2026-11-16' });
    expect(periodOf('week', '2027-01-01')).toEqual({ first: '2026-12-28', next: '2027-01-04' });
  });

  it('Monat und Jahr', () => {
    expect(periodOf('month', '2026-12-31')).toEqual({ first: '2026-12-01', next: '2027-01-01' });
    expect(periodOf('month', '2028-02-10')).toEqual({ first: '2028-02-01', next: '2028-03-01' });
    expect(periodOf('year', '2026-07-01')).toEqual({ first: '2026-01-01', next: '2027-01-01' });
    expect(daysBetween('2028-02-01', '2028-03-01')).toHaveLength(29);
    expect(daysBetween('2026-01-01', '2027-01-01')).toHaveLength(365);
  });

  it('Kalenderrechnung und Prüfung von Tagen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isValidDayKey('2026-02-29')).toBe(false);
    expect(isValidDayKey('2028-02-29')).toBe(true);
    expect(isValidDayKey('2026-13-01')).toBe(false);
  });

  it('nächste Ausführung zur Ortszeit, auch über die Zeitumstellung', () => {
    expect(new Date(nextLocalTime('03:45', t('2026-11-10T10:00:00Z'), TZ)).toISOString()).toBe('2026-11-11T02:45:00.000Z');
    // vor der Umstellung (Winterzeit) → nach der Umstellung (Sommerzeit)
    expect(new Date(nextLocalTime('03:45', t('2026-03-28T12:00:00Z'), TZ)).toISOString()).toBe('2026-03-29T01:45:00.000Z');
    expect(new Date(nextLocalTime('03:45', t('2026-10-24T12:00:00Z'), TZ)).toISOString()).toBe('2026-10-25T02:45:00.000Z');
  });
});
