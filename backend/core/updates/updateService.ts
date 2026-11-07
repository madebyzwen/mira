import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  UPDATE_CHECK_ERRORS,
  UPDATE_CHECK_TRIGGERS,
  type ComponentUpdate,
  type UpdateCheckError,
  type UpdateCheckResult,
  type UpdateCheckTrigger,
  type UpdateStatusResponse,
} from '@mira/shared';
import { nowIso } from '../db/database.ts';
import type { NotificationStore } from '../notifications.ts';
import type { SettingsStore } from '../settings.ts';
import { ODIN_API_GUIDE_URL, UpdateCheckFailure, type LatestRelease, type ReleaseFetcher } from './github.ts';
import { isNewer, parseVersion } from './semver.ts';

/** Sperrfrist für die Prüfung von Hand. */
export const MANUAL_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Letzte Odin-API, die ihre Version noch nicht meldet – meldet Odin keine Version, ist sie höchstens so alt. */
export const LAST_UNVERSIONED_ODIN_API = '0.1.3';

const NOTIFICATION_KEY = { mira: 'update:mira', odinApi: 'update:odin-api' } as const;

const checkSchema = z.object({
  at: z.string(),
  ok: z.boolean(),
  error: z.enum(UPDATE_CHECK_ERRORS).nullable(),
});

const stateSchema = z.object({
  release: z
    .object({
      tag: z.string(),
      version: z.string(),
      odinApiVersion: z.string().nullable(),
      publishedAt: z.string(),
      url: z.string(),
    })
    .nullable()
    .default(null),
  lastCheck: checkSchema.extend({ trigger: z.enum(UPDATE_CHECK_TRIGGERS) }).nullable().default(null),
  /**
   * Letzte Prüfung je Auslöser – getrennt gezählt:
   * `scheduled` (täglich), `visit` (erster Aufruf am Tag, mit Kalendertag), `manual` (höchstens 1× je Stunde).
   */
  byTrigger: z
    .object({
      scheduled: checkSchema.optional(),
      visit: checkSchema.extend({ day: z.string() }).optional(),
      manual: checkSchema.optional(),
    })
    .default({}),
  odinApi: z.object({ version: z.string(), atMost: z.boolean() }).nullable().default(null),
});
type State = z.infer<typeof stateSchema>;

export interface UpdateServiceOptions {
  settings: SettingsStore;
  notifications: NotificationStore;
  log: FastifyBaseLogger;
  enabled: boolean;
  scheduleTime: string;
  /** Laufende Version von MIRA */
  miraVersion: string;
  fetchRelease: ReleaseFetcher;
  now?: () => Date;
}

/** Kalendertag in Ortszeit (TZ des Containers), z. B. `2026-11-07`. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Prüft, ob auf GitHub neuere Versionen von MIRA und der Odin-API vorliegen, und
 * hält die passenden Benachrichtigungen aktuell. Eine Abfrage liefert beide Versionen.
 *
 * Auslöser (je eigene Zählung, siehe `byTrigger`):
 * - `scheduled`: täglich zur eingestellten Uhrzeit (Scheduler)
 * - `visit`: beim ersten Aufruf der Oberfläche an einem Kalendertag
 * - `manual`: von Hand, höchstens einmal je Stunde – zählt nicht gegen die automatischen
 *
 * Die Zählung wird **vor** der Abfrage gespeichert: Auch ein fehlgeschlagener Versuch
 * zählt, und gleichzeitige Aufrufe lösen keine zweite Prüfung aus.
 */
export class UpdateService {
  private readonly settings: SettingsStore;
  private readonly notifications: NotificationStore;
  private readonly log: FastifyBaseLogger;
  private readonly fetchRelease: ReleaseFetcher;
  private readonly now: () => Date;
  readonly enabled: boolean;
  readonly scheduleTime: string;
  readonly miraVersion: string | null;
  private inFlight: Promise<{ ok: boolean; error: UpdateCheckError | null }> | null = null;

  constructor(options: UpdateServiceOptions) {
    this.settings = options.settings;
    this.notifications = options.notifications;
    this.log = options.log;
    this.fetchRelease = options.fetchRelease;
    this.now = options.now ?? (() => new Date());
    this.enabled = options.enabled;
    this.scheduleTime = options.scheduleTime;
    this.miraVersion = parseVersion(options.miraVersion) ? options.miraVersion : null;
  }

  private load(): State {
    return this.settings.get('core', 'update_check', stateSchema) ?? stateSchema.parse({});
  }

  private save(state: State): void {
    this.settings.set('core', 'update_check', state);
  }

  /** Tägliche Prüfung (Scheduler). */
  async checkScheduled(): Promise<UpdateCheckResult | null> {
    if (!this.enabled) return null;
    return this.run('scheduled');
  }

  /**
   * Beim Aufruf der Oberfläche: prüft nur, wenn an diesem Kalendertag noch keine
   * Aufruf-Prüfung stattfand – unabhängig von der täglichen Prüfung.
   * @returns die laufende Prüfung bzw. `null`, wenn heute schon geprüft wurde
   */
  checkOnVisit(): Promise<UpdateCheckResult> | null {
    if (!this.enabled) return null;
    const state = this.load();
    if (state.byTrigger.visit?.day === localDay(this.now())) return null;
    return this.run('visit');
  }

  /** Ab wann die nächste Prüfung von Hand möglich ist (`null` = sofort). */
  nextManualCheckAt(state = this.load()): Date | null {
    const last = state.byTrigger.manual?.at;
    if (!last) return null;
    const next = new Date(new Date(last).getTime() + MANUAL_CHECK_INTERVAL_MS);
    return next.getTime() > this.now().getTime() ? next : null;
  }

  /**
   * Prüfung von Hand: höchstens einmal je Stunde, zählt nicht gegen die automatischen.
   * @returns `null`, wenn die Sperrfrist noch läuft bzw. die Prüfung abgeschaltet ist
   */
  async checkManually(): Promise<UpdateCheckResult | null> {
    if (!this.enabled || this.nextManualCheckAt()) return null;
    return this.run('manual');
  }

  private run(trigger: UpdateCheckTrigger): Promise<UpdateCheckResult> {
    // Zählung sofort festhalten (vor der Abfrage, synchron)
    const at = nowIso(this.now());
    const day = localDay(this.now());
    const state = this.load();
    const pending = { at, ok: false, error: null };
    if (trigger === 'visit') state.byTrigger.visit = { ...pending, day };
    else state.byTrigger[trigger] = pending;
    this.save(state);

    // Läuft bereits eine Abfrage (anderer Auslöser), wird deren Ergebnis übernommen.
    this.inFlight ??= this.fetchAndApply().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight.then(({ ok, error }) => {
      const s = this.load();
      const entry = s.byTrigger[trigger];
      if (entry && entry.at === at) Object.assign(entry, { ok, error });
      s.lastCheck = { at, trigger, ok, error };
      this.save(s);
      this.log.info({ trigger, ok, error, latest: s.release?.tag ?? null }, 'Update-Prüfung durchgeführt');
      return { at, trigger, ok, error };
    });
  }

  private async fetchAndApply(): Promise<{ ok: boolean; error: UpdateCheckError | null }> {
    let release: LatestRelease;
    try {
      release = await this.fetchRelease();
    } catch (err) {
      const error = err instanceof UpdateCheckFailure ? err.code : 'unreachable';
      this.log.warn({ reason: error, detail: err instanceof Error ? err.message : undefined }, 'Update-Prüfung fehlgeschlagen');
      return { ok: false, error };
    }
    const state = this.load();
    state.release = release;
    this.save(state);
    this.reconcile();
    return { ok: true, error: null };
  }

  /**
   * Meldet die installierte Version der Odin-API (`null` = Odin erreichbar, meldet aber
   * keine Version, also höchstens 0.1.3). Ohne Internet: entfernt bzw. aktualisiert die Meldung sofort.
   */
  reportOdinApiVersion(version: string | null): void {
    const next = version === null ? { version: LAST_UNVERSIONED_ODIN_API, atMost: true } : parseVersion(version) ? { version, atMost: false } : null;
    const state = this.load();
    if (JSON.stringify(state.odinApi) === JSON.stringify(next)) return;
    state.odinApi = next;
    this.save(state);
    this.reconcile();
  }

  /** Gleicht die Meldungen mit installierten und zuletzt gefundenen Versionen ab – ohne Abfrage. */
  reconcile(): void {
    const state = this.load();
    const release = state.release;
    const [mira, odin] = this.components(state);
    const published = release ? formatDate(release.publishedAt) : '';

    if (release && mira.updateAvailable) {
      this.notifications.upsert({
        key: NOTIFICATION_KEY.mira,
        ref: release.version,
        level: 'info',
        title: `MIRA ${release.version} verfügbar`,
        message: `Installiert: ${mira.installed} · veröffentlicht am ${published}. Update in Portainer: Stack „mira“ → „Update the stack“ mit „Re-pull image“.`,
        links: [{ label: 'Release-Notes auf GitHub', url: release.url }],
      });
    } else {
      this.notifications.remove(NOTIFICATION_KEY.mira);
    }

    if (release && odin.updateAvailable) {
      const installed = odin.installedAtMost ? `${odin.installed} oder älter` : odin.installed;
      this.notifications.upsert({
        key: NOTIFICATION_KEY.odinApi,
        ref: odin.latest!,
        level: 'info',
        title: `Odin-API ${odin.latest} verfügbar`,
        message: `Installiert auf Odin: ${installed} · veröffentlicht am ${published}. Update auf Odin: Paket laden, Prüfsumme prüfen, sudo ./install.sh – Konfiguration, Zertifikat und Token bleiben erhalten.`,
        links: [
          { label: 'Release auf GitHub', url: release.url },
          { label: 'Anleitung', url: ODIN_API_GUIDE_URL },
        ],
      });
    } else {
      this.notifications.remove(NOTIFICATION_KEY.odinApi);
    }
  }

  private components(state: State): [ComponentUpdate, ComponentUpdate] {
    const latestMira = state.release?.version ?? null;
    const latestOdin = state.release?.odinApiVersion ?? null;
    return [
      {
        component: 'mira',
        installed: this.miraVersion,
        installedAtMost: false,
        latest: latestMira,
        updateAvailable: isNewer(latestMira, this.miraVersion),
      },
      {
        component: 'odin-api',
        installed: state.odinApi?.version ?? null,
        installedAtMost: state.odinApi?.atMost ?? false,
        latest: latestOdin,
        updateAvailable: isNewer(latestOdin, state.odinApi?.version),
      },
    ];
  }

  status(): UpdateStatusResponse {
    const state = this.load();
    return {
      enabled: this.enabled,
      scheduleTime: this.scheduleTime,
      components: this.components(state),
      release: state.release ? { tag: state.release.tag, publishedAt: state.release.publishedAt, url: state.release.url } : null,
      lastCheck: state.lastCheck,
      nextManualCheckAt: this.nextManualCheckAt(state) ? nowIso(this.nextManualCheckAt(state)!) : null,
    };
  }
}
