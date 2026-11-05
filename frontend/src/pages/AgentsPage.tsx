import { Box, Plus } from 'lucide-react';
import { Page } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button, CenteredMessage, StatusDot } from '../components/ui/Primitives';
import { useNotice } from '../components/ui/Notice';
import { dataService } from '../services/dataService';

/**
 * Agents – Phase 1: leere Agentenübersicht.
 * Es besteht keine Verbindung zu Hermes oder anderen Agenten.
 */
export function AgentsPage() {
  const { notAvailable } = useNotice();
  const agents = dataService.getAgents();

  return (
    <Page title="Agents" className="agents-page">
      <Card title="Weitere Agenten" icon={<Box size={30} />} divider className="fill-card">
        {agents.length === 0 ? (
          <CenteredMessage icon={<Box size={84} strokeWidth={1.4} />} title="Noch keine weiteren Agenten">
            <Button variant="outline" icon={<Plus size={26} />} onClick={() => notAvailable('Agent hinzufügen')}>
              Agent hinzufügen
            </Button>
          </CenteredMessage>
        ) : (
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
        )}
      </Card>
    </Page>
  );
}
