import path from 'node:path';
import { z } from 'zod';

/**
 * Zentrale Konfiguration aus Umgebungsvariablen.
 * Geheimnisse (Passwörter, Schlüssel) werden nie direkt als Variable übergeben,
 * sondern immer als Pfad auf eine Datei (`…_FILE`).
 */
const envSchema = z.object({
  MIRA_HOST: z.string().default('0.0.0.0'),
  MIRA_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  MIRA_DATA_DIR: z.string().default('/data'),
  MIRA_DB_FILE: z.string().optional(),
  MIRA_STATIC_DIR: z.string().optional(),
  MIRA_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** `false`, `true` oder kommagetrennte Proxy-Adressen/Netze (z. B. `192.0.2.10`) */
  MIRA_TRUST_PROXY: z.string().default('false'),
  /** `auto` = Secure-Cookie, wenn die Anfrage per HTTPS kam (über Proxy-Header) */
  MIRA_COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  MIRA_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  MIRA_LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
  MIRA_LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  MIRA_ADMIN_USER: z.string().trim().min(1).max(64).optional(),
  MIRA_ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(64).optional(),
  MIRA_ADMIN_PASSWORD_FILE: z.string().optional(),
  MIRA_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
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
    version,
  };
}
