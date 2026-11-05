import { useState } from 'react';
import {
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
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { IconTile, OnlinePill, ProgressBar, RangeTabs, Stat, rangeTitleSuffix } from '../../components/ui/Primitives';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { ServerTower } from '../../components/illustrations/ServerTower';
import { DevicePhoto } from '../../components/illustrations/DevicePhoto';
import { dataService } from '../../services/dataService';
import { formatNumber, formatPercent, formatStorageGb, percentOf } from '../../lib/format';
import type { ChartRange, Temperature } from '../../types/models';

const tempIcon: Record<Temperature['sensor'], typeof Cpu> = { cpu: Cpu, gpu: Gpu, nvme: HardDrive };

export function OdinPage() {
  const [range, setRange] = useState<ChartRange>('24h');
  const odin = dataService.getOdin();
  const util = dataService.getOdinUtilization();
  const history = dataService.getOdinUsageHistory(range);
  const disks = dataService.getOdinDisks();
  const nas = dataService.getOdinNetworkShare();
  const nics = dataService.getOdinNetworkInterfaces();
  const temps = dataService.getOdinTemperatures();
  const hw = odin.hardware;

  const ramPct = percentOf(util.ramUsedGb, hw.ramTotalGb);
  const vramPct = percentOf(util.vramUsedGb, hw.vramTotalGb);
  const nasPct = percentOf(nas.usedTb, nas.totalTb);

  const usage = [
    { icon: Cpu, label: 'CPU-Auslastung', value: formatPercent(util.cpuPercent), percent: util.cpuPercent },
    {
      icon: MemoryStick,
      label: 'RAM-Auslastung',
      value: `${formatNumber(util.ramUsedGb, 1, 1)} / ${hw.ramTotalGb} GB`,
      percent: ramPct,
    },
    { icon: Gpu, label: 'GPU-Auslastung', value: formatPercent(util.gpuPercent), percent: util.gpuPercent },
    {
      icon: Layers,
      label: 'VRAM-Auslastung',
      value: `${formatNumber(util.vramUsedGb, 1, 1)} / ${hw.vramTotalGb} GB`,
      percent: vramPct,
    },
  ];

  return (
    <Page breadcrumb={[{ label: 'Systeme', to: '/systeme/odin' }, { label: odin.name }]} className="system-page">
      <div className="page-header">
        <IconTile>
          <Server size={34} strokeWidth={1.6} />
        </IconTile>
        <div>
          <h1>{odin.name}</h1>
          <p>
            {odin.role} · {odin.os}
          </p>
        </div>
      </div>

      <Card className="hero-card">
        <div className="hero-card__image">
          <DevicePhoto name="odin" alt={`Server ${odin.name}`} fallback={<ServerTower />} />
        </div>
        <div className="hero-card__content">
          <div className="hero-card__title">
            <h2>{odin.name}</h2>
            <OnlinePill status={odin.status} />
          </div>
          <div className="spec-strip">
            <Stat icon={<Cpu size={30} strokeWidth={1.5} />} label="CPU" value={hw.cpuModel} detail={hw.cpuCores} />
            <Stat icon={<MemoryStick size={30} strokeWidth={1.5} />} label="RAM" value={`${hw.ramTotalGb} GB`} detail={hw.ramType} />
            <Stat icon={<Gpu size={30} strokeWidth={1.5} />} label="GPU" value={hw.gpuModel} detail={`${hw.vramTotalGb} GB VRAM`} />
            <Stat
              icon={<Terminal size={28} strokeWidth={1.5} />}
              label="Betriebssystem"
              value={odin.os}
              detail={`Kernel ${odin.kernel}`}
            />
            <Stat icon={<Clock size={30} strokeWidth={1.5} />} label="Uptime" value={odin.uptime} />
          </div>
        </div>
      </Card>

      <div className="usage-grid">
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
              <span>{formatPercent(u.percent)}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card
        title={`Auslastung (${rangeTitleSuffix[range]})`}
        icon={<ChartColumn size={28} />}
        actions={<RangeTabs value={range} onChange={setRange} />}
        className="chart-card"
      >
        <TimeSeriesChart
          ariaLabel={`CPU- und GPU-Auslastung, ${rangeTitleSuffix[range]}`}
          series={[
            { label: 'CPU', values: history.cpu.values, color: 'violet' },
            { label: 'GPU', values: history.gpu.values, color: 'cyan' },
          ]}
          ticks={history.cpu.ticks}
          yMax={100}
          yStep={20}
          formatY={(v) => `${v} %`}
          height={150}
          legend
        />
      </Card>

      {/* Reihenfolge gemäß Vorgabe: Datenträger, Netzlaufwerk (NAS), Netzwerk, Temperaturen */}
      <div className="detail-grid">
        <Card title="Datenträger" icon={<HardDrive size={26} />} divider className="detail-card">
          <ul className="disk-list">
            {disks.map((d) => {
              const pct = percentOf(d.usedGb, d.totalGb);
              return (
                <li key={d.name}>
                  <span className="disk-list__name">{d.name}</span>
                  <div className="disk-list__usage">
                    <span>
                      {formatStorageGb(d.usedGb)} / {formatStorageGb(d.totalGb)}
                    </span>
                    <ProgressBar value={pct} tone="violet" size="sm" label={d.name} />
                  </div>
                  <span className="disk-list__pct">{formatPercent(pct)}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Netzlaufwerk (NAS)" icon={<Database size={26} />} divider className="detail-card">
          <dl className="kv-list">
            <div>
              <dt>
                <LinkIcon size={18} /> Mount
              </dt>
              <dd>{nas.mountPoint}</dd>
            </div>
            <div>
              <dt>
                <Server size={18} /> Quelle
              </dt>
              <dd>{nas.source}</dd>
            </div>
            <div>
              <dt>
                <HardDrive size={18} /> Belegt
              </dt>
              <dd>
                {formatNumber(nas.usedTb, 2, 2)} TB / {formatNumber(nas.totalTb, 2, 2)} TB
              </dd>
            </div>
          </dl>
          <div className="usage-card__bar">
            <ProgressBar value={nasPct} tone="violet" size="sm" label="NAS belegt" />
            <span>{formatPercent(nasPct)}</span>
          </div>
        </Card>

        <Card title="Netzwerk" icon={<Network size={26} />} divider className="detail-card">
          <ul className="nic-list">
            {nics.map((n) => {
              const Icon = n.kind === 'vlan' ? EthernetPort : ArrowLeftRight;
              return (
                <li key={n.device}>
                  <Icon size={28} strokeWidth={1.5} />
                  <div>
                    <span>
                      {n.name} ({n.device})
                    </span>
                    <span>{n.address}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Temperaturen" icon={<Thermometer size={26} />} divider className="detail-card">
          <ul className="temp-list">
            {temps.map((t) => {
              const Icon = tempIcon[t.sensor];
              return (
                <li key={t.sensor}>
                  <Icon size={24} strokeWidth={1.5} />
                  <span>{t.label}</span>
                  <span className="temp-list__value">{t.celsius} °C</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
