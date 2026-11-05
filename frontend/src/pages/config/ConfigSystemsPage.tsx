import { Info, Pencil, Plug, Server } from 'lucide-react';
import type { OdinStatusResponse } from '@mira/shared';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { Button, OnlinePill } from '../../components/ui/Primitives';
import { useNotice } from '../../components/ui/Notice';
import { dataService } from '../../services/dataService';
import { connectionErrorText, systemsService } from '../../services/systemsService';
import { usePolling } from '../../lib/usePolling';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { SystemEntry } from '../../types/models';

const kindIcon: Record<SystemEntry['kind'], typeof Server> = {
  server: Server,
  'power-meter': Plug,
};

/** Odin: Verbindung zur Odin-API (Stufe 2, nur lesend – Bearbeiten folgt). */
function OdinConnection({ data }: { data: OdinStatusResponse | null }) {
  if (!data) return <p className="widget-note">Wird geladen …</p>;
  const { connection, system } = data;
  const status = system.status;
  return (
    <>
      <dl className="connection-list">
        <div>
          <dt>Odin-API</dt>
          <dd>{connection.endpoint ?? 'nicht eingerichtet'}</dd>
        </div>
        <div>
          <dt>Verbindung</dt>
          <dd>
            {status.state === 'online'
              ? 'verbunden (TLS, Zertifikat geprüft)'
              : status.lastError
                ? connectionErrorText[status.lastError]
                : 'wird geprüft …'}
          </dd>
        </div>
        <div>
          <dt>Abfrageintervall</dt>
          <dd>{connection.pollIntervalSeconds} s</dd>
        </div>
        <div>
          <dt>Zuletzt erreichbar</dt>
          <dd>{status.lastSeenAt ? `${formatRelative(status.lastSeenAt)} (${formatDateTime(status.lastSeenAt)})` : 'noch nie'}</dd>
        </div>
      </dl>
      <p className="config-widget__note">
        <Info size={20} strokeWidth={1.6} />
        {connection.configured
          ? 'Die Verbindungsdaten werden derzeit über die Konfiguration des Containers festgelegt.'
          : 'Verbindung über MIRA_ODIN_API_URL, MIRA_ODIN_CERT_FINGERPRINT und MIRA_ODIN_TOKEN_FILE einrichten (siehe README).'}
      </p>
    </>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <>
      <div className="config-skeleton" aria-hidden>
        {[0.32, 0.24, 0.4].map((labelWidth, i) => (
          <div key={i} className="config-skeleton__row">
            <span className="config-skeleton__label" style={{ width: `${labelWidth * 100}%` }} />
            <span className="config-skeleton__input" />
          </div>
        ))}
      </div>
      <p className="config-widget__note">
        <Info size={20} strokeWidth={1.6} />
        Die Einstellungen für {label} werden in einer späteren Phase festgelegt.
      </p>
    </>
  );
}

/**
 * Konfiguration › Systeme – je System ein Widget.
 * Odin zeigt seit Stufe 2 den echten Verbindungsstatus (nur lesend);
 * die übrigen Systeme bleiben Platzhalter bis zu ihrer Stufe.
 */
export function ConfigSystemsPage() {
  const { notAvailable } = useNotice();
  const systems = dataService.getSystems();
  const { data: odin } = usePolling(systemsService.getOdin, 10000);

  return (
    <Page breadcrumb={[{ label: 'Konfiguration', to: '/konfiguration' }, { label: 'Systeme' }]} className="config-page">
      <div className="config-systems">
        {systems.map((system) => {
          const Icon = kindIcon[system.kind];
          const isOdin = system.id === 'odin';
          const status = isOdin ? (odin?.system.status.state ?? 'unknown') : system.status;
          return (
            <Card
              key={system.id}
              className="config-widget"
              icon={<Icon size={28} />}
              title={
                <>
                  {system.label} <OnlinePill status={status} />
                </>
              }
              subtitle={system.description}
              divider
              actions={
                <Button
                  variant="outline"
                  className="button--sm"
                  icon={<Pencil size={18} />}
                  onClick={() => notAvailable(`${system.label} konfigurieren`)}
                >
                  Bearbeiten
                </Button>
              }
            >
              {isOdin ? <OdinConnection data={odin} /> : <Placeholder label={system.label} />}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
