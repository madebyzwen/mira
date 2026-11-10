import { useState, type FormEvent } from 'react';
import { Info, Pencil, Plug, Server, Trash2 } from 'lucide-react';
import { AI_SERVER_ROLE, AI_SERVER_SLUG, SHELLY_SLUG, type AiServerStatusResponse, type EnergyPricesResponse, type ShellyStatusResponse } from '@mira/shared';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { Button, IconButton, OnlinePill } from '../../components/ui/Primitives';
import { useNotice } from '../../components/ui/Notice';
import { dataService } from '../../services/dataService';
import { connectionErrorText, loggerErrorText, meterErrorText, systemsService } from '../../services/systemsService';
import { ApiError } from '../../services/apiClient';
import { usePolling } from '../../lib/usePolling';
import { formatDateTime, formatFileSize, formatNumber, formatRelative } from '../../lib/format';
import type { SystemEntry } from '../../types/models';

const kindIcon: Record<SystemEntry['kind'], typeof Server> = {
  server: Server,
  'power-meter': Plug,
};

/** KI-Server: Name und Verbindung zum Agent (Stufe 2, nur lesend – Bearbeiten folgt). */
function AiServerConnection({ data }: { data: AiServerStatusResponse | null }) {
  if (!data) return <p className="widget-note">Wird geladen …</p>;
  const { connection, system } = data;
  const status = system.status;
  return (
    <>
      <dl className="connection-list">
        <div>
          <dt>Name</dt>
          <dd>{system.name === AI_SERVER_ROLE ? 'nicht festgelegt (MIRA_AI_SERVER_NAME)' : system.name}</dd>
        </div>
        <div>
          <dt>Agent-Adresse</dt>
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
          : 'Verbindung über MIRA_AI_SERVER_URL, MIRA_AI_SERVER_CERT_FINGERPRINT und MIRA_AI_SERVER_TOKEN_FILE einrichten (siehe README).'}
      </p>
    </>
  );
}

/** Shelly Plug: Verbindung zum Shelly-Logger, Messung und Datenbank (Stufe 4b, nur lesend). */
function ShellyConnection({ data }: { data: ShellyStatusResponse | null }) {
  const { data: db } = usePolling(systemsService.getShellyDatabase, 60_000);
  if (!data) return <p className="widget-note">Wird geladen …</p>;
  const { logger, live } = data;
  const meter = !live
    ? '–'
    : live.state === 'online'
      ? `misst (${formatNumber(live.pollIntervalMs / 1000, 1)} s Intervall)`
      : live.lastError
        ? meterErrorText[live.lastError]
        : 'keine aktuelle Messung';
  return (
    <>
      <dl className="connection-list">
        <div>
          <dt>Shelly-Logger</dt>
          <dd>{logger.endpoint ?? 'nicht eingerichtet'}</dd>
        </div>
        <div>
          <dt>Verbindung</dt>
          <dd>{logger.reachable ? `verbunden${logger.version ? ` · Version ${logger.version}` : ''}` : logger.lastError ? loggerErrorText[logger.lastError] : 'wird geprüft …'}</dd>
        </div>
        <div>
          <dt>Gerät</dt>
          <dd>{live?.device ? `${live.device.model} · Firmware ${live.device.firmware ?? '–'}` : '–'}</dd>
        </div>
        <div>
          <dt>Messung</dt>
          <dd>{meter}</dd>
        </div>
        <div>
          <dt>Messdatenbank</dt>
          <dd>{db ? `${formatFileSize(db.bytes.total)} · ${formatNumber(db.samples)} Intervalle${db.oldestSample ? ` seit ${formatDateTime(db.oldestSample)}` : ''}` : '–'}</dd>
        </div>
      </dl>
      <EnergyPriceEditor />
      <p className="config-widget__note">
        <Info size={20} strokeWidth={1.6} />
        {logger.configured
          ? 'Messwerte liest MIRA ausschließlich beim Shelly-Logger; Strompreis und Kosten liegen nur in MIRA.'
          : 'Verbindung über MIRA_SHELLY_LOGGER_URL einrichten (siehe README).'}
      </p>
    </>
  );
}

const todayLocal = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/** Strompreis mit Gültigkeitsdatum – Kosten werden je Tag mit dem dann gültigen Preis berechnet. */
function EnergyPriceEditor() {
  const { notify } = useNotice();
  const { data, refresh } = usePolling(systemsService.getEnergyPrices, 300_000);
  const [prices, setPrices] = useState<EnergyPricesResponse | null>(null);
  const [validFrom, setValidFrom] = useState(todayLocal);
  const [cents, setCents] = useState('');
  const [busy, setBusy] = useState(false);
  const current = prices ?? data;

  const run = async (action: () => Promise<EnergyPricesResponse>, message: string) => {
    setBusy(true);
    try {
      setPrices(await action());
      refresh();
      notify(message);
      return true;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(cents.replace(',', '.'));
    if (!(value > 0)) return notify('Bitte einen Preis in Cent je kWh eingeben, z. B. 32,5');
    if (await run(() => systemsService.setEnergyPrice({ validFrom, centsPerKwh: value }), 'Strompreis gespeichert')) setCents('');
  };

  return (
    <div className="price-editor">
      <h4 className="price-editor__title">
        Strompreis{current?.currentPriceCents != null && <span> – aktuell {formatNumber(current.currentPriceCents, 2)} ct/kWh</span>}
      </h4>
      {current && current.prices.length > 0 ? (
        <ul className="price-editor__list">
          {[...current.prices].reverse().map((p) => (
            <li key={p.id}>
              <span>ab {formatDateTime(`${p.validFrom}T00:00:00`).slice(0, 10)}</span>
              <strong>{formatNumber(p.centsPerKwh, 2)} ct/kWh</strong>
              <IconButton label={`Preis ab ${p.validFrom} löschen`} tone="ghost" disabled={busy} onClick={() => void run(() => systemsService.deleteEnergyPrice(p.id), 'Strompreis gelöscht')}>
                <Trash2 size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="widget-note">Noch kein Strompreis hinterlegt – ohne Preis werden keine Kosten berechnet.</p>
      )}
      <form className="price-editor__form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          <span className="form-label">Gültig ab</span>
          <span className="field field--compact">
            <input className="field__input" type="date" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </span>
        </label>
        <label>
          <span className="form-label">Arbeitspreis brutto (ct/kWh)</span>
          <span className="field field--compact">
            <input className="field__input" type="text" inputMode="decimal" placeholder="z. B. 32,5" value={cents} onChange={(e) => setCents(e.target.value)} />
          </span>
        </label>
        <Button type="submit" className="button--sm" disabled={busy}>
          Speichern
        </Button>
      </form>
    </div>
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
 * Der KI-Server zeigt seit Stufe 2 den echten Verbindungsstatus (nur lesend), der Shelly Plug
 * seit Stufe 4b die Verbindung zum Shelly-Logger und den Strompreis;
 * die übrigen Systeme bleiben Platzhalter bis zu ihrer Stufe.
 */
export function ConfigSystemsPage() {
  const { notAvailable } = useNotice();
  const systems = dataService.getSystems();
  const { data: aiServer } = usePolling(systemsService.getAiServer, 10000);
  const { data: shelly } = usePolling(systemsService.getShelly, 10000);

  return (
    <Page breadcrumb={[{ label: 'Konfiguration', to: '/konfiguration' }, { label: 'Systeme' }]} className="config-page">
      <div className="config-systems">
        {systems.map((system) => {
          const Icon = kindIcon[system.kind];
          const isAiServer = system.id === AI_SERVER_SLUG;
          const isShelly = system.id === SHELLY_SLUG;
          const status = isAiServer ? (aiServer?.system.status.state ?? 'unknown') : isShelly ? (shelly?.system.status.state ?? 'unknown') : system.status;
          const label = isAiServer ? (aiServer?.system.name ?? system.label) : system.label;
          return (
            <Card
              key={system.id}
              className="config-widget"
              icon={<Icon size={28} />}
              title={
                <>
                  {label} <OnlinePill status={status} />
                </>
              }
              subtitle={system.description}
              divider
              actions={
                <Button
                  variant="outline"
                  className="button--sm"
                  icon={<Pencil size={18} />}
                  onClick={() => notAvailable(`${label} konfigurieren`)}
                >
                  Bearbeiten
                </Button>
              }
            >
              {isAiServer ? <AiServerConnection data={aiServer} /> : isShelly ? <ShellyConnection data={shelly} /> : <Placeholder label={label} />}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
