import { z } from 'zod';
import { loadConfig } from './config.ts';
import { createShellyLogger, readVersion } from './logger.ts';

function readConfig() {
  try {
    return loadConfig();
  } catch (err) {
    const detail = err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : String(err);
    console.error(`Konfiguration ungültig:\n${detail}`);
    process.exit(1);
  }
}

const config = readConfig();
const version = readVersion();
const logger = createShellyLogger(config, { version });
const { app } = logger;

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'Shelly-Logger wird beendet');
    // Abfrage abwarten, laufendes Intervall schreiben, Datenbank schließen
    void logger
      .stop()
      .then(() => app.close())
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error({ err }, 'Fehler beim Beenden');
        process.exit(1);
      });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  logger.start();
  app.log.info(
    { version, pollIntervalMs: config.pollIntervalMs, timeZone: config.timeZone, shelly: config.shelly.url, auth: Boolean(config.apiToken) },
    'Shelly-Logger gestartet',
  );
} catch (err) {
  app.log.error({ err }, 'Start fehlgeschlagen');
  await logger.stop();
  process.exit(1);
}
