import { useState } from 'react';
import { AlarmClock, CalendarDays, ChartColumn, Cpu, Database, Info, Layers, Link as LinkIcon, Monitor, Plug, Wifi, Zap } from 'lucide-react';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { IconTile, OnlinePill, RangeTabs, Stat, StatusDot, rangeTitleSuffix } from '../../components/ui/Primitives';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { ShellyPlugIllustration } from '../../components/illustrations/ShellyPlugIllustration';
import { DevicePhoto } from '../../components/illustrations/DevicePhoto';
import { dataService } from '../../services/dataService';
import { formatEuro, formatNumber } from '../../lib/format';
import { historyPointLabels, historyTicks } from '../../lib/historyTicks';
import type { ChartRange } from '../../types/models';

export function ShellyPlugPage() {
  const [range, setRange] = useState<ChartRange>('24h');
  const plug = dataService.getShellyPlug();
  const history = dataService.getShellyPowerHistory(range);

  const details = [
    { icon: Monitor, label: 'IP-Adresse', value: plug.ipAddress },
    {
      icon: LinkIcon,
      label: 'Verbindung',
      value: (
        <span className="inline-status">
          <StatusDot status={plug.status} /> {plug.connection}
        </span>
      ),
    },
    { icon: Wifi, label: 'WLAN-Signal', value: `${plug.wifiSignalDbm} dBm` },
    { icon: Cpu, label: 'Firmware', value: plug.firmware },
    { icon: AlarmClock, label: 'Messintervall', value: `${plug.measureIntervalS} s` },
    { icon: Layers, label: 'Host', value: plug.host },
  ];

  return (
    <Page breadcrumb={[{ label: 'Systeme', to: '/systeme/odin' }, { label: plug.name }]} className="system-page">
      <div className="page-header">
        <IconTile>
          <Plug size={32} strokeWidth={1.6} />
        </IconTile>
        <div>
          <h1>{plug.name}</h1>
          <p>{plug.description}</p>
        </div>
      </div>

      <Card className="hero-card hero-card--plug">
        <div className="hero-card__image">
          <DevicePhoto name="shelly-plug" alt={plug.deviceName} fallback={<ShellyPlugIllustration />} />
        </div>
        <div className="hero-card__content">
          <div className="hero-card__title">
            <h2>{plug.deviceName}</h2>
            <OnlinePill status={plug.status} />
          </div>
          <div className="spec-strip spec-strip--large">
            <Stat icon={<Zap size={30} strokeWidth={1.5} />} label="Aktuelle Leistung" value={`${formatNumber(plug.currentPowerW, 1, 1)} W`} />
            <Stat icon={<Layers size={30} strokeWidth={1.5} />} label="Verbrauch heute" value={`${formatNumber(plug.energyTodayKwh, 2, 2)} kWh`} />
            <Stat
              icon={<CalendarDays size={30} strokeWidth={1.5} />}
              label="Verbrauch Monat"
              value={`${formatNumber(plug.energyMonthKwh, 1, 1)} kWh`}
            />
            <Stat icon={<Database size={30} strokeWidth={1.5} />} label="Kosten heute" value={formatEuro(plug.costTodayEur)} />
            <Stat icon={<CalendarDays size={30} strokeWidth={1.5} />} label="Kosten Monat" value={formatEuro(plug.costMonthEur)} />
          </div>
        </div>
      </Card>

      <Card
        title={`Verbrauch (${rangeTitleSuffix[range]})`}
        icon={<ChartColumn size={28} />}
        actions={<RangeTabs value={range} onChange={setRange} />}
        className="chart-card"
      >
        <TimeSeriesChart
          ariaLabel={`Leistungsaufnahme, ${rangeTitleSuffix[range]}`}
          series={[{ label: 'Leistung', values: history.values, color: 'violet' }]}
          ticks={historyTicks(history.range, history.timestamps)}
          pointLabels={historyPointLabels(history.range, history.stepSeconds, history.timestamps)}
          yMax={125}
          yStep={25}
          formatY={(v) => `${v} W`}
          formatValue={(v) => `${formatNumber(v, 1, 1)} W`}
          area="strong"
          endLabel={`${formatNumber(history.values[history.values.length - 1], 1, 1)} W`}
          height={145}
        />
      </Card>

      <Card title="Gerätedetails & Verbindung" icon={<Info size={28} />} divider>
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
