import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, ExternalLink, Info, KeyRound, LogOut, RefreshCw } from 'lucide-react';
import { PASSWORD_MIN_LENGTH, type ComponentUpdate, type ManualUpdateCheckResponse, type UpdateCheckResult, type UpdateStatusResponse } from '@mira/shared';
import { Page } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { Button, Pill } from '../../components/ui/Primitives';
import { useNotifications } from '../../components/layout/Notifications';
import { notificationsService, updateCheckErrorText } from '../../services/notificationsService';
import { usePolling } from '../../lib/usePolling';
import { formatDateTime } from '../../lib/format';
import { useAuth, useCurrentUser } from '../../auth/AuthContext';
import { ApiError } from '../../services/apiClient';
import { authService } from '../../services/authService';

const componentLabel: Record<ComponentUpdate['component'], string> = {
  mira: 'MIRA',
  agent: 'KI-Server (MIRA-Agent)',
};

function installedText(c: ComponentUpdate): string {
  if (!c.installed) return c.component === 'agent' ? 'unbekannt – KI-Server noch nicht erreicht' : 'unbekannt (Entwicklungsversion)';
  return c.installedAtMost ? `${c.installed} oder älter` : c.installed;
}

function UpdatePill({ c }: { c: ComponentUpdate }) {
  if (c.updateAvailable) return <Pill tone="violet">Update verfügbar</Pill>;
  if (c.installed && c.latest) return <Pill tone="success">Aktuell</Pill>;
  return <Pill tone="neutral">Unbekannt</Pill>;
}

/** „heute, 04:00 Uhr“, „gestern, 18:12 Uhr“ oder Datum mit Uhrzeit. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
  const day = (offset: number) => {
    const x = new Date();
    x.setDate(x.getDate() - offset);
    return x.toDateString();
  };
  if (d.toDateString() === day(0)) return `heute, ${time}`;
  if (d.toDateString() === day(1)) return `gestern, ${time}`;
  return `${formatDateTime(iso)} Uhr`;
}

function LastCheck({ check, checking }: { check: UpdateCheckResult | null; checking: boolean }) {
  if (checking) return <dd>wird gerade geprüft …</dd>;
  if (!check) return <dd>noch nie</dd>;
  const how = check.trigger === 'manual' ? 'von Hand' : 'automatisch';
  return (
    <dd>
      {formatWhen(check.at)} ({how})
      {!check.ok && check.error && <span className="update-list__error">{updateCheckErrorText[check.error]}</span>}
    </dd>
  );
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
}

type CheckMessage = { tone: 'ok' | 'update' | 'error' | 'info'; text: string };

/** Verständliches Ergebnis einer Prüfung von Hand. */
function describeCheck({ performed, status }: ManualUpdateCheckResponse): CheckMessage {
  if (!performed) {
    return status.nextManualCheckAt
      ? { tone: 'info', text: `Es wurde gerade erst geprüft – erneut prüfen ab ${clockTime(status.nextManualCheckAt)} möglich.` }
      : { tone: 'info', text: 'Die Update-Prüfung ist abgeschaltet.' };
  }
  const check = status.lastCheck;
  if (check && !check.ok) return { tone: 'error', text: check.error ? updateCheckErrorText[check.error] : 'Prüfung fehlgeschlagen' };
  const updates = status.components.filter((c) => c.updateAvailable);
  if (updates.length > 0) {
    return { tone: 'update', text: `Neue Version gefunden: ${updates.map((c) => `${componentLabel[c.component]} ${c.latest}`).join(', ')}` };
  }
  const current = status.components.filter((c) => c.installed && c.latest).map((c) => `${componentLabel[c.component]} ${c.installed}`);
  return { tone: 'ok', text: current.length ? `Alles aktuell – ${current.join(', ')}` : 'Geprüft – keine neuere Version gefunden' };
}

/** Knopf „Jetzt prüfen“: höchstens einmal je Stunde, zeigt das Ergebnis sofort an. */
function CheckNow({ status, onChecked }: { status: UpdateStatusResponse; onChecked: (status: UpdateStatusResponse) => void }) {
  const { refresh: refreshBell } = useNotifications();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<CheckMessage | null>(null);
  const lockedUntil = status.nextManualCheckAt && new Date(status.nextManualCheckAt).getTime() > Date.now() ? status.nextManualCheckAt : null;

  const check = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await notificationsService.checkNow();
      onChecked(res.status);
      setMessage(describeCheck(res));
      refreshBell();
    } catch {
      setMessage({ tone: 'error', text: 'MIRA ist nicht erreichbar – bitte später erneut versuchen.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={['update-check', checking && 'update-check--busy'].filter(Boolean).join(' ')}>
      <Button
        variant="outline"
        className="button--sm"
        icon={<RefreshCw size={18} className={checking ? 'spin' : undefined} />}
        onClick={() => void check()}
        disabled={!status.enabled || checking || lockedUntil !== null}
      >
        {checking ? 'Prüfe …' : 'Jetzt prüfen'}
      </Button>
      <div className="update-check__text" aria-live="polite">
        {message && <span className={`update-check__message update-check__message--${message.tone}`}>{message.text}</span>}
        {lockedUntil && !checking && <span className="update-check__lock">Erneut prüfen ab {clockTime(lockedUntil)} möglich</span>}
      </div>
    </div>
  );
}

function UpdatesCard({ status, checking, onChecked }: { status: UpdateStatusResponse | null; checking: boolean; onChecked: (status: UpdateStatusResponse) => void }) {
  return (
    <Card className="config-widget" icon={<Download size={28} />} title="Updates" subtitle="Neue Versionen von MIRA und des Agents auf dem KI-Server (GitHub)" divider>
      {!status ? (
        <p className="widget-note">Wird geladen …</p>
      ) : (
        <>
          <ul className="update-list">
            {status.components.map((c) => (
              <li key={c.component} className="update-list__item">
                <div className="update-list__head">
                  <strong>{componentLabel[c.component]}</strong>
                  <UpdatePill c={c} />
                </div>
                <dl className="connection-list">
                  <div>
                    <dt>Installiert</dt>
                    <dd>{installedText(c)}</dd>
                  </div>
                  <div>
                    <dt>Neueste Version</dt>
                    <dd>{c.latest ?? (status.release ? 'nicht im Release enthalten' : 'noch nicht geprüft')}</dd>
                  </div>
                </dl>
                {c.updateAvailable && (
                  <p className="update-list__hint">
                    {c.component === 'mira'
                      ? 'Update in Portainer: Stack „mira“ → „Update the stack“ mit „Re-pull image“.'
                      : 'Update auf dem KI-Server: Paket laden, Prüfsumme prüfen, sudo ./install.sh – Konfiguration, Zertifikat und Token bleiben erhalten.'}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <dl className="connection-list update-list__meta">
            <div>
              <dt>Zuletzt geprüft</dt>
              <LastCheck check={status.lastCheck} checking={checking} />
            </div>
            {status.release && (
              <div>
                <dt>Neuestes Release</dt>
                <dd>
                  <a href={status.release.url} target="_blank" rel="noopener noreferrer" className="text-link">
                    {status.release.tag} – Release-Notes
                    <ExternalLink size={14} />
                  </a>
                </dd>
              </div>
            )}
          </dl>

          <CheckNow status={status} onChecked={onChecked} />

          {!status.enabled && (
            <p className="config-widget__note">
              <Info size={20} strokeWidth={1.6} />
              Die Update-Prüfung ist abgeschaltet (MIRA_UPDATE_CHECK=false) – MIRA baut keine Verbindung zu GitHub auf.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function passwordError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_credentials') return err.message;
    if (err.code === 'rate_limited') {
      const minutes = Math.max(1, Math.ceil(Number(err.details?.retryAfterSeconds ?? 0) / 60));
      return `Zu viele Fehlversuche. Bitte in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} erneut versuchen.`;
    }
    if (err.code === 'validation_error') {
      const issues = (err.details?.issues as { message: string }[] | undefined) ?? [];
      return issues[0]?.message ?? 'Bitte die Eingaben prüfen.';
    }
    if (err.code === 'network_error') return 'MIRA ist nicht erreichbar.';
  }
  return 'Das Passwort konnte nicht geändert werden.';
}

/** Konto: Passwort ändern und alle Sitzungen beenden – beides erfordert danach eine neue Anmeldung. */
function AccountCard() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<CheckMessage | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current || !next) return setMessage({ tone: 'error', text: 'Bitte aktuelles und neues Passwort eingeben.' });
    if (next.length < PASSWORD_MIN_LENGTH) return setMessage({ tone: 'error', text: `Das neue Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.` });
    if (next !== repeat) return setMessage({ tone: 'error', text: 'Die Wiederholung stimmt nicht mit dem neuen Passwort überein.' });
    setBusy(true);
    setMessage(null);
    try {
      await authService.changePassword({ currentPassword: current, newPassword: next });
      // Alle Sitzungen sind beendet – zurück zur Anmeldung
      await logout();
    } catch (err) {
      setMessage({ tone: 'error', text: passwordError(err) });
      setCurrent('');
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm('Alle Sitzungen beenden? Du wirst auf allen Geräten abgemeldet – auch hier.')) return;
    setBusy(true);
    try {
      await authService.revokeAllSessions();
      await logout();
    } catch {
      setMessage({ tone: 'error', text: 'Die Sitzungen konnten nicht beendet werden.' });
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label>
      <span className="form-label">{label}</span>
      <span className="field field--compact">
        <input className="field__input" type="password" autoComplete={autoComplete} value={value} onChange={(e) => set(e.target.value)} disabled={busy} required />
      </span>
    </label>
  );

  return (
    <Card className="config-widget" icon={<KeyRound size={28} />} title="Konto" subtitle={`Angemeldet als ${user.displayName} (${user.username})`} divider>
      <form className="account-form" onSubmit={(e) => void onSubmit(e)}>
        <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
        {field('Aktuelles Passwort', current, setCurrent, 'current-password')}
        {field(`Neues Passwort (mind. ${PASSWORD_MIN_LENGTH} Zeichen)`, next, setNext, 'new-password')}
        {field('Neues Passwort wiederholen', repeat, setRepeat, 'new-password')}
        <div className="account-form__actions">
          <Button type="submit" className="button--sm" icon={<KeyRound size={18} />} disabled={busy}>
            Passwort ändern
          </Button>
          <Button variant="outline" className="button--sm" icon={<LogOut size={18} />} onClick={() => void revokeAll()} disabled={busy}>
            Alle Sitzungen beenden
          </Button>
        </div>
        <div aria-live="polite">{message && <span className={`update-check__message update-check__message--${message.tone}`}>{message.text}</span>}</div>
      </form>
      <p className="config-widget__note">
        <Info size={20} strokeWidth={1.6} />
        Nach der Änderung sind alle Sitzungen beendet – auch auf anderen Geräten. Das Startpasswort aus der Secret-Datei wird nicht mehr verwendet.
      </p>
    </Card>
  );
}

/** Konfiguration › MIRA – Updates und Konto. */
export function ConfigMiraPage() {
  const { data: polled, refresh } = usePolling(notificationsService.getUpdateStatus, 60_000);
  // Ergebnis einer Prüfung von Hand sofort anzeigen – bis zur nächsten regulären Abfrage
  const [checked, setChecked] = useState<UpdateStatusResponse | null>(null);
  useEffect(() => setChecked(null), [polled]);
  const status = checked ?? polled;

  // Die Glocke stößt beim ersten Aufruf am Tag die Prüfung an – startet oder endet sie, hier nachladen
  const bellChecking = useNotifications().data?.checking ?? false;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    refresh();
  }, [bellChecking]); // `refresh` ist bei jedem Rendern neu

  // Läuft gerade eine Prüfung (z. B. die des ersten Aufrufs), das Ergebnis gleich nachladen
  useEffect(() => {
    if (!status?.checking) return undefined;
    const timer = window.setTimeout(refresh, 2000);
    return () => window.clearTimeout(timer);
  }, [status]); // `refresh` ist bei jedem Rendern neu

  // Nach Ablauf der Sperrfrist den Knopf ohne Neuladen der Seite wieder freigeben
  const lockedUntil = status?.nextManualCheckAt ? new Date(status.nextManualCheckAt).getTime() : null;
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const timer = window.setTimeout(refresh, Math.max(0, lockedUntil - Date.now()) + 1000);
    return () => window.clearTimeout(timer);
  }, [lockedUntil]); // `refresh` ist bei jedem Rendern neu – nur bei geänderter Sperrfrist neu planen

  return (
    <Page breadcrumb={[{ label: 'Konfiguration', to: '/konfiguration' }, { label: 'MIRA' }]} className="config-page">
      <div className="config-systems">
        <UpdatesCard status={status} checking={bellChecking || (status?.checking ?? false)} onChecked={setChecked} />
        <AccountCard />
      </div>
    </Page>
  );
}
