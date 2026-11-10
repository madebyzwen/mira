import { useState } from 'react';
import { Link } from 'react-router';
import { DEFAULT_HISTORY_RANGE, type ConsumptionPeriod, type ShellyStatusResponse, type ShellySummaryResponse } from '@mira/shared';
import { Activity, AlarmClock, AlertTriangle, CalendarDays, ChartColumn, Cpu, Database, Euro, Gauge, Info, Layers, Plug, Server, Zap } from 'lucide-react';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { IconTile, OnlinePill, RangeTabs, Stat, rangeTitleSuffix } from '../../components/ui/Primitives';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { ShellyPlugIllustration } from '../../components/illustrations/ShellyPlugIllustration';
import { DevicePhoto } from '../../components/illustrations/DevicePhoto';
import { formatCost, formatDateTime, formatEnergy, formatFileSize, formatNumber, formatRelative } from '../../lib/format';
import { historyPointLabels, historyTicks } from '../../lib/historyTicks';
import { usePolling } from '../../lib/usePolling';
import { loggerErrorText, meterErrorText, systemsService } from '../../services/systemsService';
import type { ChartRange } from '../../types/models';

/** Live-Leistung jede Sekunde (der Logger misst ebenfalls sekündlich) – nur solange die Seite sichtbar ist */
const LIVE_POLL_MS = 1_000;
const SUMMARY_POLL_MS = 30_000;
const HISTORY_POLL_MS = 60_000;
const DASH = '–';

const PERIOD_LABEL: Record<ConsumptionPeriod, string> = { day: 'Heute', week: 'Diese Woche', month: 'Dieser Monat', year: 'Dieses Jahr' };

/** Leistungsskala: mindestens 100 W, darüber in 50-W-Schritten */
function powerScaleMax(values: (number | null)[]): number {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  return Math.max(100, Math.ceil((max * 1.1) / 50) * 50);
}

/** Hinweis, wenn der Live-Wert fehlt oder nicht aktuell ist – alte Werte werden nie als aktuell gezeigt */
function StatusLine({ data }: { data: ShellyStatusResponse }) {
  const { logger, live } = data;
  let text: string | null = null;
  if (!logger.reachable) text = logger.lastError ? loggerErrorText[logger.lastError] : 'Shelly-Logger nicht erreichbar';
  else if (live && live.state !== 'online') {
    const reason = live.lastError ? meterErrorText[live.lastError] : 'keine aktuelle Messung';
    text = `${reason}${live.measuredAt ? ` · letzte Messung ${formatRelative(live.measuredAt)}` : ''}`;
  }
  if (!text) return null;
  return (
    <p className="status-line" role="status">
      <AlertTriangle size={18} aria-hidden />
      <span>{text}</span>
    </p>
  );
}

/** Verbrauch und Kosten: heute, Woche, Monat, Jahr */
function ConsumptionCard({ data, error }: { data: ShellySummaryResponse | null; error: unknown }) {
  const icons: Record<ConsumptionPeriod, typeof Zap> = { day: Zap, week: CalendarDays, month: CalendarDays, year: CalendarDays };
  return (
    <Card title="Verbrauch & Kosten" icon={<Euro size={28} />} divider>
      {!data ? (
        <p className="widget-note">{error ? 'Verbrauch konnte nicht geladen werden – Shelly-Logger nicht erreichbar.' : 'Wird geladen …'}</p>
      ) : (
        <>
          <div className="spec-strip spec-strip--periods">
            {(['day', 'week', 'month', 'year'] as const).map((p) => {
              const s = data.periods[p];
              const Icon = icons[p];
              const cost = s.costEur === null ? 'Kosten: kein Strompreis' : `${formatCost(s.costEur)}${s.costComplete ? '' : ' (unvollständig)'}`;
              return (
                <Stat
                  key={p}
                  icon={<Icon size={28} strokeWidth={1.5} />}
                  label={PERIOD_LABEL[p]}
                  value={formatEnergy(s.energyWh)}
                  detail={
                    <>
                      {cost}
                      {s.reconstructedWh > 0 && (
                        <span className="stat__note" title="Aus dem Zählerstand über einen Messausfall ergänzt – Summe sicher, zeitliche Verteilung unbekannt">
                          davon {formatEnergy(s.reconstructedWh)} rekonstruiert
                        </span>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
          <p className="config-widget__note">
            <Info size={20} strokeWidth={1.6} />
            {data.currentPriceCents !== null ? (
              <>
                Strompreis: {formatNumber(data.currentPriceCents, 2)} ct/kWh – Kosten je Tag mit dem jeweils gültigen Preis.{' '}
                <Link to="/konfiguration/systeme" className="text-link">
                  Ändern
                </Link>
              </>
            ) : (
              <>
                Für die Kosten fehlt noch ein Strompreis.{' '}
                <Link to="/konfiguration/systeme" className="text-link">
                  In der Konfiguration eintragen
                </Link>
              </>
            )}
          </p>
        </>
      )}
    </Card>
  );
}

/** Leistungsverlauf aus den 30-s-Intervallen des Loggers – Lücken bleiben sichtbar */
function PowerHistoryCard() {
  const [range, setRange] = useState<ChartRange>(DEFAULT_HISTORY_RANGE);
  const { data, error } = usePolling(() => systemsService.getShellyHistory(range), HISTORY_POLL_MS, range);
  const points = data?.points ?? [];
  const values = points.map((p) => p.avgW);
  const timestamps = points.map((p) => p.ts);
  const last = [...values].reverse().find((v): v is number => v !== null);
  const yMax = powerScaleMax(values);
  return (
    <Card title={`Leistung (${rangeTitleSuffix[range]})`} icon={<ChartColumn size={28} />} actions={<RangeTabs value={range} onChange={setRange} />} className="chart-card">
      <TimeSeriesChart
        ariaLabel={`Leistungsaufnahme, ${rangeTitleSuffix[range]}`}
        series={[{ label: 'Leistung', values, color: 'violet' }]}
        ticks={data ? historyTicks(data.range, timestamps) : []}
        pointLabels={data ? historyPointLabels(data.range, data.stepSeconds, timestamps) : undefined}
        yMax={yMax}
        yStep={yMax / 4}
        formatY={(v) => `${formatNumber(v)} W`}
        formatValue={(v) => `${formatNumber(v, 1, 1)} W`}
        area="strong"
        endLabel={last !== undefined ? `${formatNumber(last, 1, 1)} W` : undefined}
        height={160}
        emptyText={error ? 'Verlauf konnte nicht geladen werden' : !data ? 'Verlauf wird geladen …' : 'Noch keine Messwerte in diesem Zeitraum'}
      />
    </Card>
  );
}

/**
 * Systeme › Shelly Plug: Messwerte vom Shelly-Logger (Stufe 4b, ADR 0010),
 * Kosten aus dem Strompreis in MIRA. Der Browser fragt nie den Shelly selbst.
 */
export function ShellyPlugPage() {
  const { data } = usePolling(systemsService.getShelly, LIVE_POLL_MS);
  const { data: summary, error: summaryError } = usePolling(systemsService.getShellySummary, SUMMARY_POLL_MS);
  const { data: db } = usePolling(systemsService.getShellyDatabase, HISTORY_POLL_MS);

  const live = data?.live ?? null;
  const online = live?.state === 'online';
  const state = data?.system.status.state ?? 'unknown';
  const name = data?.system.name ?? 'Shelly Plug';
  const value = (v: number | null | undefined, digits: number, unit: string) => (online && v != null ? `${formatNumber(v, digits, digits)} ${unit}` : DASH);
  const today = summary?.periods.day;

  const details = [
    { icon: Plug, label: 'Gerät', value: live?.device ? `${live.device.model} (Gen ${live.device.generation})` : DASH },
    { icon: Cpu, label: 'Firmware', value: live?.device?.firmware ?? DASH },
    { icon: AlarmClock, label: 'Messintervall', value: live ? `${formatNumber(live.pollIntervalMs / 1000, 1)} s` : DASH },
    { icon: Activity, label: 'Letzte Messung', value: live?.measuredAt ? `${formatRelative(live.measuredAt)} (${formatDateTime(live.measuredAt)})` : DASH },
    {
      icon: Server,
      label: 'Shelly-Logger',
      value: data ? (data.logger.reachable ? `verbunden${data.logger.version ? ` · Version ${data.logger.version}` : ''}` : data.logger.lastError ? loggerErrorText[data.logger.lastError] : DASH) : DASH,
    },
    {
      icon: Database,
      label: 'Messdatenbank',
      value: db ? `${formatFileSize(db.bytes.total)} · ${formatNumber(db.samples)} Intervalle${db.oldestSample ? ` seit ${formatDateTime(db.oldestSample)}` : ''}` : DASH,
    },
  ];

  return (
    <Page breadcrumb={[{ label: 'Systeme', to: '/systeme/ki-server' }, { label: name }]} className="system-page">
      <div className="page-header">
        <IconTile>
          <Plug size={32} strokeWidth={1.6} />
        </IconTile>
        <div>
          <h1>{name}</h1>
          <p>{data?.system.description ?? 'Strommessung für den KI-Server'}</p>
        </div>
      </div>

      <Card className="hero-card hero-card--plug">
        <div className="hero-card__image">
          <DevicePhoto name="shelly-plug" alt={name} fallback={<ShellyPlugIllustration />} />
        </div>
        <div className="hero-card__content">
          <div className="hero-card__title">
            <h2>{live?.device ? 'Shelly Plug PM' : name}</h2>
            <OnlinePill status={state} />
          </div>
          {data && <StatusLine data={data} />}
          <div className={['spec-strip', 'spec-strip--large', !online && 'is-stale'].filter(Boolean).join(' ')}>
            <Stat icon={<Zap size={30} strokeWidth={1.5} />} label="Aktuelle Leistung" value={value(live?.powerW, 1, 'W')} />
            <Stat icon={<Gauge size={30} strokeWidth={1.5} />} label="Spannung" value={value(live?.voltageV, 1, 'V')} />
            <Stat icon={<Layers size={30} strokeWidth={1.5} />} label="Strom" value={value(live?.currentA, 3, 'A')} />
            <Stat icon={<CalendarDays size={30} strokeWidth={1.5} />} label="Verbrauch heute" value={today ? formatEnergy(today.energyWh) : DASH} />
            <Stat icon={<Euro size={30} strokeWidth={1.5} />} label="Kosten heute" value={today?.costEur != null ? formatCost(today.costEur) : DASH} />
          </div>
        </div>
      </Card>

      <ConsumptionCard data={summary} error={summaryError} />

      <PowerHistoryCard />

      <Card title="Gerätedetails & Messung" icon={<Info size={28} />} divider>
        <dl className="detail-table">
          {details.map((d) => (
            <div key={d.label}>
              <dt>
                <d.icon size={22} strokeWidth={1.5} />
                {d.label}
              </dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </Page>
  );
}
