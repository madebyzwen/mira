import type { FastifyBaseLogger } from 'fastify';
import type { ConnectionError, SystemInfo, SystemMetrics, SystemState } from '@mira/shared';
import type { Db } from '../../core/db/database.ts';
import { nowIso } from '../../core/db/database.ts';
import { OdinClientError, type OdinClient } from './odinClient.ts';

/** Info (Hardware, OS) ändert sich selten – nur nach Wiederverbindung bzw. alle 10 Minuten neu laden. */
const INFO_REFRESH_MS = 10 * 60 * 1000;
/** „Zuletzt gesehen“ höchstens einmal pro Minute in die Datenbank schreiben. */
const LAST_SEEN_WRITE_MS = 60 * 1000;
/** Aus „online“ erst nach so vielen Fehlversuchen in Folge auf „offline“ wechseln. */
const FAILURES_BEFORE_OFFLINE = 2;

interface StateRow {
  state: SystemState['state'];
  since: string | null;
  last_seen_at: string | null;
  last_error: string | null;
}

/**
 * Fragt Odin in festem Intervall ab und hält den aktuellen Zustand vor.
 * Nur Zustandswechsel werden protokolliert – keine Log-Flut, wenn Odin schläft.
 */
export class OdinMonitor {
  private readonly db: Db;
  private readonly systemId: number;
  private readonly client: OdinClient | null;
  private readonly log: FastifyBaseLogger;
  private readonly intervalMs: number;

  private status: SystemState;
  private info: SystemInfo | null = null;
  private infoLoadedAt = 0;
  private metrics: SystemMetrics | null = null;
  private failures = 0;
  private lastSeenWrittenAt = 0;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | null = null;

  constructor(options: { db: Db; systemId: number; client: OdinClient | null; log: FastifyBaseLogger; intervalMs: number }) {
    this.db = options.db;
    this.systemId = options.systemId;
    this.client = options.client;
    this.log = options.log;
    this.intervalMs = options.intervalMs;

    const row = this.db
      .prepare<[number], StateRow>('SELECT state, since, last_seen_at, last_error FROM system_state WHERE system_id = ?')
      .get(this.systemId);
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
      this.log.warn('Odin-API nicht konfiguriert (MIRA_ODIN_API_URL, MIRA_ODIN_CERT_FINGERPRINT, MIRA_ODIN_TOKEN_FILE)');
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
      const needsInfo = !this.info || this.status.state !== 'online' || Date.now() - this.infoLoadedAt > INFO_REFRESH_MS;
      if (needsInfo) {
        this.info = await client.info();
        this.infoLoadedAt = Date.now();
      }
      this.metrics = await client.metrics();
      this.onSuccess();
    } catch (err) {
      this.onFailure(err instanceof OdinClientError ? err.code : 'unreachable', err);
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    const now = nowIso();
    const changed = this.status.state !== 'online';
    this.status = { state: 'online', since: changed ? now : this.status.since, lastSeenAt: now, lastError: null };
    if (changed) this.log.info({ system: 'odin' }, 'Odin ist erreichbar');
    this.persist(changed);
  }

  private onFailure(code: ConnectionError, err: unknown): void {
    this.failures += 1;
    const previous = this.status;
    const goOffline = previous.state !== 'online' || this.failures >= FAILURES_BEFORE_OFFLINE;
    if (!goOffline) return;

    const changed = previous.state !== 'offline' || previous.lastError !== code;
    this.status = {
      state: 'offline',
      since: previous.state === 'offline' ? previous.since : nowIso(),
      lastSeenAt: previous.lastSeenAt,
      lastError: code,
    };
    if (changed) {
      this.log.warn({ system: 'odin', reason: code, detail: err instanceof Error ? err.message : undefined }, 'Odin ist nicht erreichbar');
      this.persist(true);
    }
  }

  private persist(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastSeenWrittenAt < LAST_SEEN_WRITE_MS) return;
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
