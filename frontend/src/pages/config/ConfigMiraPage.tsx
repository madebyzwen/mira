import { CircleCheck, Download, ExternalLink, Info } from 'lucide-react';
import type { ComponentUpdate, UpdateCheckResult, UpdateStatusResponse } from '@mira/shared';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Primitives';
import { notificationsService, updateCheckErrorText } from '../../services/notificationsService';
import { usePolling } from '../../lib/usePolling';
import { formatDateTime } from '../../lib/format';

const componentLabel: Record<ComponentUpdate['component'], string> = {
  mira: 'MIRA',
  'odin-api': 'Odin-API',
};

function installedText(c: ComponentUpdate): string {
  if (!c.installed) return c.component === 'odin-api' ? 'unbekannt – Odin noch nicht erreicht' : 'unbekannt (Entwicklungsversion)';
  return c.installedAtMost ? `${c.installed} oder älter` : c.installed;
}

function UpdatePill({ c }: { c: ComponentUpdate }) {
  if (c.updateAvailable) return <Pill tone="violet">Update verfügbar</Pill>;
  if (c.installed && c.latest) return <Pill tone="success">Aktuell</Pill>;
  return <Pill tone="neutral">Unbekannt</Pill>;
}

/** „heute, 04:00 Uhr“, „gestern, 18:12 Uhr“ oder Datum mit Uhrzeit. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
  const day = (offset: number) => {
    const x = new Date();
    x.setDate(x.getDate() - offset);
    return x.toDateString();
  };
  if (d.toDateString() === day(0)) return `heute, ${time}`;
  if (d.toDateString() === day(1)) return `gestern, ${time}`;
  return `${formatDateTime(iso)} Uhr`;
}

function LastCheck({ check }: { check: UpdateCheckResult | null }) {
  if (!check) return <dd>noch nie</dd>;
  const how = check.trigger === 'manual' ? 'von Hand' : 'automatisch';
  return (
    <dd>
      {formatWhen(check.at)} ({how})
      {!check.ok && check.error && <span className="update-list__error">{updateCheckErrorText[check.error]}</span>}
    </dd>
  );
}

function UpdatesCard({ status }: { status: UpdateStatusResponse | null }) {
  return (
    <Card className="config-widget" icon={<Download size={28} />} title="Updates" subtitle="Neue Versionen von MIRA und der Odin-API auf GitHub" divider>
      {!status ? (
        <p className="widget-note">Wird geladen …</p>
      ) : (
        <>
          <ul className="update-list">
            {status.components.map((c) => (
              <li key={c.component} className="update-list__item">
                <div className="update-list__head">
                  <strong>{componentLabel[c.component]}</strong>
                  <UpdatePill c={c} />
                </div>
                <dl className="connection-list">
                  <div>
                    <dt>Installiert</dt>
                    <dd>{installedText(c)}</dd>
                  </div>
                  <div>
                    <dt>Neueste Version</dt>
                    <dd>{c.latest ?? (status.release ? 'nicht im Release enthalten' : 'noch nicht geprüft')}</dd>
                  </div>
                </dl>
                {c.updateAvailable && (
                  <p className="update-list__hint">
                    {c.component === 'mira'
                      ? 'Update in Portainer: Stack „mira“ → „Update the stack“ mit „Re-pull image“.'
                      : 'Update auf Odin: Paket laden, Prüfsumme prüfen, sudo ./install.sh – Konfiguration, Zertifikat und Token bleiben erhalten.'}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <dl className="connection-list update-list__meta">
            <div>
              <dt>Zuletzt geprüft</dt>
              <LastCheck check={status.lastCheck} />
            </div>
            {status.release && (
              <div>
                <dt>Neuestes Release</dt>
                <dd>
                  <a href={status.release.url} target="_blank" rel="noopener noreferrer" className="text-link">
                    {status.release.tag} – Release-Notes
                    <ExternalLink size={14} />
                  </a>
                </dd>
              </div>
            )}
          </dl>

          <p className="config-widget__note">
            {status.enabled ? <CircleCheck size={20} strokeWidth={1.6} /> : <Info size={20} strokeWidth={1.6} />}
            {status.enabled
              ? `MIRA prüft automatisch täglich um ${status.scheduleTime} Uhr und beim ersten Aufruf am Tag. Installiert wird nichts automatisch.`
              : 'Die Update-Prüfung ist abgeschaltet (MIRA_UPDATE_CHECK=false) – MIRA baut keine Verbindung zu GitHub auf.'}
          </p>
        </>
      )}
    </Card>
  );
}

/** Konfiguration › MIRA – zunächst der Bereich „Updates“ (nur Anzeige). */
export function ConfigMiraPage() {
  const { data: status } = usePolling(notificationsService.getUpdateStatus, 60_000);
  return (
    <Page breadcrumb={[{ label: 'Konfiguration', to: '/konfiguration' }, { label: 'MIRA' }]} className="config-page">
      <div className="config-systems">
        <UpdatesCard status={status} />
      </div>
    </Page>
  );
}
