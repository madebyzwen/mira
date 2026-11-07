import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bell, ExternalLink, X } from 'lucide-react';
import type { Notification, NotificationsResponse } from '@mira/shared';
import { notificationsService } from '../../services/notificationsService';
import { usePolling } from '../../lib/usePolling';
import { formatDateTime, formatRelative } from '../../lib/format';

/** Die Glocke fragt so oft nach neuen Benachrichtigungen (ohne Update-Prüfung). */
const POLL_MS = 60_000;

/**
 * Die erste Abfrage nach dem Laden der Seite trägt `refresh=true` – damit prüft das
 * Backend einmal am Tag beim Aufruf auf Updates. Alle weiteren Abfragen nicht.
 */
let visitReported = false;
function fetchNotifications(): Promise<NotificationsResponse> {
  const refresh = !visitReported;
  visitReported = true;
  return notificationsService.list(refresh);
}

interface NotificationsContextValue {
  data: NotificationsResponse | null;
  markRead: (ids: number[]) => void;
  dismiss: (id: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Gemeinsamer Zustand der Glocke – bleibt beim Seitenwechsel erhalten (liegt im AppLayout). */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { data, refresh } = usePolling(fetchNotifications, POLL_MS);
  const [local, setLocal] = useState<NotificationsResponse | null>(null);

  // Nach jeder Abfrage gilt wieder der Stand des Servers
  useEffect(() => setLocal(data), [data]);

  const markRead = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      setLocal((cur) =>
        cur && {
          notifications: cur.notifications.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
          unread: cur.notifications.filter((n) => !n.readAt && !ids.includes(n.id)).length,
        },
      );
      void notificationsService.markRead(ids).catch(refresh);
    },
    [refresh],
  );

  const dismiss = useCallback(
    (id: number) => {
      setLocal((cur) => {
        if (!cur) return cur;
        const notifications = cur.notifications.filter((n) => n.id !== id);
        return { notifications, unread: notifications.filter((n) => !n.readAt).length };
      });
      void notificationsService.dismiss(id).catch(refresh);
    },
    [refresh],
  );

  const value = useMemo(() => ({ data: local, markRead, dismiss }), [local, markRead, dismiss]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications muss innerhalb von <NotificationsProvider> verwendet werden');
  return ctx;
}

/** Glocke in der Kopfzeile mit Zähler ungelesener Benachrichtigungen. */
export function NotificationBell() {
  const { data, markRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  /** Beim Öffnen ungelesene Einträge – bleiben während des Öffnens als „neu“ markiert */
  const [freshIds, setFreshIds] = useState<number[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Öffnen markiert die angezeigten Einträge als gelesen
    const ids = (data?.notifications ?? []).filter((n) => !n.readAt).map((n) => n.id);
    setFreshIds(ids);
    markRead(ids);
    setOpen(true);
  };

  const label = unread > 0 ? `Benachrichtigungen, ${unread} ungelesen` : 'Benachrichtigungen';

  return (
    <div className="notifications" ref={ref}>
      <button type="button" className="notifications__trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label}>
        <Bell size={24} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="notifications__badge" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notifications__panel" role="dialog" aria-label="Benachrichtigungen">
          <div className="notifications__header">Benachrichtigungen</div>
          {!data || data.notifications.length === 0 ? (
            <p className="notifications__empty">Keine Benachrichtigungen</p>
          ) : (
            <ul className="notifications__list">
              {data.notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} fresh={freshIds.includes(n.id)} onDismiss={() => dismiss(n.id)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification: n, fresh, onDismiss }: { notification: Notification; fresh: boolean; onDismiss: () => void }) {
  return (
    <li className={['notification', fresh && 'notification--fresh', `notification--${n.level}`].filter(Boolean).join(' ')}>
      <div className="notification__head">
        <strong className="notification__title">{n.title}</strong>
        <button type="button" className="notification__dismiss" onClick={onDismiss} aria-label={`„${n.title}“ ausblenden`} title="Ausblenden">
          <X size={16} />
        </button>
      </div>
      <p className="notification__message">{n.message}</p>
      {n.links.length > 0 && (
        <div className="notification__links">
          {n.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-link">
              {l.label}
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      )}
      <time className="notification__time" dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
        {formatRelative(n.createdAt)}
      </time>
    </li>
  );
}
