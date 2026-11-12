import type { SampleQuality } from '@mira/shared';
import type { MeterReading } from './shelly/client.ts';
import type { EnergyGap, MeterState, PowerSample, Store } from './store.ts';
import { addDays, dayKeyOf, startOfDay } from './time.ts';

export const BUCKET_MS = 30_000;

export interface AggregatorOptions {
  store: Store;
  timeZone: string;
  pollIntervalMs: number;
  /** Ab dieser Lücke zwischen zwei Zählerständen gilt die Energie als „rekonstruiert“ */
  staleAfterMs: number;
  /** Plausibilitätsgrenze der Leistung in W */
  maxPowerW: number;
}

/** Beginn des 30-s-Intervalls (UTC, ausgerichtet an :00/:30 – fällt damit auch auf lokale Mitternacht) */
export const bucketStart = (ts: number) => Math.floor(ts / BUCKET_MS) * BUCKET_MS;

/**
 * Sammelt Live-Messungen im Speicher und schreibt je 30 Sekunden einen verdichteten
 * Datensatz.
 *
 * Leistung: zeitgewichteter Mittelwert – jede Messung gilt bis zur nächsten, höchstens
 * aber zwei Abfrageintervalle lang. Was nicht abgedeckt ist, bleibt unbekannt (nie 0 W).
 *
 * Energie: ausschließlich aus dem Zählerstand des Shelly (`aenergy.total`), paarweise
 * zwischen aufeinanderfolgenden Zählerständen:
 * - normale Differenz → gemessener Verbrauch des Intervalls
 * - Rücksprung des Zählers (Neustart/Reset des Shelly) → Zählerstand danach zählt ab 0 weiter
 * - Sprung über der physikalischen Grenze → unplausibel, wird nicht verbucht
 * - längere Lücke (Ausfall, Neustart des Loggers) → Differenz als „rekonstruiert“
 *   (Summe sicher, Verteilung unbekannt), je Kalendertag zeitanteilig aufgeteilt – auch wenn
 *   die Lücke innerhalb eines einzigen 30-s-Intervalls liegt
 *
 * Der zuletzt verbuchte Zählerstand wird mit jedem Intervall in derselben Transaktion
 * gespeichert – nach einem Neustart wird nichts doppelt gezählt.
 */
export class Aggregator {
  private readonly store: Store;
  private readonly timeZone: string;
  private readonly holdMs: number;
  private readonly gapMs: number;
  private readonly maxPowerW: number;
  private pending: MeterReading[] = [];
  /** letzte Messung des zuletzt geschriebenen Intervalls (für die Gewichtung am Intervallanfang) */
  private carry: MeterReading | null = null;
  private meter: MeterState | null;
  private deviceId: string | null = null;
  /** Messungen vor diesem Zeitpunkt gehören zu bereits geschriebenen Intervallen */
  private closedUntil = 0;
  /** wird nach jedem Schreiben erhöht (für Zwischenspeicher der Auswertungen) */
  version = 0;

  constructor(options: AggregatorOptions) {
    this.store = options.store;
    this.timeZone = options.timeZone;
    this.holdMs = Math.min(2 * options.pollIntervalMs, options.staleAfterMs);
    this.gapMs = Math.max(options.staleAfterMs, 3 * options.pollIntervalMs);
    this.maxPowerW = options.maxPowerW;
    this.meter = this.store.meterState();
  }

  /** Gerät bekannt geben; ein anderes Gerät als zuletzt bedeutet einen neuen Zähler. */
  setDevice(id: string): void {
    this.deviceId = id;
    if (this.meter && this.meter.deviceId !== null && this.meter.deviceId !== id) {
      this.store.resetMeterState();
      this.meter = null;
    }
  }

  add(reading: MeterReading): void {
    if (reading.ts < this.closedUntil) return;
    const last = this.pending.at(-1);
    if (last && reading.ts < last.ts) return;
    this.pending.push(reading);
  }

  /** Verbrauch seit dem letzten geschriebenen Intervall (noch im Speicher) – für „bis jetzt“-Summen */
  pendingEnergyWh(): number {
    const counters = this.pending.filter((r) => r.energyTotalWh !== null);
    const last = counters.at(-1);
    if (!last) return 0;
    // Bezug: zuletzt verbuchter Zählerstand; bei ganz neuer Datenbank die erste Messung
    const base = this.meter ?? { ts: counters[0].ts, totalWh: counters[0].energyTotalWh! };
    const d = last.energyTotalWh! - base.totalWh;
    return d >= 0 && last.ts - base.ts <= this.gapMs + BUCKET_MS && d <= this.plausibleWh(last.ts - base.ts) ? d : 0;
  }

  /** Abgeschlossene Intervalle schreiben (Intervallende + kurze Wartezeit für späte Antworten vorbei). */
  flushDue(now: number, graceMs = 1_500): number {
    let written = 0;
    while (this.pending.length) {
      const start = bucketStart(this.pending[0].ts);
      if (start + BUCKET_MS > now - graceMs) break;
      this.writeBucket(start, false);
      written += 1;
    }
    return written;
  }

  /** Beim Beenden: auch das laufende Intervall schreiben (als Teilintervall). */
  flushAll(): number {
    let written = 0;
    while (this.pending.length) {
      this.writeBucket(bucketStart(this.pending[0].ts), true);
      written += 1;
    }
    return written;
  }

  private plausibleWh(ms: number): number {
    return (this.maxPowerW * Math.max(ms, 1_000)) / 3_600_000 * 1.2 + 0.05;
  }

  private writeBucket(start: number, open: boolean): void {
    const end = start + BUCKET_MS;
    const readings: MeterReading[] = [];
    while (this.pending.length && this.pending[0].ts < end) readings.push(this.pending.shift()!);
    this.closedUntil = end;
    if (!readings.length) return;

    // ---- Leistung (zeitgewichtet)
    let weighted = 0;
    let covered = 0;
    const segment = (r: MeterReading, from: number, until: number) => {
      const d = Math.max(0, Math.min(until, r.ts + this.holdMs, end) - from);
      weighted += r.powerW * d;
      covered += d;
    };
    if (this.carry && this.carry.ts >= start - this.holdMs) segment(this.carry, start, readings[0].ts);
    readings.forEach((r, i) => segment(r, r.ts, readings[i + 1]?.ts ?? (open ? r.ts + this.holdMs : end)));
    const powers = readings.map((r) => r.powerW);
    const voltages = readings.map((r) => r.voltageV).filter((v): v is number => v !== null);

    // ---- Energie (paarweise aus dem Zählerstand)
    let quality: SampleQuality = covered >= BUCKET_MS * 0.9 ? 'ok' : 'partial';
    const counters = readings.filter((r) => r.energyTotalWh !== null);
    let energy: number | null = counters.length ? 0 : null;
    const gaps: EnergyGap[] = [];
    let prev: { ts: number; totalWh: number } | null = this.meter;
    for (const r of counters) {
      const total = r.energyTotalWh!;
      if (prev) {
        const dt = r.ts - prev.ts;
        const d = total - prev.totalWh;
        if (d < -0.001) {
          // Zähler zurückgesetzt: der neue Stand ist seit dem Reset verbraucht
          quality = 'counter_reset';
          if (total <= this.plausibleWh(dt)) energy! += total;
        } else if (d > this.plausibleWh(dt)) {
          quality = 'implausible';
        } else if (dt > this.gapMs) {
          // Lücke zwischen zwei Zählerständen – unabhängig davon, ob sie eine Intervallgrenze
          // überschreitet: Summe aus dem Zähler sicher, Verteilung unbekannt → rekonstruiert
          gaps.push(...this.splitGap(prev.ts, r.ts, d));
        } else {
          energy! += Math.max(d, 0);
        }
      }
      prev = { ts: r.ts, totalWh: total };
    }

    const sample: PowerSample = {
      start,
      end,
      avgW: covered > 0 ? weighted / covered : powers.reduce((a, b) => a + b, 0) / powers.length,
      minW: Math.min(...powers),
      maxW: Math.max(...powers),
      sampleCount: readings.length,
      coveredMs: Math.round(covered),
      avgVoltage: voltages.length ? voltages.reduce((a, b) => a + b, 0) / voltages.length : null,
      energyWh: energy,
      quality,
    };
    const meter: MeterState | null = prev ? { ts: prev.ts, totalWh: prev.totalWh, deviceId: this.deviceId ?? this.meter?.deviceId ?? null } : null;
    this.store.writeInterval(sample, gaps, meter);
    this.meter = meter;
    this.carry = readings.at(-1)!;
    this.version += 1;
  }

  /** Energie eines Ausfalls zeitanteilig auf die betroffenen Kalendertage aufteilen. */
  private splitGap(from: number, to: number, energyWh: number): EnergyGap[] {
    if (energyWh <= 0) return [];
    const parts: EnergyGap[] = [];
    let cursor = from;
    while (cursor < to) {
      const next = Math.min(to, startOfDay(addDays(dayKeyOf(cursor, this.timeZone), 1), this.timeZone));
      parts.push({ start: cursor, end: next, energyWh: (energyWh * (next - cursor)) / (to - from) });
      cursor = next;
    }
    return parts;
  }
}
