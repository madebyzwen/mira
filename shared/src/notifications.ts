import { z } from 'zod';

/** Verträge für Benachrichtigungen (Glocke) und die Update-Prüfung (Backend → Frontend). */

export const NOTIFICATION_LEVELS = ['info', 'warning', 'error'] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

export const notificationLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});
export type NotificationLink = z.infer<typeof notificationLinkSchema>;

export const notificationSchema = z.object({
  id: z.number().int(),
  /** Herkunft, eindeutig je Thema – z. B. `update:mira`, `update:odin-api` */
  key: z.string(),
  level: z.enum(NOTIFICATION_LEVELS),
  title: z.string(),
  message: z.string(),
  links: z.array(notificationLinkSchema),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Antwort von `GET /api/v1/notifications`. */
export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unread: z.number().int(),
  /** Eine Update-Prüfung läuft gerade – das Ergebnis kann gleich neue Meldungen bringen */
  checking: z.boolean(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

/** Abfrage von `GET /api/v1/notifications`: `refresh=true` nur beim Laden der Oberfläche. */
export const notificationsQuerySchema = z.object({
  refresh: z.enum(['true', 'false']).optional(),
});

/** Body von `POST /api/v1/notifications/read` – ohne `ids` werden alle als gelesen markiert. */
export const markNotificationsReadSchema = z.object({
  ids: z.array(z.number().int().positive()).max(500).optional(),
});
export type MarkNotificationsRead = z.infer<typeof markNotificationsReadSchema>;

// ---------------------------------------------------------------- Update-Prüfung

export const UPDATE_COMPONENTS = ['mira', 'odin-api'] as const;
export type UpdateComponent = (typeof UPDATE_COMPONENTS)[number];

/**
 * Auslöser einer Prüfung. `scheduled` und `visit` sind die automatischen Prüfungen
 * (höchstens je eine am Tag), `manual` die Prüfung von Hand (höchstens eine je Stunde).
 */
export const UPDATE_CHECK_TRIGGERS = ['scheduled', 'visit', 'manual'] as const;
export type UpdateCheckTrigger = (typeof UPDATE_CHECK_TRIGGERS)[number];

export const UPDATE_CHECK_ERRORS = ['unreachable', 'timeout', 'rate_limited', 'invalid_response'] as const;
export type UpdateCheckError = (typeof UPDATE_CHECK_ERRORS)[number];

export const updateCheckResultSchema = z.object({
  at: z.string(),
  trigger: z.enum(UPDATE_CHECK_TRIGGERS),
  ok: z.boolean(),
  error: z.enum(UPDATE_CHECK_ERRORS).nullable(),
});
export type UpdateCheckResult = z.infer<typeof updateCheckResultSchema>;

export const componentUpdateSchema = z.object({
  component: z.enum(UPDATE_COMPONENTS),
  /** `null` = unbekannt (z. B. Odin noch nie erreicht oder Entwicklungsversion) */
  installed: z.string().nullable(),
  /** `true`, wenn die Komponente keine Version meldet und daher höchstens `installed` ist (Odin-API ≤ 0.1.3) */
  installedAtMost: z.boolean(),
  latest: z.string().nullable(),
  updateAvailable: z.boolean(),
});
export type ComponentUpdate = z.infer<typeof componentUpdateSchema>;

/** Antwort von `GET /api/v1/system/update`. */
export const updateStatusResponseSchema = z.object({
  enabled: z.boolean(),
  /** Uhrzeit der täglichen Prüfung (Ortszeit), z. B. `04:00` */
  scheduleTime: z.string(),
  components: z.array(componentUpdateSchema),
  release: z
    .object({
      tag: z.string(),
      publishedAt: z.string(),
      url: z.string(),
    })
    .nullable(),
  /** Letzte Prüfung gleich welchen Auslösers */
  lastCheck: updateCheckResultSchema.nullable(),
  /** Eine Prüfung läuft gerade */
  checking: z.boolean(),
  /** Ab wann die nächste Prüfung von Hand möglich ist (`null` = sofort) */
  nextManualCheckAt: z.string().nullable(),
});
export type UpdateStatusResponse = z.infer<typeof updateStatusResponseSchema>;

/** Antwort von `POST /api/v1/system/update/check` (Prüfung von Hand). */
export const manualUpdateCheckResponseSchema = z.object({
  /** `false`, wenn innerhalb der Sperrfrist erneut geprüft werden sollte – dann wird nicht geprüft */
  performed: z.boolean(),
  status: updateStatusResponseSchema,
});
export type ManualUpdateCheckResponse = z.infer<typeof manualUpdateCheckResponseSchema>;
