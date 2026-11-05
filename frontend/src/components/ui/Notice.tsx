import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

interface NoticeContextValue {
  /** Zeigt eine kurze Meldung unten rechts an. */
  notify: (message: string) => void;
  /** Standardhinweis für Aktionen, die in Phase 1 noch nicht verfügbar sind. */
  notAvailable: (action: string) => void;
}

const NoticeContext = createContext<NoticeContextValue | null>(null);

interface NoticeItem {
  id: number;
  message: string;
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((n) => n.id !== id));
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const notify = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), 4200));
    },
    [dismiss],
  );

  const notAvailable = useCallback(
    (action: string) => notify(`„${action}“ ist in Phase 1 noch nicht verfügbar – es wurde keine Aktion ausgeführt.`),
    [notify],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <NoticeContext.Provider value={{ notify, notAvailable }}>
      {children}
      <div className="notice-stack" role="status" aria-live="polite">
        {items.map((n) => (
          <div key={n.id} className="notice">
            <Info size={18} className="notice__icon" aria-hidden />
            <span className="notice__text">{n.message}</span>
            <button type="button" className="notice__close" onClick={() => dismiss(n.id)} aria-label="Meldung schließen">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  );
}

export function useNotice(): NoticeContextValue {
  const ctx = useContext(NoticeContext);
  if (!ctx) throw new Error('useNotice muss innerhalb von <NoticeProvider> verwendet werden');
  return ctx;
}
