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
