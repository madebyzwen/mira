import { useCallback, useEffect, useRef, useState } from 'react';
import { Poller, type PollState } from './poller';

interface PollingState<T> extends PollState<T> {
  refresh: () => void;
}

/**
 * Lädt Daten sofort und danach in festem Intervall neu (Logik: `Poller`).
 * Pausiert, solange der Browser-Tab im Hintergrund ist, und lädt beim
 * Zurückkehren sofort neu. Ändert sich `key` (z. B. der gewählte Zeitraum),
 * wird sofort neu geladen; Antworten für den vorigen Schlüssel werden verworfen.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, key?: string): PollingState<T> {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const dataRef = useRef<T | null>(null);
  dataRef.current = state.data;
  const pollerRef = useRef<Poller<T> | null>(null);

  useEffect(() => {
    const poller = new Poller<T>({
      fetcher: () => fetcherRef.current(),
      intervalMs,
      onChange: setState,
      // bisherige Daten bis zur ersten Antwort weiter zeigen, Fehler und Ladezustand zurücksetzen
      initialData: dataRef.current,
    });
    pollerRef.current = poller;
    setState(poller.current);
    poller.start();
    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [intervalMs, key]);

  const refresh = useCallback(() => pollerRef.current?.refresh(), []);
  return { ...state, refresh };
}
