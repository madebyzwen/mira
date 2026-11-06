import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refresh: () => void;
}

/**
 * Lädt Daten sofort und danach in festem Intervall neu.
 * Pausiert, solange der Browser-Tab im Hintergrund ist, und lädt beim
 * Zurückkehren sofort neu. Ändert sich `key` (z. B. der gewählte Zeitraum),
 * wird sofort neu geladen.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, key?: string): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, intervalMs, key]);

  return { data, error, loading, refresh: () => void load() };
}
