import { Info, Settings } from 'lucide-react';
import { Navigate, useParams } from 'react-router';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { CenteredMessage } from '../../components/ui/Primitives';
import { configSections } from '../../components/layout/navigation';

/** Konfiguration – Übersicht mit Hinweis zur Bereichsauswahl. */
export function ConfigOverviewPage() {
  return (
    <Page
      title="Konfiguration"
      subtitle="Einstellungen und Optionen für die einzelnen MIRA-Bereiche."
      icon={<Settings size={44} strokeWidth={1.6} />}
      className="config-page"
    >
      <Card className="config-card">
        <CenteredMessage
          icon={<Settings size={88} strokeWidth={1.4} />}
          title="MIRA konfigurieren"
          text="Verwalte hier die Einstellungen für Dashboard, Systeme, Agents, LLM und MIRA."
        >
          <hr className="config-card__rule" />
          <div className="info-box">
            <Info size={30} strokeWidth={1.5} />
            <span>Wähle links im Menü einen Bereich, den du konfigurieren möchtest.</span>
          </div>
        </CenteredMessage>
      </Card>
    </Page>
  );
}

/** Konfiguration – einheitlicher Platzhalter je Bereich (Formulare folgen später). */
export function ConfigSectionPage() {
  const { section } = useParams();
  const entry = configSections.find((s) => s.slug === section);
  if (!entry) return <Navigate to="/konfiguration" replace />;
  const Icon = entry.icon;

  return (
    <Page breadcrumb={[{ label: 'Konfiguration', to: '/konfiguration' }, { label: entry.label }]} className="config-page">
      <Card className="config-card">
        <CenteredMessage
          icon={<Icon size={80} strokeWidth={1.4} />}
          title={`${entry.label} konfigurieren`}
          text={`Hier werden künftig die Einstellungen für den Bereich „${entry.label}“ verwaltet.`}
        >
          <hr className="config-card__rule" />
          <div className="info-box">
            <Info size={30} strokeWidth={1.5} />
            <span>Die Einstellungsformulare für diesen Bereich werden in einer späteren Phase festgelegt.</span>
          </div>
        </CenteredMessage>
      </Card>
    </Page>
  );
}
