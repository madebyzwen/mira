import fs from 'node:fs';
import { buildApp } from './app.ts';
import { loadConfig } from './core/config.ts';

/** Version aus package.json – funktioniert im Quellcode (dev) und im Build (dist/). */
function readVersion(): string {
  for (const rel of ['./package.json', '../package.json']) {
    try {
      const pkg = JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8')) as { name?: string; version?: string };
      if (pkg.name === '@mira/backend' && pkg.version) return pkg.version;
    } catch {
      /* nächsten Pfad versuchen */
    }
  }
  return '0.0.0';
}

// Neu angelegte Dateien (Datenbank, später Zertifikate) nur für den MIRA-Benutzer lesbar
process.umask(0o077);

const config = loadConfig(process.env, readVersion());
const { app } = await buildApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'MIRA wird beendet');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ version: config.version, dataDir: config.dataDir, frontend: Boolean(config.staticDir) }, 'MIRA gestartet');
} catch (err) {
  app.log.error({ err }, 'Start fehlgeschlagen');
  process.exit(1);
}
