import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfigFile } from './config.ts';
import { Host } from './host.ts';
import { buildServer } from './server.ts';

declare const __AGENT_VERSION__: string | undefined;
const VERSION = typeof __AGENT_VERSION__ === 'string' ? __AGENT_VERSION__ : 'dev';

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: '/etc/mira-agent/config.json' },
    /** Nur prüfen (Konfiguration, Zertifikat, Token lesbar) und beenden – für install.sh */
    check: { type: 'boolean', default: false },
  },
});

function readConfig(file: string) {
  try {
    return loadConfigFile(file);
  } catch (err) {
    const detail = err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : String(err);
    console.error(`Konfiguration ${file} ist ungültig:\n${detail}`);
    process.exit(1);
  }
}

const config = readConfig(values.config!);
const app = buildServer({
  config,
  tls: { key: fs.readFileSync(config.tls.keyFile), cert: fs.readFileSync(config.tls.certFile) },
  tokenHash: fs.readFileSync(config.tokenHashFile, 'utf8').trim(),
  host: new Host(config),
  version: VERSION === 'dev' ? undefined : VERSION,
});

if (values.check) {
  console.log(`Konfiguration in Ordnung: lauscht auf ${config.listen.host}:${config.listen.port}, Zugriff nur von ${config.allowedClients.join(', ')}`);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.listen.host, port: config.listen.port });
  app.log.info({ version: VERSION, allowedClients: config.allowedClients }, 'MIRA-Agent gestartet');
} catch (err) {
  app.log.error({ err }, 'Start fehlgeschlagen');
  process.exit(1);
}
