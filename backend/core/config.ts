import path from 'node:path';
import { z } from 'zod';

/**
 * Zentrale Konfiguration aus Umgebungsvariablen.
 * Geheimnisse (Passwörter, Schlüssel) werden nie direkt als Variable übergeben,
 * sondern immer als Pfad auf eine Datei (`…_FILE`).
 */
/** Leere Werte (z. B. nicht gesetzte Stack-Variablen in Portainer) gelten als „nicht gesetzt“. */
const emptyAsUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(emptyAsUndefined, schema.optional());

const envSchema = z.object({
  MIRA_HOST: z.string().default('0.0.0.0'),
  MIRA_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  MIRA_DATA_DIR: z.string().default('/data'),
  MIRA_DB_FILE: opt(z.string()),
  MIRA_STATIC_DIR: opt(z.string()),
  MIRA_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** `false`, `true` oder kommagetrennte Proxy-Adressen/Netze (z. B. `192.0.2.10`) */
  MIRA_TRUST_PROXY: z.string().default('false'),
  /** `auto` = Secure-Cookie, wenn die Anfrage per HTTPS kam (über Proxy-Header) */
  MIRA_COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  MIRA_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  MIRA_LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
  MIRA_LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  MIRA_ADMIN_USER: opt(z.string().trim().min(1).max(64)),
  MIRA_ADMIN_DISPLAY_NAME: opt(z.string().trim().min(1).max(64)),
  MIRA_ADMIN_PASSWORD_FILE: opt(z.string()),
  MIRA_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
  /** Anzeigename des KI-Servers (frei wählbar); ohne Angabe heißt er „KI-Server“ */
  MIRA_AI_SERVER_NAME: opt(
    z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[^\p{Cc}]+$/u, 'darf keine Steuerzeichen enthalten'),
  ),
  /** MIRA-Agent auf dem KI-Server, z. B. `https://<KI_SERVER_IP>:8443` */
  MIRA_AI_SERVER_URL: opt(z.url({ protocol: /^https$/ })),
  /** SHA-256-Fingerprint des Agent-Zertifikats (Ausgabe des Installationsskripts) */
  MIRA_AI_SERVER_CERT_FINGERPRINT: opt(z.string().trim().regex(/^[0-9A-Fa-f:]{64,95}$/)),
  MIRA_AI_SERVER_TOKEN_FILE: opt(z.string()),
  MIRA_AI_SERVER_POLL_SECONDS: z.coerce.number().min(1).max(3600).default(2),
  /** Der KI-Server gilt als nicht erreichbar, wenn so lange keine Antwort kam */
  MIRA_AI_SERVER_OFFLINE_SECONDS: z.coerce.number().int().min(2).max(3600).default(10),
  /** Shelly-Logger (Lese-API im internen Netz), z. B. `http://mira-shelly-logger:8090` */
  MIRA_SHELLY_LOGGER_URL: opt(z.url({ protocol: /^https?$/ })),
  /** Datei mit dem Token der Logger-API (nur nötig, wenn der Logger eines verlangt) */
  MIRA_SHELLY_LOGGER_TOKEN_FILE: opt(z.string()),
  MIRA_HISTORY_RAW_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  MIRA_HISTORY_HOURLY_DAYS: z.coerce.number().int().min(7).max(3650).default(365),
  MIRA_BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(7),
  /** Uhrzeit der täglichen Sicherung (Ortszeit des Containers, TZ) */
  MIRA_BACKUP_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('03:30'),
  /** Prüfung auf neue Versionen bei GitHub (MIRA und MIRA-Agent); `false` = keine Verbindung ins Internet */
  MIRA_UPDATE_CHECK: z.preprocess(emptyAsUndefined, z.enum(['true', 'false']).default('true')),
  /** Uhrzeit der täglichen Update-Prüfung (Ortszeit des Containers, TZ) */
  MIRA_UPDATE_CHECK_TIME: z.preprocess(emptyAsUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('04:00')),
});

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  dbFile: string;
  staticDir: string | undefined;
  logLevel: string;
  trustProxy: boolean | string;
  cookieSecure: 'auto' | boolean;
  sessionTtlMs: number;
  loginMaxFailures: number;
  loginWindowMs: number;
  admin: { username?: string; displayName?: string; passwordFile?: string };
  auditRetentionDays: number;
  aiServer: {
    /** Anzeigename; `undefined` = nicht konfiguriert (Anzeige „KI-Server“) */
    name?: string;
    url?: string;
    certFingerprint?: string;
    tokenFile?: string;
    pollSeconds: number;
    offlineSeconds: number;
  };
  shellyLogger: { url?: string; tokenFile?: string };
  history: { rawDays: number; hourlyDays: number };
  backup: { keep: number; time: string };
  updateCheck: { enabled: boolean; time: string };
  version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, version = '0.0.0'): AppConfig {
  const e = envSchema.parse(env);
  const dataDir = path.resolve(e.MIRA_DATA_DIR);
  const trust = e.MIRA_TRUST_PROXY.trim();
  return {
    host: e.MIRA_HOST,
    port: e.MIRA_PORT,
    dataDir,
    dbFile: e.MIRA_DB_FILE ? path.resolve(e.MIRA_DB_FILE) : path.join(dataDir, 'mira.db'),
    staticDir: e.MIRA_STATIC_DIR ? path.resolve(e.MIRA_STATIC_DIR) : undefined,
    logLevel: e.MIRA_LOG_LEVEL,
    trustProxy: trust === 'true' ? true : trust === 'false' || trust === '' ? false : trust,
    cookieSecure: e.MIRA_COOKIE_SECURE === 'auto' ? 'auto' : e.MIRA_COOKIE_SECURE === 'true',
    sessionTtlMs: e.MIRA_SESSION_TTL_HOURS * 60 * 60 * 1000,
    loginMaxFailures: e.MIRA_LOGIN_MAX_FAILURES,
    loginWindowMs: e.MIRA_LOGIN_WINDOW_MINUTES * 60 * 1000,
    admin: {
      username: e.MIRA_ADMIN_USER,
      displayName: e.MIRA_ADMIN_DISPLAY_NAME,
      passwordFile: e.MIRA_ADMIN_PASSWORD_FILE ? path.resolve(e.MIRA_ADMIN_PASSWORD_FILE) : undefined,
    },
    auditRetentionDays: e.MIRA_AUDIT_RETENTION_DAYS,
    aiServer: {
      name: e.MIRA_AI_SERVER_NAME,
      url: e.MIRA_AI_SERVER_URL,
      certFingerprint: e.MIRA_AI_SERVER_CERT_FINGERPRINT,
      tokenFile: e.MIRA_AI_SERVER_TOKEN_FILE ? path.resolve(e.MIRA_AI_SERVER_TOKEN_FILE) : undefined,
      pollSeconds: e.MIRA_AI_SERVER_POLL_SECONDS,
      offlineSeconds: e.MIRA_AI_SERVER_OFFLINE_SECONDS,
    },
    shellyLogger: {
      url: e.MIRA_SHELLY_LOGGER_URL?.replace(/\/+$/, ''),
      tokenFile: e.MIRA_SHELLY_LOGGER_TOKEN_FILE ? path.resolve(e.MIRA_SHELLY_LOGGER_TOKEN_FILE) : undefined,
    },
    history: { rawDays: e.MIRA_HISTORY_RAW_DAYS, hourlyDays: e.MIRA_HISTORY_HOURLY_DAYS },
    backup: { keep: e.MIRA_BACKUP_KEEP, time: e.MIRA_BACKUP_TIME },
    updateCheck: { enabled: e.MIRA_UPDATE_CHECK === 'true', time: e.MIRA_UPDATE_CHECK_TIME },
    version,
  };
}
