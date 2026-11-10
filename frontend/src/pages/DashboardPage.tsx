import { Link } from 'react-router';
import { Bot, Box, Cpu, Gauge, Gpu, Layers, MemoryStick, Moon, Power, RotateCw, Server, SquareArrowOutUpRight, Zap } from 'lucide-react';
import { Page } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { IconButton, OnlinePill, Pill, ProgressBar, StatusDot, type BarTone } from '../components/ui/Primitives';
import { Sparkline } from '../components/charts/Sparkline';
import { ServerTower } from '../components/illustrations/ServerTower';
import { DevicePhoto } from '../components/illustrations/DevicePhoto';
import { useNotice } from '../components/ui/Notice';
import { useCurrentUser } from '../auth/AuthContext';
import { useAiServerName } from '../components/layout/Systems';
import { dataService } from '../services/dataService';
import { formatNumber, formatPercent, percentOf } from '../lib/format';
import type { ContainerState } from '../types/models';
import { features } from '../lib/features';

const containerStateLabel: Record<ContainerState, string> = {
  healthy: 'Healthy',
  running: 'Running',
  stopped: 'Stopped',
};

export function DashboardPage() {
  const { notAvailable } = useNotice();
  const user = useCurrentUser();
  const server = dataService.getAiServer();
  const serverName = useAiServerName();
  const util = dataService.getAiServerUtilization();
  const shelly = dataService.getShellyPlug();
  const powerSeries = dataService.getShellyPowerHistory('24h').values;
  const containers = dataService.getDockerContainers();
  const agents = dataService.getAgents();
  const llms = dataService.getLlmModels().filter((m) => m.availableInOpenWebUi);
  const hw = server.hardware;

  const ramPct = percentOf(util.ramUsedGb, hw.ramTotalGb);
  const vramPct = percentOf(util.vramUsedGb, hw.vramTotalGb);
  const coreCount = Number.parseInt(hw.cpuCores, 10) || 1;

  const metrics: { icon: typeof Cpu; label: string; value: string; detail?: string; percent: number; tone: BarTone }[] = [
    { icon: Cpu, label: 'CPU', value: formatPercent(util.cpuPercent), percent: util.cpuPercent, tone: 'green' },
    {
      icon: MemoryStick,
      label: 'RAM',
      value: `${formatNumber(util.ramUsedGb, 1, 1)} / ${hw.ramTotalGb} GB`,
      detail: `(${formatPercent(ramPct)})`,
      percent: ramPct,
      tone: 'cyan',
    },
    {
      icon: Gpu,
      label: 'GPU (VRAM)',
      value: `${formatNumber(util.vramUsedGb, 1, 1)} / ${hw.vramTotalGb} GB`,
      detail: `(${formatPercent(vramPct)})`,
      percent: vramPct,
      tone: 'magenta',
    },
    {
      icon: Gauge,
      label: 'Systemlast',
      value: formatNumber(util.systemLoad, 2, 2),
      percent: (util.systemLoad / coreCount) * 100,
      tone: 'green',
    },
  ];

  return (
    <Page title="Dashboard" className="dashboard">
      <div className="greeting">
        <h1>Hallo {user.displayName},</h1>
        <p>Dein KI-Server ist online und einsatzbereit.</p>
      </div>

      <Card title="Systemübersicht" icon={<Server size={28} />} divider className="overview">
        <div className="overview__top">
          <Link to="/systeme/ki-server" className="overview__image" aria-label={`${serverName} öffnen`}>
            <DevicePhoto name="ki-server" alt={serverName} fallback={<ServerTower label={serverName} />} />
          </Link>
          <div className="overview__server">
            <div className="overview__name">
              <h3>{serverName}</h3>
              <OnlinePill status={server.status} />
            </div>
            <p className="overview__os">
              {server.os} (Kernel {server.kernel.replace(/-generic$/, '')})
            </p>
            <ul className="spec-list">
              <li>
                <Cpu size={20} strokeWidth={1.6} /> {hw.cpuModel}
              </li>
              <li>
                <MemoryStick size={20} strokeWidth={1.6} /> {hw.ramTotalGb} GB RAM
              </li>
              <li>
                <Gpu size={20} strokeWidth={1.6} /> {hw.gpuModel}
              </li>
            </ul>
          </div>
          <div className="overview__power">
            <span className="overview__power-label">
              <Zap size={22} className="accent-icon" /> Verbrauch (Gesamt)
            </span>
            <div className="overview__power-row">
              <span className="overview__power-value">{formatNumber(shelly.currentPowerW, 1, 1)} W</span>
              <Sparkline values={powerSeries.slice(-48)} min={0} max={110} className="overview__sparkline" />
            </div>
          </div>
        </div>

        <div className="overview__metrics">
          {metrics.map((m) => (
            <div key={m.label} className="metric">
              <div className="metric__head">
                <m.icon size={28} strokeWidth={1.6} className={m.tone === 'magenta' ? 'accent-icon' : 'metric__icon'} />
                <div>
                  <span className="metric__label">{m.label}</span>
                  <span className="metric__value">{m.value}</span>
                  {m.detail && <span className="metric__detail">{m.detail}</span>}
                </div>
              </div>
              <ProgressBar value={m.percent} tone={m.tone} size="lg" tintedTrack label={m.label} />
            </div>
          ))}
        </div>
      </Card>

      <div className="dashboard__grid">
        <Card title="Dienste (Docker)" icon={<Box size={28} />} divider>
          <ul className="row-list">
            {containers.map((c) => (
              <li key={c.name} className="container-row">
                <StatusDot status={c.state === 'stopped' ? 'offline' : 'online'} />
                <span className="container-row__name">{c.name}</span>
                <Pill tone="success">{containerStateLabel[c.state]}</Pill>
                <span className="container-row__uptime">{c.uptime}</span>
              </li>
            ))}
          </ul>
        </Card>

        {features.agents && (
          <Card title="Agents" icon={<Bot size={28} />} divider>
            {agents.length > 0 ? (
              <ul className="row-list">
                {agents.map((a) => (
                  <li key={a.id} className="agent-row">
                    <StatusDot status={a.status} />
                    <div>
                      <strong>{a.name}</strong>
                      <span>{a.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="widget-empty">
                <p>Noch keine Agenten eingerichtet.</p>
                <Link to="/agents" className="text-link">
                  Zur Agentenübersicht →
                </Link>
              </div>
            )}
          </Card>
        )}

        <Card title="Schnellaktionen" icon={<Zap size={30} />}>
          <div className="quick-actions">
            <button type="button" className="quick-action quick-action--highlight" onClick={() => notAvailable(`${serverName} schlafen legen`)}>
              <Moon size={30} className="accent-icon" fill="currentColor" />
              <span>
                {serverName}
                <br />
                schlafen legen
              </span>
            </button>
            <button type="button" className="quick-action" onClick={() => notAvailable('Dienste neu starten')}>
              <Power size={28} />
              <span>
                Dienste
                <br />
                neu starten
              </span>
            </button>
            <button type="button" className="quick-action" onClick={() => notAvailable(`${serverName} neustarten`)}>
              <RotateCw size={28} />
              <span>
                {serverName}
                <br />
                neustarten
              </span>
            </button>
          </div>
        </Card>

        <Card
          title="Verfügbare LLMs"
          className={features.agents ? undefined : 'dashboard__wide'}
          subtitle="In Open WebUI verfügbar"
          icon={<Layers size={34} />}
          actions={
            <IconButton label="Open WebUI öffnen" tone="ghost" onClick={() => notAvailable('Open WebUI öffnen')}>
              <SquareArrowOutUpRight size={26} className="accent-icon" />
            </IconButton>
          }
        >
          <div className="llm-chips">
            {llms.map((m) => (
              <Link key={m.id} to="/llm" className="llm-chip">
                <Box size={22} strokeWidth={1.7} className="accent-icon" />
                <span>{m.displayName}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
