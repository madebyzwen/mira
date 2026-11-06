import { z } from 'zod';
import { systemInfoSchema, systemMetricsSchema } from './odin.ts';

/** Verträge des MIRA-Moduls „systems“ (Backend → Frontend). */

export const SYSTEM_STATES = ['online', 'offline', 'unknown'] as const;
export type SystemStateValue = (typeof SYSTEM_STATES)[number];

/** Warum eine Verbindung zuletzt fehlgeschlagen ist (für verständliche Hinweise). */
export const CONNECTION_ERRORS = [
  'not_configured',
  'timeout',
  'unreachable',
  'certificate_mismatch',
  'unauthorized',
  'invalid_response',
] as const;
export type ConnectionError = (typeof CONNECTION_ERRORS)[number];

export const systemStateSchema = z.object({
  state: z.enum(SYSTEM_STATES),
  since: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  lastError: z.enum(CONNECTION_ERRORS).nullable(),
});
export type SystemState = z.infer<typeof systemStateSchema>;

export const systemSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.enum(['server', 'power_meter']),
  description: z.string(),
  status: systemStateSchema,
});
export type SystemSummary = z.infer<typeof systemSummarySchema>;

/** Antwort von `GET /api/v1/systems`. */
export const systemsListResponseSchema = z.object({ systems: z.array(systemSummarySchema) });
export type SystemsListResponse = z.infer<typeof systemsListResponseSchema>;

/** Antwort von `GET /api/v1/systems/odin`. */
export const odinStatusResponseSchema = z.object({
  system: systemSummarySchema,
  connection: z.object({
    configured: z.boolean(),
    /** host:port der Odin-API, z. B. für die Konfigurationsansicht */
    endpoint: z.string().nullable(),
    pollIntervalSeconds: z.number(),
  }),
  info: systemInfoSchema.nullable(),
  metrics: systemMetricsSchema.nullable(),
});
export type OdinStatusResponse = z.infer<typeof odinStatusResponseSchema>;

/* ---------- Verlauf (ab Stufe 3) ---------- */

export const HISTORY_RANGES = ['1h', '24h', '7d', '30d'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/**
 * Einheitliches Zeitraster aller Verlaufsdiagramme (Odin, später Shelly):
 * Anzahl Punkte und Abstand je Zeitraum.
 */
export const HISTORY_GRID: Record<HistoryRange, { points: number; stepSeconds: number }> = {
  '1h': { points: 60, stepSeconds: 60 },
  '24h': { points: 288, stepSeconds: 5 * 60 },
  '7d': { points: 168, stepSeconds: 3600 },
  '30d': { points: 180, stepSeconds: 4 * 3600 },
};

/** Zeitraum, mit dem alle Verlaufsdiagramme beim Öffnen starten */
export const DEFAULT_HISTORY_RANGE: HistoryRange = '1h';

export const historyQuerySchema = z.object({ range: z.enum(HISTORY_RANGES).default(DEFAULT_HISTORY_RANGE) });

export const historyPointSchema = z.object({
  /** Beginn des Zeitabschnitts (ISO, UTC) */
  ts: z.string(),
  /** Mittlere Auslastung in Prozent; `null` = keine Messwerte (Odin aus/schlafend) */
  cpu: z.number().nullable(),
  gpu: z.number().nullable(),
  /** Mittlere Temperatur in °C; `null` = keine Messwerte */
  tempCpu: z.number().nullable(),
  tempGpu: z.number().nullable(),
});
export type HistoryPoint = z.infer<typeof historyPointSchema>;

/** Antwort von `GET /api/v1/systems/odin/history?range=…` */
export const historyResponseSchema = z.object({
  range: z.enum(HISTORY_RANGES),
  from: z.string(),
  to: z.string(),
  stepSeconds: z.number(),
  points: z.array(historyPointSchema),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
