import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ChartColumn,
  Clock,
  Cpu,
  Database,
  EthernetPort,
  Gpu,
  HardDrive,
  Layers,
  Link as LinkIcon,
  MemoryStick,
  Network,
  Server,
  Terminal,
  Thermometer,
} from 'lucide-react';
import { DEFAULT_HISTORY_RANGE } from '@mira/shared';
import type { NetworkShare, OdinStatusResponse, SystemInfo, SystemMetrics, Temperature } from '@mira/shared';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { IconTile, OnlinePill, ProgressBar, RangeTabs, Stat, rangeTitleSuffix } from '../../components/ui/Primitives';
import { MultiPanelChart } from '../../components/charts/TimeSeriesChart';
import { ServerTower } from '../../components/illustrations/ServerTower';
import { DevicePhoto } from '../../components/illustrations/DevicePhoto';
import { connectionErrorText, systemsService } from '../../services/systemsService';
import { usePolling } from '../../lib/usePolling';
import { historyPointLabels, historyTicks } from '../../lib/historyTicks';
import {
  formatBytes,
  formatGib,
  formatInstalledMemory,
  formatNumber,
  formatPercent,
  formatRelative,
  formatUptime,
  percentOf,
  shortCpuModel,
} from '../../lib/format';
import type { ChartRange } from '../../types/models';

/** Live-Werte: alle 2 s, solange die Seite sichtbar ist (MIRA fragt Odin selbst ebenfalls alle 2 s ab). */
const POLL_MS = 2000;
/** Verlauf: neue Minutenwerte kommen einmal pro Minute hinzu. */
const HISTORY_POLL_MS = 60_000;
const DASH = '–';

const tempIcon: Record<Temperature['sensor'], typeof Cpu> = { cpu: Cpu, gpu: Gpu, nvme: HardDrive };

/** Ältere Odin-API-Versionen liefern keinen Status – dort waren alle gelieferten Laufwerke eingehängt. */
const shareStateText: Record<NonNullable<NetworkShare['state']>, string> = {
  mounted: 'eingehängt',
  automount: 'bereit (wird bei Zugriff eingehängt)',
  unmounted: 'nicht eingehängt',
};

function coresText(cpu: SystemInfo['cpu']): string | undefined {
  if (cpu.physicalCores && cpu.performanceCores && cpu.efficiencyCores) {
    return `${cpu.physicalCores} Cores (${cpu.performanceCores}P + ${cpu.efficiencyCores}E)`;
  }
  if (cpu.physicalCores) return `${cpu.physicalCores} Cores / ${cpu.threads} Threads`;
  return `${cpu.threads} Threads`;
}

function StatusLine({ data }: { data: OdinStatusResponse }) {
  const { status } = data.system;
  if (status.state === 'online') return null;
  const reason = status.lastError ? connectionErrorText[status.lastError] : 'Status wird ermittelt';
  return (
    <p className="status-line" role="status">
      <AlertTriangle size={18} aria-hidden />
      <span>
        {status.state === 'unknown' && status.lastError !== 'not_configured' ? 'Status wird ermittelt …' : reason}
        {status.lastSeenAt && ` · zuletzt erreichbar ${formatRelative(status.lastSeenAt)}`}
        {data.metrics && status.state === 'offline' && ' · angezeigt werden die letzten bekannten Werte'}
      </span>
    </p>
  );
}

/** Verlauf CPU/GPU aus der Datenbank – Lücken (keine Messung) bleiben sichtbar. */
/** Verlauf der Temperaturen: Skala bis 100 °C, bei höheren Werten in 25er-Schritten erweitert. */
function tempScaleMax(values: (number | null)[]): number {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  return Math.max(100, Math.ceil(max / 25) * 25);
}

/**
 * Verlauf aus der Datenbank: oben Auslastung (%), darunter Temperaturen (°C) –
 * gemeinsame Zeitachse und Werteanzeige. Lücken (keine Messung) bleiben sichtbar.
 */
function UsageHistoryCard() {
  const [range, setRange] = useState<ChartRange>(DEFAULT_HISTORY_RANGE);
  const { data, error } = usePolling(() => systemsService.getOdinHistory(range), HISTORY_POLL_MS, range);
  const points = data?.points ?? [];
  const timestamps = points.map((p) => p.ts);
  const tempCpu = points.map((p) => p.tempCpu);
  const tempGpu = points.map((p) => p.tempGpu);
  const emptyText = error
    ? 'Verlauf konnte nicht geladen werden'
    : !data
      ? 'Verlauf wird geladen …'
      : 'Verlauf wird aufgebaut – die ersten Werte erscheinen nach einigen Minuten';

  return (
    <Card
      title={`Auslastung & Temperaturen (${rangeTitleSuffix[range]})`}
      icon={<ChartColumn size={28} />}
      actions={<RangeTabs value={range} onChange={setRange} />}
      className="chart-card"
    >
      <MultiPanelChart
        ariaLabel={`CPU- und GPU-Auslastung sowie Temperaturen, ${rangeTitleSuffix[range]}`}
        panels={[
          {
            label: 'Auslastung',
            series: [
              { label: 'CPU', values: points.map((p) => p.cpu), color: 'violet' },
              { label: 'GPU', values: points.map((p) => p.gpu), color: 'cyan' },
            ],
            yMax: 100,
            yStep: 20,
            formatY: (v) => `${v} %`,
            formatValue: (v) => `${formatNumber(v, 1, 1)} %`,
            height: 120,
          },
          {
            label: 'Temperatur',
            series: [
              { label: 'CPU', values: tempCpu, color: 'violet' },
              { label: 'GPU', values: tempGpu, color: 'cyan' },
            ],
            yMax: tempScaleMax([...tempCpu, ...tempGpu]),
            yStep: 25,
            formatY: (v) => `${v} °C`,
            formatValue: (v) => `${formatNumber(v, 1, 1)} °C`,
            height: 90,
            area: 'none',
          },
        ]}
        ticks={data ? historyTicks(data.range, timestamps) : []}
        pointLabels={data ? historyPointLabels(data.range, data.stepSeconds, timestamps) : undefined}
        legend
        emptyText={emptyText}
      />
    </Card>
  );
}

export function OdinPage() {
  const { data } = usePolling(systemsService.getOdin, POLL_MS);

  const info: SystemInfo | null = data?.info ?? null;
  const metrics: SystemMetrics | null = data?.metrics ?? null;
  const state = data?.system.status.state ?? 'unknown';
  const stale = state !== 'online';

  const ramPct = metrics ? percentOf(metrics.memory.usedBytes, metrics.memory.totalBytes) : 0;
  const vram = metrics?.gpu;
  const vramPct = vram?.vramUsedBytes != null && vram.vramTotalBytes ? percentOf(vram.vramUsedBytes, vram.vramTotalBytes) : 0;

  const usage = [
    {
      icon: Cpu,
      label: 'CPU-Auslastung',
      value: metrics?.cpu.usagePercent != null ? formatPercent(metrics.cpu.usagePercent) : DASH,
      percent: metrics?.cpu.usagePercent ?? 0,
    },
    {
      icon: MemoryStick,
      label: 'RAM-Auslastung',
      value: metrics ? `${formatGib(metrics.memory.usedBytes)} / ${formatInstalledMemory(metrics.memory.totalBytes)}` : DASH,
      percent: ramPct,
    },
    {
      icon: Gpu,
      label: 'GPU-Auslastung',
      value: vram?.usagePercent != null ? formatPercent(vram.usagePercent) : DASH,
      percent: vram?.usagePercent ?? 0,
    },
    {
      icon: Layers,
      label: 'VRAM-Auslastung',
      value:
        vram?.vramUsedBytes != null && vram.vramTotalBytes
          ? `${formatGib(vram.vramUsedBytes)} / ${formatNumber(vram.vramTotalBytes / 1024 ** 3)} GB`
          : DASH,
      percent: vramPct,
    },
  ];

  const name = data?.system.name ?? 'Odin';

  return (
    <Page breadcrumb={[{ label: 'Systeme', to: '/systeme/odin' }, { label: name }]} className="system-page">
      <div className="page-header">
        <IconTile>
          <Server size={34} strokeWidth={1.6} />
        </IconTile>
        <div>
          <h1>{name}</h1>
          <p>
            {data?.system.description ?? 'KI-Server'}
            {info && ` · ${info.os.name}`}
          </p>
        </div>
      </div>

      <Card className="hero-card">
        <div className="hero-card__image">
          <DevicePhoto name="odin" alt={`Server ${name}`} fallback={<ServerTower />} />
        </div>
        <div className="hero-card__content">
          <div className="hero-card__title">
            <h2>{name}</h2>
            <OnlinePill status={state} />
          </div>
          {data && <StatusLine data={data} />}
          <div className={['spec-strip', stale && 'is-stale'].filter(Boolean).join(' ')}>
            <Stat
              icon={<Cpu size={30} strokeWidth={1.5} />}
              label="CPU"
              value={info ? shortCpuModel(info.cpu.model) : DASH}
              detail={info ? coresText(info.cpu) : undefined}
            />
            <Stat
              icon={<MemoryStick size={30} strokeWidth={1.5} />}
              label="RAM"
              value={info ? formatInstalledMemory(info.memory.totalBytes) : DASH}
              detail={info?.memory.type ?? undefined}
            />
            <Stat
              icon={<Gpu size={30} strokeWidth={1.5} />}
              label="GPU"
              value={info?.gpu?.model ?? (info?.gpu ? 'AMD-GPU' : DASH)}
              detail={info?.gpu?.vramTotalBytes ? `${formatNumber(info.gpu.vramTotalBytes / 1024 ** 3)} GB VRAM` : undefined}
            />
            <Stat
              icon={<Terminal size={28} strokeWidth={1.5} />}
              label="Betriebssystem"
              value={info?.os.name ?? DASH}
              detail={info ? `Kernel ${info.os.kernel}` : undefined}
            />
            <Stat
              icon={<Clock size={30} strokeWidth={1.5} />}
              label="Uptime"
              value={metrics && !stale ? formatUptime(metrics.uptimeSeconds) : DASH}
            />
          </div>
        </div>
      </Card>

      <div className={['usage-grid', stale && 'is-stale'].filter(Boolean).join(' ')}>
        {usage.map((u) => (
          <Card key={u.label} className="usage-card">
            <div className="usage-card__head">
              <u.icon size={32} strokeWidth={1.5} className="accent-icon" />
              <div>
                <span className="usage-card__label">{u.label}</span>
                <span className="usage-card__value">{u.value}</span>
              </div>
            </div>
            <div className="usage-card__bar">
              <ProgressBar value={u.percent} tone="violet" label={u.label} />
              <span>{u.value === DASH ? DASH : formatPercent(u.percent)}</span>
            </div>
          </Card>
        ))}
      </div>

      <UsageHistoryCard />

      {/* Reihenfolge gemäß Vorgabe: Datenträger, Netzlaufwerk (NAS), Netzwerk, Temperaturen */}
      <div className={['detail-grid', stale && 'is-stale'].filter(Boolean).join(' ')}>
        <Card title="Datenträger" icon={<HardDrive size={26} />} divider className="detail-card">
          {metrics?.disks.length ? (
            <ul className="disk-list">
              {metrics.disks.map((d) => {
                const pct = percentOf(d.usedBytes, d.totalBytes);
                return (
                  <li key={d.mount}>
                    <span className="disk-list__name">{d.label}</span>
                    <div className="disk-list__usage">
                      <span>
                        {formatBytes(d.usedBytes)} / {formatBytes(d.totalBytes)}
                      </span>
                      <ProgressBar value={pct} tone="violet" size="sm" label={d.label} />
                    </div>
                    <span className="disk-list__pct">{formatPercent(pct)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="widget-note">{metrics ? 'Keine Datenträger konfiguriert.' : DASH}</p>
          )}
        </Card>

        <Card title="Netzlaufwerk (NAS)" icon={<Database size={26} />} divider className="detail-card">
          {!metrics && <p className="widget-note">{DASH}</p>}
          {metrics && metrics.networkShares.length === 0 && <p className="widget-note">Kein Netzlaufwerk eingerichtet.</p>}
          {metrics?.networkShares.map((s) => {
            const pct = s.totalBytes && s.usedBytes != null ? percentOf(s.usedBytes, s.totalBytes) : null;
            return (
              <div key={s.mount} className="share-block">
                <dl className="kv-list">
                  <div>
                    <dt>
                      <LinkIcon size={18} /> Mount
                    </dt>
                    <dd>{s.mount}</dd>
                  </div>
                  <div>
                    <dt>
                      <Server size={18} /> Quelle
                    </dt>
                    <dd>{s.source}</dd>
                  </div>
                  <div>
                    <dt>
                      <Activity size={18} /> Status
                    </dt>
                    <dd>{shareStateText[s.state ?? 'mounted']}</dd>
                  </div>
                  {(s.state ?? 'mounted') === 'mounted' && (
                    <div>
                      <dt>
                        <HardDrive size={18} /> Belegt
                      </dt>
                      <dd>
                        {s.totalBytes && s.usedBytes != null ? `${formatBytes(s.usedBytes)} / ${formatBytes(s.totalBytes)}` : 'nicht lesbar'}
                      </dd>
                    </div>
                  )}
                </dl>
                {pct !== null && (
                  <div className="usage-card__bar">
                    <ProgressBar value={pct} tone="violet" size="sm" label={`${s.mount} belegt`} />
                    <span>{formatPercent(pct)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Card title="Netzwerk" icon={<Network size={26} />} divider className="detail-card">
          {metrics?.network.length ? (
            <ul className="nic-list">
              {metrics.network.map((n, i) => {
                const Icon = i === 0 ? EthernetPort : ArrowLeftRight;
                return (
                  <li key={n.name}>
                    <Icon size={28} strokeWidth={1.5} />
                    <div>
                      <span>{n.label ? `${n.label} (${n.name})` : n.name}</span>
                      <span>{n.addresses.join(', ') || 'keine Adresse'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="widget-note">{DASH}</p>
          )}
        </Card>

        <Card title="Temperaturen" icon={<Thermometer size={26} />} divider className="detail-card">
          {metrics?.temperatures.length ? (
            <ul className="temp-list">
              {metrics.temperatures.map((t) => {
                const Icon = tempIcon[t.sensor];
                return (
                  <li key={`${t.sensor}-${t.label}`}>
                    <Icon size={24} strokeWidth={1.5} />
                    <span>{t.label}</span>
                    <span className="temp-list__value">{formatNumber(t.celsius)} °C</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="widget-note">{DASH}</p>
          )}
        </Card>
      </div>
    </Page>
  );
}
