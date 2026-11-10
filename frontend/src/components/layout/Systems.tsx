import { createContext, useContext, type ReactNode } from 'react';
import { AI_SERVER_ROLE, AI_SERVER_SLUG, type SystemsListResponse } from '@mira/shared';
import { systemsService } from '../../services/systemsService';
import { usePolling } from '../../lib/usePolling';

const SYSTEMS_POLL_MS = 30000;

const SystemsContext = createContext<SystemsListResponse | null>(null);

/** Lädt die angebundenen Systeme (Name, Zustand) einmal für die ganze Oberfläche. */
export function SystemsProvider({ children }: { children: ReactNode }) {
  const { data } = usePolling(systemsService.listSystems, SYSTEMS_POLL_MS);
  return <SystemsContext.Provider value={data}>{children}</SystemsContext.Provider>;
}

/** Angebundene Systeme; `null`, solange noch nichts geladen ist. */
export function useSystems(): SystemsListResponse | null {
  return useContext(SystemsContext);
}

/**
 * Anzeigename des KI-Servers (`MIRA_AI_SERVER_NAME` im Backend).
 * Ohne konfigurierten Namen – oder solange er noch nicht geladen ist – „KI-Server“.
 */
export function useAiServerName(): string {
  return useSystems()?.systems.find((s) => s.slug === AI_SERVER_SLUG)?.name ?? AI_SERVER_ROLE;
}
