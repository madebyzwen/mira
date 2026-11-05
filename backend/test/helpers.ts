import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp, type MiraApp } from '../app.ts';
import { loadConfig, type AppConfig } from '../core/config.ts';

export const ADMIN_USER = 'sven';
export const ADMIN_PASSWORD = 'korrekt-pferd-batterie';

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mira-test-'));
}

/** Konfiguration mit eigenem temporären Datenverzeichnis und Startpasswort-Datei. */
export function testConfig(env: Record<string, string> = {}): AppConfig {
  const dir = tempDir();
  const passwordFile = path.join(dir, 'admin_password.txt');
  fs.writeFileSync(passwordFile, `${ADMIN_PASSWORD}\n`);
  return loadConfig(
    {
      MIRA_DATA_DIR: dir,
      MIRA_ADMIN_USER: ADMIN_USER,
      MIRA_ADMIN_DISPLAY_NAME: 'Sven',
      MIRA_ADMIN_PASSWORD_FILE: passwordFile,
      ...env,
    },
    'test',
  );
}

export async function startApp(config: AppConfig): Promise<MiraApp> {
  const mira = await buildApp(config, { logger: false });
  await mira.app.ready();
  return mira;
}

export function sessionCookieOf(res: LightMyRequestResponse): string | undefined {
  return res.cookies.find((c) => c.name === 'mira_session')?.value;
}

export function login(app: FastifyInstance, username = ADMIN_USER, password = ADMIN_PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } });
}

export async function loginCookie(app: FastifyInstance): Promise<string> {
  const res = await login(app);
  const token = sessionCookieOf(res);
  if (res.statusCode !== 200 || !token) throw new Error(`Login fehlgeschlagen: ${res.statusCode} ${res.body}`);
  return token;
}
