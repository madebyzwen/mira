import { z } from 'zod';
import { HISTORY_RANGES } from './systems.ts';

/**
 * Verträge der internen Lese-API des Shelly-Loggers (Logger → MIRA, ab Stufe 4b).
 * Zeitpunkte als ISO-8601 in UTC; Energie in Wh, Leistung in W.
 * Fehlende Messwerte sind immer `null` – nie 0.
 */

export const LOGGER_API_VERSION = '1';

/** Zustand der Messung: `online` = aktueller Wert, `stale` = letzter Wert zu alt, `offline` = keine Antwort, `unknown` = noch keine Messung. */
export const METER_STATES = ['online', 'stale', 'offline', 'unknown'] as const;
export type MeterState = (typeof METER_STATES)[number];

/** Warum die letzte Abfrage am Shelly fehlgeschlagen ist. */
export const METER_ERRORS = ['timeout', 'unreachable', 'unauthorized', 'invalid_response', 'unsupported_device', 'no_meter'] as const;
export type MeterError = (typeof METER_ERRORS)[number];

/** Datenqualität eines 30-Sekunden-Intervalls. */
export const SAMPLE_QUALITIES = ['ok', 'partial', 'counter_reset', 'implausible'] as const;
export type SampleQuality = (typeof SAMPLE_QUALITIES)[number];

export const meterDeviceSchema = z.object({
  /** Geräte-ID des Shelly (z. B. `shellyplugpmg3-…`) */
  id: z.string(),
  model: z.string(),
  generation: z.number().int(),
  firmware: z.string().nullable(),
  /** Abgefragte Messkomponente, z. B. `pm1:0` oder `switch:0` */
  component: z.string(),
});
export type MeterDevice = z.infer<typeof meterDeviceSchema>;

export const pollerStatsSchema = z.object({
  intervalMs: z.number(),
  /** Abfragen der letzten 60 s (erfolgreich + fehlgeschlagen) */
  pollsLastMinute: z.number().int(),
  failuresLastMinute: z.number().int(),
  /** Tatsächliche Abfragefrequenz der letzten 60 s in Hz */
  frequencyHz: z.number(),
  /** Antwortzeiten des Shelly der letzten 60 s in ms */
  responseMs: z.object({ p50: z.number().nullable(), p95: z.number().nullable(), max: z.number().nullable() }),
});
export type PollerStats = z.infer<typeof pollerStatsSchema>;

/** Antwort von `GET /health` (ohne Anmeldung, auch für den Docker-Healthcheck). */
export const loggerHealthSchema = z.object({
  status: z.literal('ok'),
  apiVersion: z.string(),
  version: z.string(),
  uptimeSeconds: z.number(),
  meter: z.object({ state: z.enum(METER_STATES), lastError: z.enum(METER_ERRORS).nullable() }),
  poller: pollerStatsSchema,
  process: z.object({ rssBytes: z.number(), heapUsedBytes: z.number(), cpuPercent: z.number().nullable() }),
});
export type LoggerHealth = z.infer<typeof loggerHealthSchema>;

/** Antwort von `GET /api/v1/live` – kommt aus dem Arbeitsspeicher, nie aus der Datenbank. */
export const liveResponseSchema = z.object({
  state: z.enum(METER_STATES),
  /** Zeitpunkt der Messung (Antwort des Shelly); `null` = noch nie gemessen */
  measuredAt: z.string().nullable(),
  /** Alter der Messung beim Abruf */
  ageMs: z.number().nullable(),
  powerW: z.number().nullable(),
  voltageV: z.number().nullable(),
  currentA: z.number().nullable(),
  /** Zählerstand des Shelly (kumuliert) – nicht der Verbrauch eines Zeitraums */
  energyCounterWh: z.number().nullable(),
  lastError: z.enum(METER_ERRORS).nullable(),
  device: meterDeviceSchema.nullable(),
  pollIntervalMs: z.number(),
  staleAfterMs: z.number(),
});
export type LiveResponse = z.infer<typeof liveResponseSchema>;

export const CONSUMPTION_PERIODS = ['day', 'week', 'month', 'year'] as const;
export type ConsumptionPeriod = (typeof CONSUMPTION_PERIODS)[number];

export const consumptionQuerySchema = z.object({
  period: z.enum(CONSUMPTION_PERIODS),
  /** Ein Tag im gewünschten Zeitraum (`JJJJ-MM-TT`, Ortszeit); ohne Angabe = aktueller Zeitraum */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const energySumSchema = z.object({
  /** Gesamt = gemessen + rekonstruiert */
  energyWh: z.number(),
  /** Aus lückenlos erfassten 30-s-Intervallen */
  measuredWh: z.number(),
  /** Aus der Zählerdifferenz über einen Messausfall – Summe sicher, zeitliche Verteilung unbekannt */
  reconstructedWh: z.number(),
  /** Anteil der Zeit mit Messwerten (0–1), bezogen auf den bereits vergangenen Teil */
  coverage: z.number(),
});

/** Antwort von `GET /api/v1/consumption?period=…[&date=…]` */
export const consumptionResponseSchema = energySumSchema.extend({
  period: z.enum(CONSUMPTION_PERIODS),
  timezone: z.string(),
  from: z.string(),
  to: z.string(),
  /** `false` = laufender Zeitraum (nur bisher erfasster Verbrauch) */
  complete: z.boolean(),
  /** Aufteilung: Woche/Monat → Tage, Jahr → Monate, Tag → leer */
  breakdown: z.array(energySumSchema.extend({ label: z.string(), from: z.string(), to: z.string() })),
});
export type ConsumptionResponse = z.infer<typeof consumptionResponseSchema>;

export const powerHistoryQuerySchema = z.object({ range: z.enum(HISTORY_RANGES).default('1h') });

export const powerHistoryPointSchema = z.object({
  /** Beginn des Zeitabschnitts */
  ts: z.string(),
  /** Zeitgewichtete mittlere Leistung; `null` = keine Messwerte */
  avgW: z.number().nullable(),
  minW: z.number().nullable(),
  maxW: z.number().nullable(),
  /** Gemessener Verbrauch im Abschnitt */
  energyWh: z.number().nullable(),
  coverage: z.number(),
});

/** Antwort von `GET /api/v1/history?range=1h|24h|7d|30d` – Raster wie `HISTORY_GRID` in MIRA */
export const powerHistoryResponseSchema = z.object({
  range: z.enum(HISTORY_RANGES),
  from: z.string(),
  to: z.string(),
  stepSeconds: z.number(),
  points: z.array(powerHistoryPointSchema),
});
export type PowerHistoryResponse = z.infer<typeof powerHistoryResponseSchema>;

/** Antwort von `GET /api/v1/database/stats` (periodisch aktualisiert) */
export const databaseStatsResponseSchema = z.object({
  bytes: z.object({ database: z.number(), wal: z.number(), shm: z.number(), total: z.number() }),
  samples: z.number().int(),
  gaps: z.number().int(),
  days: z.number().int(),
  oldestSample: z.string().nullable(),
  newestSample: z.string().nullable(),
  refreshedAt: z.string(),
});
export type DatabaseStatsResponse = z.infer<typeof databaseStatsResponseSchema>;
