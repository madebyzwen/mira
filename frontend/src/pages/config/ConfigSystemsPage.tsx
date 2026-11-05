import { Info, Pencil, Plug, Server } from 'lucide-react';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { Button, OnlinePill } from '../../components/ui/Primitives';
import { useNotice } from '../../components/ui/Notice';
import { dataService } from '../../services/dataService';
import type { SystemEntry } from '../../types/models';

const kindIcon: Record<SystemEntry['kind'], typeof Server> = {
  server: Server,
  'power-meter': Plug,
};

/**
 * Konfiguration › Systeme – je System ein Widget.
 * Phase 1: Platzhalter. Die angedeuteten Formularzeilen zeigen nur, dass die
 * Einstellungen später direkt im Widget angezeigt und bearbeitet werden; die
 * konkreten Felder werden separat festgelegt.
 */
export function ConfigSystemsPage() {
  const { notAvailable } = useNotice();
  const systems = dataService.getSystems();

  return (
    <Page breadcrumb={[{ label: 'Konfiguration', to: '/konfiguration' }, { label: 'Systeme' }]} className="config-page">
      <div className="config-systems">
        {systems.map((system) => {
          const Icon = kindIcon[system.kind];
          return (
            <Card
              key={system.id}
              className="config-widget"
              icon={<Icon size={28} />}
              title={
                <>
                  {system.label} <OnlinePill status={system.status} />
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
                Die Einstellungen für {system.label} werden in einer späteren Phase festgelegt.
              </p>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
