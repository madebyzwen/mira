import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { assertTimeZone } from './time.ts';

/**
 * Konfiguration aus Umgebungsvariablen. Geheimnisse (Passwort des Shelly, Token der
 * API) nur als Datei (`…_FILE`, vgl. ADR 0006).
 */
const emptyAsUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(emptyAsUndefined, schema.optional());
const withDefault = <T extends z.ZodType>(schema: T) => z.preprocess(emptyAsUndefined, schema);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const envSchema = z.object({
  /** Lokale Adresse des Shelly, z. B. `http://<SHELLY_IP>` (nur HTTP – der Shelly bietet lokal kein HTTPS) */
  LOGGER_SHELLY_URL: z.url({ protocol: /^http$/ }),
  /** Datei mit dem Passwort der lokalen Shelly-Oberfläche (Benutzer `admin`); fehlt = ohne Passwort */
  LOGGER_SHELLY_PASSWORD_FILE: opt(z.string()),
  /** Messkomponente erzwingen, z. B. `pm1:0` oder `switch:0`; ohne Angabe wird sie erkannt */
  LOGGER_SHELLY_COMPONENT: opt(z.string().regex(/^(pm1|switch):\d+$/)),
  /** Abfrageintervall am Shelly (Standard 1000 ms, z. B. 2000 bei Bedarf) */
  LOGGER_POLL_INTERVAL_MS: withDefault(z.coerce.number().int().min(500).max(60_000).default(1000)),
  /** Zeitlimit einer einzelnen Abfrage */
  LOGGER_REQUEST_TIMEOUT_MS: withDefault(z.coerce.number().int().min(100).max(30_000).default(800)),
  /** Ab diesem Alter gilt der letzte Messwert als veraltet */
  LOGGER_STALE_AFTER_MS: withDefault(z.coerce.number().int().min(1000).max(600_000).default(5000)),
  /** Plausibilitätsgrenze der Leistung (16 A × 230 V); größere Energiesprünge gelten als unplausibel */
  LOGGER_MAX_POWER_W: withDefault(z.coerce.number().min(100).max(20_000).default(3680)),
  LOGGER_TIMEZONE: withDefault(z.string().default('Europe/Berlin')),
  LOGGER_DATA_DIR: withDefault(z.string().default('/data')),
  LOGGER_HOST: withDefault(z.string().default('0.0.0.0')),
  LOGGER_PORT: withDefault(z.coerce.number().int().min(1).max(65535).default(8090)),
  /** Datei mit einem Token; gesetzt = jede API-Anfrage (außer /health) braucht `Authorization: Bearer …` */
  LOGGER_API_TOKEN_FILE: opt(z.string()),
  /** Uhrzeit der täglichen Sicherung (Ortszeit `LOGGER_TIMEZONE`) */
  LOGGER_BACKUP_TIME: withDefault(time.default('03:45')),
  LOGGER_BACKUP_KEEP: withDefault(z.coerce.number().int().min(1).max(365).default(7)),
  LOGGER_LOG_LEVEL: withDefault(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')),
});

export interface LoggerConfig {
  shelly: { url: string; password?: string; component?: string };
  pollIntervalMs: number;
  requestTimeoutMs: number;
  staleAfterMs: number;
  maxPowerW: number;
  timeZone: string;
  dataDir: string;
  dbFile: string;
  host: string;
  port: number;
  apiToken?: string;
  backup: { time: string; keep: number };
  logLevel: string;
}

function readSecret(file: string | undefined, name: string): string | undefined {
  if (!file) return undefined;
  const value = fs.readFileSync(path.resolve(file), 'utf8').trim();
  if (!value) throw new Error(`${name}: Datei ${file} ist leer`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoggerConfig {
  const e = envSchema.parse(env);
  assertTimeZone(e.LOGGER_TIMEZONE);
  const dataDir = path.resolve(e.LOGGER_DATA_DIR);
  return {
    shelly: {
      url: e.LOGGER_SHELLY_URL.replace(/\/+$/, ''),
      password: readSecret(e.LOGGER_SHELLY_PASSWORD_FILE, 'LOGGER_SHELLY_PASSWORD_FILE'),
      component: e.LOGGER_SHELLY_COMPONENT,
    },
    pollIntervalMs: e.LOGGER_POLL_INTERVAL_MS,
    requestTimeoutMs: e.LOGGER_REQUEST_TIMEOUT_MS,
    staleAfterMs: e.LOGGER_STALE_AFTER_MS,
    maxPowerW: e.LOGGER_MAX_POWER_W,
    timeZone: e.LOGGER_TIMEZONE,
    dataDir,
    dbFile: path.join(dataDir, 'shelly-logger.db'),
    host: e.LOGGER_HOST,
    port: e.LOGGER_PORT,
    apiToken: readSecret(e.LOGGER_API_TOKEN_FILE, 'LOGGER_API_TOKEN_FILE'),
    backup: { time: e.LOGGER_BACKUP_TIME, keep: e.LOGGER_BACKUP_KEEP },
    logLevel: e.LOGGER_LOG_LEVEL,
  };
}
