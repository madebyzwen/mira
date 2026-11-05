import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { OdinStatusResponse, SystemSummary, SystemsListResponse } from '@mira/shared';
import type { CoreContext, MiraModule } from '../../core/module.ts';
import { systemsMigrations } from './migrations.ts';
import { OdinClient } from './odinClient.ts';
import { OdinMonitor } from './odinMonitor.ts';

interface SystemRow {
  id: number;
  slug: string;
  name: string;
  kind: SystemSummary['kind'];
  description: string;
}

/**
 * Fachmodul „Systeme“ – Stufe 2: Odin lesend überwachen.
 * Routen: `GET /api/v1/systems`, `GET /api/v1/systems/odin`.
 */
export class SystemsModule implements MiraModule {
  readonly name = 'systems';
  readonly migrations = systemsMigrations;
  /** Für Tests zugänglich (z. B. um eine Abfrage gezielt auszulösen). */
  monitor: OdinMonitor | undefined;

  registerRoutes(app: FastifyInstance, ctx: CoreContext): void {
    const { db, config } = ctx;
    const odinRow = db.prepare<[string], SystemRow>('SELECT id, slug, name, kind, description FROM systems WHERE slug = ?').get('odin');
    if (!odinRow) throw new Error('System „odin“ fehlt in der Datenbank');

    const client = createClient(config.odin, app);
    const monitor = new OdinMonitor({ db, systemId: odinRow.id, client, log: app.log, intervalMs: config.odin.pollSeconds * 1000 });
    this.monitor = monitor;

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
