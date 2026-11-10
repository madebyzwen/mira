import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  AI_SERVER_ROLE,
  AI_SERVER_SLUG,
  historyQuerySchema,
  type AiServerStatusResponse,
  type HistoryResponse,
  type SystemSummary,
  type SystemsListResponse,
} from '@mira/shared';
import type { CoreContext, MiraModule } from '../../core/module.ts';
import { systemsMigrations } from './migrations.ts';
import { AgentClient } from './agentClient.ts';
import { AiServerMonitor } from './aiServerMonitor.ts';
import { SampleAggregator } from './sampleAggregator.ts';
import { ServerHistory } from './history.ts';

interface SystemRow {
  id: number;
  slug: string;
  name: string;
  kind: SystemSummary['kind'];
  description: string;
}

/**
 * Fachmodul „Systeme“: den KI-Server lesend überwachen (Stufe 2) und den Verlauf
 * speichern (Stufe 3).
 * Routen: `GET /api/v1/systems`, `GET /api/v1/systems/ai-server`,
 * `GET /api/v1/systems/ai-server/history?range=1h|24h|7d|30d`.
 */
export class SystemsModule implements MiraModule {
  readonly name = 'systems';
  readonly migrations = systemsMigrations;
  /** Für Tests zugänglich (z. B. um eine Abfrage gezielt auszulösen). */
  monitor: AiServerMonitor | undefined;
  history: ServerHistory | undefined;

  registerRoutes(app: FastifyInstance, ctx: CoreContext): void {
    const { db, config, scheduler, updates } = ctx;
    const found = db.prepare<[string], SystemRow>('SELECT id, slug, name, kind, description FROM systems WHERE slug = ?').get(AI_SERVER_SLUG);
    if (!found) throw new Error(`System „${AI_SERVER_SLUG}“ fehlt in der Datenbank`);
    // Anzeigename aus der Konfiguration übernehmen (ohne Angabe: „KI-Server“)
    const server: SystemRow = { ...found, name: config.aiServer.name ?? AI_SERVER_ROLE };
    if (server.name !== found.name) db.prepare('UPDATE systems SET name = ? WHERE id = ?').run(server.name, server.id);

    const client = createClient(config.aiServer, app);
    const history = new ServerHistory(db, server.id);
    const monitor = new AiServerMonitor({
      db,
      systemId: server.id,
      client,
      log: app.log,
      intervalMs: config.aiServer.pollSeconds * 1000,
      offlineAfterMs: config.aiServer.offlineSeconds * 1000,
      aggregator: new SampleAggregator(db, server.id),
      onApiVersion: (version) => updates.reportAgentVersion(version),
    });
    this.monitor = monitor;
    this.history = history;

    // Verlauf: alle 10 Minuten verdichten und Altes nach Ablauf der Aufbewahrung löschen
    scheduler.every(
      'systems.verlauf',
      10 * 60 * 1000,
      () => {
        history.aggregateHourly();
        const removed = history.prune(config.history.rawDays, config.history.hourlyDays);
        if (removed.raw || removed.hourly) app.log.info({ removed }, 'Alte Messwerte gelöscht');
      },
      { runNow: true },
    );

    app.addHook('onReady', async () => monitor.start());
    app.addHook('onClose', async () => monitor.stop());

    const summary = (): SystemSummary => ({
      slug: server.slug,
      name: server.name,
      kind: server.kind,
      description: server.description,
      status: monitor.snapshot.status,
    });

    app.get('/api/v1/systems', async (): Promise<SystemsListResponse> => ({ systems: [summary()] }));

    app.get(`/api/v1/systems/${AI_SERVER_SLUG}/history`, async (request): Promise<HistoryResponse> => {
      const { range } = historyQuerySchema.parse(request.query);
      return history.query(range);
    });

    app.get(`/api/v1/systems/${AI_SERVER_SLUG}`, async (): Promise<AiServerStatusResponse> => {
      const { info, metrics } = monitor.snapshot;
      return {
        system: summary(),
        connection: { configured: client !== null, endpoint: client?.endpoint ?? null, pollIntervalSeconds: config.aiServer.pollSeconds },
        info,
        metrics,
      };
    });
  }
}

function createClient(aiServer: CoreContext['config']['aiServer'], app: FastifyInstance): AgentClient | null {
  if (!aiServer.url || !aiServer.certFingerprint || !aiServer.tokenFile) return null;
  let token: string;
  try {
    token = fs.readFileSync(aiServer.tokenFile, 'utf8').trim();
  } catch (err) {
    app.log.error({ err, file: aiServer.tokenFile }, 'Token-Datei für den KI-Server nicht lesbar');
    return null;
  }
  if (!token) {
    app.log.error({ file: aiServer.tokenFile }, 'Token-Datei für den KI-Server ist leer');
    return null;
  }
  return new AgentClient({ url: aiServer.url, certFingerprint: aiServer.certFingerprint, token });
}
