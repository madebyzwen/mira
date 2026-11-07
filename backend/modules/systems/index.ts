import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { historyQuerySchema, type HistoryResponse, type OdinStatusResponse, type SystemSummary, type SystemsListResponse } from '@mira/shared';
import type { CoreContext, MiraModule } from '../../core/module.ts';
import { systemsMigrations } from './migrations.ts';
import { OdinClient } from './odinClient.ts';
import { OdinMonitor } from './odinMonitor.ts';
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
 * Fachmodul „Systeme“: Odin lesend überwachen (Stufe 2) und den Verlauf
 * speichern (Stufe 3).
 * Routen: `GET /api/v1/systems`, `GET /api/v1/systems/odin`,
 * `GET /api/v1/systems/odin/history?range=1h|24h|7d|30d`.
 */
export class SystemsModule implements MiraModule {
  readonly name = 'systems';
  readonly migrations = systemsMigrations;
  /** Für Tests zugänglich (z. B. um eine Abfrage gezielt auszulösen). */
  monitor: OdinMonitor | undefined;
  history: ServerHistory | undefined;

  registerRoutes(app: FastifyInstance, ctx: CoreContext): void {
    const { db, config, scheduler, updates } = ctx;
    const odinRow = db.prepare<[string], SystemRow>('SELECT id, slug, name, kind, description FROM systems WHERE slug = ?').get('odin');
    if (!odinRow) throw new Error('System „odin“ fehlt in der Datenbank');

    const client = createClient(config.odin, app);
    const history = new ServerHistory(db, odinRow.id);
    const monitor = new OdinMonitor({
      db,
      systemId: odinRow.id,
      client,
      log: app.log,
      intervalMs: config.odin.pollSeconds * 1000,
      offlineAfterMs: config.odin.offlineSeconds * 1000,
      aggregator: new SampleAggregator(db, odinRow.id),
      onApiVersion: (version) => updates.reportOdinApiVersion(version),
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
      slug: odinRow.slug,
      name: odinRow.name,
      kind: odinRow.kind,
      description: odinRow.description,
      status: monitor.snapshot.status,
    });

    app.get('/api/v1/systems', async (): Promise<SystemsListResponse> => ({ systems: [summary()] }));

    app.get('/api/v1/systems/odin/history', async (request): Promise<HistoryResponse> => {
      const { range } = historyQuerySchema.parse(request.query);
      return history.query(range);
    });

    app.get('/api/v1/systems/odin', async (): Promise<OdinStatusResponse> => {
      const { info, metrics } = monitor.snapshot;
      return {
        system: summary(),
        connection: { configured: client !== null, endpoint: client?.endpoint ?? null, pollIntervalSeconds: config.odin.pollSeconds },
        info,
        metrics,
      };
    });
  }
}

function createClient(odin: CoreContext['config']['odin'], app: FastifyInstance): OdinClient | null {
  if (!odin.apiUrl || !odin.certFingerprint || !odin.tokenFile) return null;
  let token: string;
  try {
    token = fs.readFileSync(odin.tokenFile, 'utf8').trim();
  } catch (err) {
    app.log.error({ err, file: odin.tokenFile }, 'Token-Datei für die Odin-API nicht lesbar');
    return null;
  }
  if (!token) {
    app.log.error({ file: odin.tokenFile }, 'Token-Datei für die Odin-API ist leer');
    return null;
  }
  return new OdinClient({ url: odin.apiUrl, certFingerprint: odin.certFingerprint, token });
}
