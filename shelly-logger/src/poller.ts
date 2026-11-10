import type { FastifyBaseLogger } from 'fastify';
import type { LiveResponse, MeterDevice, MeterError, MeterState, PollerStats } from '@mira/shared';
import { ShellyError, type MeterReading, type ShellyClient } from './shelly/client.ts';

const WINDOW_MS = 60_000;

export interface PollerOptions {
  client: ShellyClient;
  intervalMs: number;
  staleAfterMs: number;
  /** Messkomponente erzwingen (sonst Erkennung) */
  component?: string;
  log: FastifyBaseLogger;
  onReading: (reading: MeterReading) => void;
  onDevice?: (device: MeterDevice) => void;
  now?: () => number;
}

/**
 * Ein einziger Abfrage-Takt am Shelly. Die nächste Abfrage beginnt frühestens ein
 * Intervall nach dem Beginn der vorigen und erst, wenn diese beendet ist – es gibt
 * nie zwei Anfragen gleichzeitig und keine zusätzlichen Wiederholungen.
 *
 * Der aktuellste gültige Messwert liegt im Speicher und wird ohne Datenbankzugriff
 * ausgeliefert. Protokolliert werden nur Zustandswechsel, nicht jede Abfrage.
 */
export class Poller {
  private readonly client: ShellyClient;
  private readonly log: FastifyBaseLogger;
  private readonly onReading: (reading: MeterReading) => void;
  private readonly onDevice: ((device: MeterDevice) => void) | undefined;
  private readonly forcedComponent: string | undefined;
  private readonly now: () => number;
  readonly intervalMs: number;
  readonly staleAfterMs: number;

  private device: MeterDevice | null = null;
  private latest: MeterReading | null = null;
  private lastError: MeterError | null = null;
  private lastOkAt: number | null = null;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | null = null;
  private running = false;
  /** Abfragen der letzten 60 s: Zeitpunkt, Dauer, Erfolg */
  private window: { at: number; ms: number; ok: boolean }[] = [];
  /** für Tests: höchste Zahl gleichzeitig laufender Abfragen */
  maxConcurrent = 0;
  private concurrent = 0;

  constructor(options: PollerOptions) {
    this.client = options.client;
    this.intervalMs = options.intervalMs;
    this.staleAfterMs = options.staleAfterMs;
    this.forcedComponent = options.component;
    this.log = options.log;
    this.onReading = options.onReading;
    this.onDevice = options.onDevice;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  /** Beendet den Takt und wartet die laufende Abfrage ab. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }

  private schedule(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      const started = this.now();
      this.inFlight = this.tick().finally(() => {
        this.inFlight = null;
        this.schedule(Math.max(0, started + this.intervalMs - this.now()));
      });
    }, delay);
  }

  /** Eine Abfrage (öffentlich für Tests). */
  async tick(): Promise<void> {
    this.concurrent += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    const started = this.now();
    let ok = false;
    try {
      if (!this.device) {
        this.device = await this.client.identify(this.forcedComponent);
        this.log.info({ device: this.device }, 'Shelly erkannt');
        this.onDevice?.(this.device);
      }
      const reading = await this.client.read(this.device.component);
      this.latest = reading;
      this.lastOkAt = reading.ts;
      ok = true;
      if (this.lastError) this.log.info({ previousError: this.lastError }, 'Shelly wieder erreichbar');
      this.lastError = null;
      this.onReading(reading);
    } catch (err) {
      const code: MeterError = err instanceof ShellyError ? err.code : 'unreachable';
      if (code !== this.lastError) {
        this.log.warn({ reason: code, detail: err instanceof Error ? err.message : undefined }, 'Abfrage am Shelly fehlgeschlagen');
      }
      this.lastError = code;
      // Gerät neu erkennen, falls es ausgetauscht oder anders konfiguriert wurde
      if (code === 'unsupported_device' || code === 'no_meter') this.device = null;
    } finally {
      this.concurrent -= 1;
      const at = this.now();
      this.window.push({ at, ms: at - started, ok });
      while (this.window.length && this.window[0].at < at - WINDOW_MS) this.window.shift();
    }
  }

  state(at = this.now()): MeterState {
    if (!this.latest) return this.lastError ? 'offline' : 'unknown';
    if (at - this.latest.ts <= this.staleAfterMs) return 'online';
    return this.lastError ? 'offline' : 'stale';
  }

  /** Live-Antwort aus dem Speicher – alte Werte sind immer als veraltet gekennzeichnet. */
  live(at = this.now()): LiveResponse {
    const r = this.latest;
    return {
      state: this.state(at),
      measuredAt: r ? new Date(r.ts).toISOString() : null,
      ageMs: r ? Math.max(0, at - r.ts) : null,
      powerW: r?.powerW ?? null,
      voltageV: r?.voltageV ?? null,
      currentA: r?.currentA ?? null,
      energyCounterWh: r?.energyTotalWh ?? null,
      lastError: this.lastError,
      device: this.device,
      pollIntervalMs: this.intervalMs,
      staleAfterMs: this.staleAfterMs,
    };
  }

  get lastErrorCode(): MeterError | null {
    return this.lastError;
  }

  get lastSuccessAt(): number | null {
    return this.lastOkAt;
  }

  stats(at = this.now()): PollerStats {
    const recent = this.window.filter((w) => w.at >= at - WINDOW_MS);
    const ok = recent.filter((w) => w.ok).map((w) => w.ms).sort((a, b) => a - b);
    const q = (p: number) => (ok.length ? ok[Math.min(ok.length - 1, Math.floor(p * ok.length))] : null);
    const span = recent.length > 1 ? (recent.at(-1)!.at - recent[0].at) / 1000 : 0;
    return {
      intervalMs: this.intervalMs,
      pollsLastMinute: recent.length,
      failuresLastMinute: recent.filter((w) => !w.ok).length,
      frequencyHz: span > 0 ? Number(((recent.length - 1) / span).toFixed(3)) : 0,
      responseMs: { p50: q(0.5), p95: q(0.95), max: ok.length ? ok.at(-1)! : null },
    };
  }
}
