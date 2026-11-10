import { z } from 'zod';
import { CONSUMPTION_PERIODS, consumptionResponseSchema, liveResponseSchema } from './shellyLogger.ts';
import { systemSummarySchema } from './systems.ts';

/**
 * Verträge des Shelly Plug in MIRA (Backend → Frontend, ab Stufe 4b).
 * MIRA liest die Messwerte ausschließlich beim Shelly-Logger; Strompreis und Kosten
 * liegen nur in MIRA.
 */

/** Fester Schlüssel des Shelly Plug in Datenbank, API und Navigation */
export const SHELLY_SLUG = 'shelly-plug';

/** Warum der Shelly-Logger zuletzt nicht erreichbar war */
export const LOGGER_CONNECTION_ERRORS = ['not_configured', 'timeout', 'unreachable', 'unauthorized', 'invalid_response'] as const;
export type LoggerConnectionError = (typeof LOGGER_CONNECTION_ERRORS)[number];

/** Antwort von `GET /api/v1/systems/shelly-plug` – Live-Wert durchgereicht vom Logger */
export const shellyStatusResponseSchema = z.object({
  system: systemSummarySchema,
  logger: z.object({
    configured: z.boolean(),
    reachable: z.boolean(),
    /** Adresse des Loggers (host:port), z. B. für die Konfigurationsansicht */
    endpoint: z.string().nullable(),
    version: z.string().nullable(),
    lastError: z.enum(LOGGER_CONNECTION_ERRORS).nullable(),
  }),
  /** `null`, wenn der Logger nicht erreichbar ist – es werden keine alten Werte gezeigt */
  live: liveResponseSchema.nullable(),
});
export type ShellyStatusResponse = z.infer<typeof shellyStatusResponseSchema>;

const costFields = {
  /** Kosten in Euro; `null`, wenn für keinen Tag des Zeitraums ein Strompreis hinterlegt ist */
  costEur: z.number().nullable(),
  /** `false`, wenn für einzelne Tage mit Verbrauch kein Strompreis hinterlegt ist */
  costComplete: z.boolean(),
};

/** Antwort von `GET /api/v1/systems/shelly-plug/consumption?period=…[&date=…]` – Verbrauch des Loggers mit Kosten */
export const shellyConsumptionResponseSchema = consumptionResponseSchema.extend({
  ...costFields,
  breakdown: z.array(consumptionResponseSchema.shape.breakdown.element.extend(costFields)),
});
export type ShellyConsumptionResponse = z.infer<typeof shellyConsumptionResponseSchema>;

const periodSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  energyWh: z.number(),
  reconstructedWh: z.number(),
  coverage: z.number(),
  ...costFields,
});

/** Antwort von `GET /api/v1/systems/shelly-plug/summary` – heute, Woche, Monat, Jahr in einem Aufruf */
export const shellySummaryResponseSchema = z.object({
  timezone: z.string(),
  periods: z.record(z.enum(CONSUMPTION_PERIODS), periodSummarySchema),
  /** gültiger Strompreis heute (ct/kWh) */
  currentPriceCents: z.number().nullable(),
});
export type ShellySummaryResponse = z.infer<typeof shellySummaryResponseSchema>;

/* ---------- Strompreis (mit Gültigkeitsdatum) ---------- */

/** Kalendertag `JJJJ-MM-TT`, der tatsächlich existiert (kein 31.02., kein Monat 13) */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Ungültiges Datum');

export const energyPriceSchema = z.object({
  id: z.number().int(),
  /** gilt ab diesem Tag (Ortszeit) bis zum nächsten Eintrag */
  validFrom: dayString,
  /** Arbeitspreis brutto in Cent je kWh */
  centsPerKwh: z.number(),
  createdAt: z.string(),
});
export type EnergyPrice = z.infer<typeof energyPriceSchema>;

/** Antwort von `GET /api/v1/systems/shelly-plug/prices` */
export const energyPricesResponseSchema = z.object({
  prices: z.array(energyPriceSchema),
  currentPriceCents: z.number().nullable(),
});
export type EnergyPricesResponse = z.infer<typeof energyPricesResponseSchema>;

/** Body von `POST /api/v1/systems/shelly-plug/prices` – ein Preis je Tag; gleicher Tag ersetzt */
export const createEnergyPriceSchema = z.object({
  validFrom: dayString,
  centsPerKwh: z.number().positive().max(500),
});
export type CreateEnergyPrice = z.infer<typeof createEnergyPriceSchema>;
