import type { FastifyBaseLogger } from 'fastify';
import { AI_SERVER_SLUG, type ConnectionError, type SystemInfo, type SystemMetrics, type SystemState } from '@mira/shared';
import type { Db } from '../../core/db/database.ts';
import { nowIso } from '../../core/db/database.ts';
import { AgentClientError, type AgentClient } from './agentClient.ts';
import type { SampleAggregator } from './sampleAggregator.ts';

/** Info (Hardware, OS) ändert sich selten – nur nach Wiederverbindung bzw. alle 10 Minuten neu laden. */
const INFO_REFRESH_MS = 10 * 60 * 1000;
/** „Zuletzt gesehen“ höchstens einmal pro Minute in die Datenbank schreiben. */
const LAST_SEEN_WRITE_MS = 60 * 1000;

interface StateRow {
  last_seen_at: string | null;
}

export interface AiServerMonitorOptions {
  db: Db;
  systemId: number;
  client: AgentClient | null;
  log: FastifyBaseLogger;
  intervalMs: number;
  /** Ohne Antwort seit so vielen ms gilt der KI-Server als nicht erreichbar */
  offlineAfterMs: number;
  aggregator?: SampleAggregator;
  /** Version des Agents (Paket); `null` = der Agent meldet keine Version (≤ 0.1.3). Aufruf bei jedem Neuladen der Info. */
  onApiVersion?: (version: string | null) => void;
  /** Für Tests: Uhr ersetzen */
  now?: () => number;
}

/**
 * Fragt den KI-Server im festen Intervall ab – im Backend, unabhängig davon, ob die
 * Weboberfläche offen ist – und hält den aktuellen Zustand für die Live-Anzeige
 * vor. Jede Messung fließt in die Minuten-Verdichtung für den Verlauf.
 * Nur Zustandswechsel werden protokolliert.
 */
export class AiServerMonitor {
  private readonly db: Db;
  private readonly systemId: number;
  private readonly client: AgentClient | null;
  private readonly log: FastifyBaseLogger;
  private readonly intervalMs: number;
  private readonly offlineAfterMs: number;
  private readonly aggregator: SampleAggregator | undefined;
  private readonly onApiVersion: ((version: string | null) => void) | undefined;
  private readonly now: () => number;

  private status: SystemState;
  private info: SystemInfo | null = null;
  private infoLoadedAt = 0;
  private metrics: SystemMetrics | null = null;
  private lastSuccessAt: number | null = null;
  private lastSeenWrittenAt = 0;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | null = null;

  constructor(options: AiServerMonitorOptions) {
    this.db = options.db;
    this.systemId = options.systemId;
    this.client = options.client;
    this.log = options.log;
    this.intervalMs = options.intervalMs;
    this.offlineAfterMs = options.offlineAfterMs;
    this.aggregator = options.aggregator;
    this.onApiVersion = options.onApiVersion;
    this.now = options.now ?? Date.now;

    const row = this.db.prepare<[number], StateRow>('SELECT last_seen_at FROM system_state WHERE system_id = ?').get(this.systemId);
    // Nach einem Neustart von MIRA ist der Zustand zunächst unbekannt; „zuletzt gesehen“ bleibt erhalten.
    this.status = {
      state: 'unknown',
      since: null,
      lastSeenAt: row?.last_seen_at ?? null,
      lastError: this.client ? null : 'not_configured',
    };
  }

  get snapshot(): { status: SystemState; info: SystemInfo | null; metrics: SystemMetrics | null } {
    return { status: { ...this.status }, info: this.info, metrics: this.metrics };
  }

  start(): void {
    if (!this.client) {
      this.log.warn('Verbindung zum KI-Server nicht konfiguriert (MIRA_AI_SERVER_URL, MIRA_AI_SERVER_CERT_FINGERPRINT, MIRA_AI_SERVER_TOKEN_FILE)');
      this.persist(true);
      return;
    }
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.aggregator?.flush();
    this.client?.close();
  }

  /** Eine Abfrage; parallele Aufrufe teilen sich dieselbe laufende Abfrage. */
  poll(): Promise<void> {
    if (!this.client) return Promise.resolve();
    this.inFlight ??= this.doPoll().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doPoll(): Promise<void> {
    const client = this.client!;
    try {
      const needsInfo = !this.info || this.status.state !== 'online' || this.now() - this.infoLoadedAt > INFO_REFRESH_MS;
      if (needsInfo) {
        const health = await client.health();
        try {
          this.onApiVersion?.(health.version ?? null);
        } catch (err) {
          // Fehler beim Abgleich der Update-Meldungen dürfen die Verbindung zum KI-Server nicht als gestört melden
          this.log.error({ err }, 'Version des Agents konnte nicht übernommen werden');
        }
        this.info = await client.info();
        this.infoLoadedAt = this.now();
      }
      this.metrics = await client.metrics();
      this.aggregator?.add(this.metrics, new Date(this.now()));
      this.onSuccess();
    } catch (err) {
      this.onFailure(err instanceof AgentClientError ? err.code : 'unreachable', err);
    }
  }

  private onSuccess(): void {
    this.lastSuccessAt = this.now();
    const now = new Date(this.lastSuccessAt).toISOString();
    const changed = this.status.state !== 'online';
    this.status = { state: 'online', since: changed ? now : this.status.since, lastSeenAt: now, lastError: null };
    if (changed) this.log.info({ system: AI_SERVER_SLUG }, 'KI-Server ist erreichbar');
    this.persist(changed);
  }

  private onFailure(code: ConnectionError, err: unknown): void {
    const previous = this.status;
    // Aus „online“ erst nach der Frist ohne Antwort wechseln – kurze Aussetzer überbrücken.
    const silentFor = this.lastSuccessAt === null ? Infinity : this.now() - this.lastSuccessAt;
    if (previous.state === 'online' && silentFor < this.offlineAfterMs) return;

    const changed = previous.state !== 'offline' || previous.lastError !== code;
    this.status = {
      state: 'offline',
      since: previous.state === 'offline' ? previous.since : nowIso(),
      lastSeenAt: previous.lastSeenAt,
      lastError: code,
    };
    if (changed) {
      this.log.warn({ system: AI_SERVER_SLUG, reason: code, detail: err instanceof Error ? err.message : undefined }, 'KI-Server ist nicht erreichbar');
      this.persist(true);
    }
  }

  private persist(force: boolean): void {
    const now = this.now();
    if (!force && now - this.lastSeenWrittenAt < LAST_SEEN_WRITE_MS) return;
    if (!this.db.open) return;
    this.lastSeenWrittenAt = now;
    this.db
      .prepare(
        `INSERT INTO system_state (system_id, state, since, last_seen_at, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(system_id) DO UPDATE SET
           state = excluded.state, since = excluded.since, last_seen_at = excluded.last_seen_at,
           last_error = excluded.last_error, updated_at = excluded.updated_at`,
      )
      .run(this.systemId, this.status.state, this.status.since, this.status.lastSeenAt, this.status.lastError, nowIso());
  }
}
