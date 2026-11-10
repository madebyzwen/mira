import type { FastifyBaseLogger } from 'fastify';
import {
  CONSUMPTION_PERIODS,
  SHELLY_SLUG,
  type ConnectionError,
  type ConsumptionPeriod,
  type ConsumptionResponse,
  type DatabaseStatsResponse,
  type HistoryRange,
  type LiveResponse,
  type LoggerConnectionError,
  type MeterError,
  type PowerHistoryResponse,
  type ShellyConsumptionResponse,
  type ShellyStatusResponse,
  type ShellySummaryResponse,
  type SystemState,
  type SystemSummary,
} from '@mira/shared';
import type { EnergyPrices } from './energyPrices.ts';
import { LoggerClientError, type LoggerClient } from './loggerClient.ts';

/** Kalendertag (`JJJJ-MM-TT`) eines Zeitpunkts in der Zeitzone des Loggers */
export function localDay(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const METER_TO_CONNECTION: Record<MeterError, ConnectionError> = {
  timeout: 'timeout',
  unreachable: 'unreachable',
  unauthorized: 'unauthorized',
  invalid_response: 'invalid_response',
  unsupported_device: 'invalid_response',
  no_meter: 'invalid_response',
};

interface Cached<T> {
  at: number;
  value: T;
}

export interface ShellyServiceOptions {
  client: LoggerClient | null;
  prices: EnergyPrices;
  system: { slug: string; name: string; description: string };
  log: FastifyBaseLogger;
  now?: () => number;
}

/**
 * Shelly Plug in MIRA: liest ausschließlich die Lese-API des Shelly-Loggers und
 * ergänzt die Kosten aus dem Strompreis in MIRA. Der Live-Wert wird nur durchgereicht;
 * Verbrauch und Verlauf werden kurz zwischengespeichert, abgeschlossene Zeiträume dauerhaft.
 */
export class ShellyService {
  private readonly client: LoggerClient | null;
  private readonly prices: EnergyPrices;
  private readonly system: ShellyServiceOptions['system'];
  private readonly log: FastifyBaseLogger;
  private readonly now: () => number;
  private state: SystemState = { state: 'unknown', since: null, lastSeenAt: null, lastError: null };
  private loggerError: LoggerConnectionError | null = null;
  private version: Cached<string | null> | null = null;
  private readonly consumptionCache = new Map<string, Cached<ShellyConsumptionResponse>>();
  private readonly monthCache = new Map<string, Cached<ConsumptionResponse>>();
  private history: Map<HistoryRange, Cached<PowerHistoryResponse>> = new Map();
  private dbStats: Cached<DatabaseStatsResponse> | null = null;

  constructor(options: ShellyServiceOptions) {
    this.client = options.client;
    this.prices = options.prices;
    this.system = options.system;
    this.log = options.log;
    this.now = options.now ?? Date.now;
    if (!this.client) this.state = { ...this.state, lastError: 'not_configured' };
  }

  get configured(): boolean {
    return this.client !== null;
  }

  summary(): SystemSummary {
    return { slug: SHELLY_SLUG, name: this.system.name, kind: 'power_meter', description: this.system.description, status: { ...this.state } };
  }

  private setState(next: Omit<SystemState, 'since'>): void {
    const changed = next.state !== this.state.state;
    if (changed && next.state === 'online') this.log.info({ system: SHELLY_SLUG }, 'Shelly-Messung erreichbar');
    if (changed && next.state === 'offline') this.log.warn({ system: SHELLY_SLUG, reason: next.lastError }, 'Shelly-Messung nicht verfügbar');
    this.state = { ...next, since: changed ? new Date(this.now()).toISOString() : this.state.since };
  }

  private fail(err: unknown): LoggerConnectionError {
    const code = err instanceof LoggerClientError ? err.code : 'unreachable';
    if (code !== this.loggerError) this.log.warn({ reason: code, detail: err instanceof Error ? err.message : undefined }, 'Shelly-Logger nicht erreichbar');
    this.loggerError = code;
    return code;
  }

  /** Live-Wert holen und den Zustand des Systems daraus ableiten */
  async status(): Promise<ShellyStatusResponse> {
    let live: LiveResponse | null = null;
    if (this.client) {
      try {
        live = await this.client.live();
        if (this.loggerError) this.log.info('Shelly-Logger wieder erreichbar');
        this.loggerError = null;
      } catch (err) {
        this.fail(err);
      }
    }
    if (!this.client) {
      this.setState({ state: 'unknown', lastSeenAt: null, lastError: 'not_configured' });
    } else if (!live) {
      this.setState({ state: 'offline', lastSeenAt: this.state.lastSeenAt, lastError: this.loggerError });
    } else {
      const state = live.state === 'online' ? 'online' : live.state === 'unknown' ? 'unknown' : 'offline';
      this.setState({ state, lastSeenAt: live.measuredAt, lastError: live.lastError ? METER_TO_CONNECTION[live.lastError] : null });
    }
    return {
      system: this.summary(),
      logger: {
        configured: this.client !== null,
        reachable: live !== null,
        endpoint: this.client?.endpoint ?? null,
        version: live ? await this.loggerVersion() : null,
        lastError: this.client ? this.loggerError : 'not_configured',
      },
      live,
    };
  }

  /** Version des Loggers (alle 10 Minuten neu) */
  private async loggerVersion(): Promise<string | null> {
    if (this.version && this.now() - this.version.at < 10 * 60_000) return this.version.value;
    try {
      const h = await this.client!.health();
      this.version = { at: this.now(), value: h.version };
    } catch {
      this.version = { at: this.now(), value: this.version?.value ?? null };
    }
    return this.version.value;
  }

  private requireClient(): LoggerClient {
    if (!this.client) throw new LoggerClientError('not_configured', 'Shelly-Logger ist nicht eingerichtet (MIRA_SHELLY_LOGGER_URL)');
    return this.client;
  }

  /** Verbrauch eines Monats (für die Kosten im Jahr); abgeschlossene Monate dauerhaft zwischengespeichert */
  private async month(firstDay: string): Promise<ConsumptionResponse> {
    const cached = this.monthCache.get(firstDay);
    if (cached && (cached.value.complete || this.now() - cached.at < 30_000)) return cached.value;
    const value = await this.requireClient().consumption('month', firstDay);
    this.monthCache.set(firstDay, { at: this.now(), value });
    return value;
  }

  /** Verbrauch mit Kosten; laufende Zeiträume 15 s, abgeschlossene dauerhaft zwischengespeichert */
  async consumption(period: ConsumptionPeriod, date?: string): Promise<ShellyConsumptionResponse> {
    const key = `${period}:${date ?? 'aktuell'}`;
    const cached = this.consumptionCache.get(key);
    if (cached && (cached.value.complete || this.now() - cached.at < 15_000)) return cached.value;
    const raw = await this.requireClient().consumption(period, date);
    const tz = raw.timezone;
    let breakdown: ShellyConsumptionResponse['breakdown'];
    let total;
    if (period === 'day') {
      breakdown = [];
      total = this.prices.cost([{ day: localDay(raw.from, tz), energyWh: raw.energyWh }]);
    } else if (period === 'week' || period === 'month') {
      breakdown = raw.breakdown.map((b) => ({ ...b, ...this.prices.cost([{ day: b.label, energyWh: b.energyWh }]) }));
      total = this.prices.cost(raw.breakdown.map((b) => ({ day: b.label, energyWh: b.energyWh })));
    } else {
      // Jahr: Kosten je Monat aus dessen Tageswerten (Preiswechsel mitten im Monat bleiben genau)
      breakdown = [];
      let eur = 0;
      let priced = false;
      let complete = true;
      for (const b of raw.breakdown) {
        if (b.energyWh <= 0) {
          breakdown.push({ ...b, costEur: null, costComplete: true });
          continue;
        }
        const month = await this.month(`${b.label}-01`);
        const c = this.prices.cost(month.breakdown.map((d) => ({ day: d.label, energyWh: d.energyWh })));
        breakdown.push({ ...b, ...c });
        if (c.costEur !== null) {
          eur += c.costEur;
          priced = true;
        }
        complete &&= c.costComplete;
      }
      total = { costEur: priced ? Math.round(eur * 10_000) / 10_000 : null, costComplete: complete };
    }
    const value: ShellyConsumptionResponse = { ...raw, ...total, breakdown };
    this.consumptionCache.set(key, { at: this.now(), value });
    if (this.consumptionCache.size > 300) this.consumptionCache.clear();
    return value;
  }

  /** Heute, Woche, Monat, Jahr in einem Aufruf */
  async summaryPeriods(): Promise<ShellySummaryResponse> {
    const results = await Promise.all(CONSUMPTION_PERIODS.map((p) => this.consumption(p)));
    const periods = Object.fromEntries(
      results.map((r) => [
        r.period,
        { from: r.from, to: r.to, energyWh: r.energyWh, reconstructedWh: r.reconstructedWh, coverage: r.coverage, costEur: r.costEur, costComplete: r.costComplete },
      ]),
    ) as ShellySummaryResponse['periods'];
    const timezone = results[0].timezone;
    return { timezone, periods, currentPriceCents: this.prices.priceOn(localDay(new Date(this.now()).toISOString(), timezone)) };
  }

  /** Leistungsverlauf (30 s zwischengespeichert – neue Intervalle entstehen alle 30 s) */
  async powerHistory(range: HistoryRange): Promise<PowerHistoryResponse> {
    const cached = this.history.get(range);
    if (cached && this.now() - cached.at < 30_000) return cached.value;
    const value = await this.requireClient().history(range);
    this.history.set(range, { at: this.now(), value });
    return value;
  }

  /** Datenbankstatistik des Loggers (60 s zwischengespeichert) */
  async databaseStats(): Promise<DatabaseStatsResponse> {
    if (this.dbStats && this.now() - this.dbStats.at < 60_000) return this.dbStats.value;
    const value = await this.requireClient().databaseStats();
    this.dbStats = { at: this.now(), value };
    return value;
  }

  /** Nach einer Preisänderung müssen alle Kosten neu berechnet werden */
  pricesChanged(): void {
    this.consumptionCache.clear();
  }

  close(): void {
    this.client?.close();
  }
}
