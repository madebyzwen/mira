import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Info } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar, type TopBarProps } from './TopBar';
import { Modal } from '../ui/Modal';
import { MiraLogo } from '../brand/MiraLogo';

const STORAGE_KEY = 'mira.sidebar.collapsed';
const MOBILE_QUERY = '(max-width: 900px)';

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Rahmen aller angemeldeten Seiten: Sidebar + Inhaltsbereich. */
export function AppLayout() {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { pathname } = useLocation();

  // Mobil: Overlay-Menü nach Navigation schließen
  useEffect(() => setMobileOpen(false), [pathname]);

  const effectiveCollapsed = isMobile ? !mobileOpen : collapsed;

  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, c ? '0' : '1');
      } catch {
        /* Speicher nicht verfügbar – Zustand bleibt nur für diese Sitzung */
      }
      return !c;
    });
  }, [isMobile]);

  const closeAbout = useCallback(() => setAboutOpen(false), []);

  return (
    <div
      className={[
        'app-shell',
        effectiveCollapsed && 'app-shell--collapsed',
        isMobile && 'app-shell--mobile',
        isMobile && mobileOpen && 'app-shell--overlay',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Sidebar collapsed={effectiveCollapsed} onToggle={toggle} onAbout={() => setAboutOpen(true)} />
      {isMobile && mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden />}
      <div className="app-main">
        <Outlet />
      </div>

      <Modal open={aboutOpen} onClose={closeAbout} title="Über MIRA" icon={<Info size={22} />}>
        <div className="about">
          <MiraLogo size={56} />
          <div>
            <p className="about__name">MIRA – Management, Infrastructure, Resources &amp; Automation</p>
            <p className="about__meta">Version 0.1.0 · Phase 1 (Weboberfläche mit Demo-Daten)</p>
          </div>
        </div>
        <p className="about__text">
          Selbst gehostete Weboberfläche zur Überwachung, Verwaltung und Automatisierung lokaler KI-Infrastruktur. In dieser
          Phase werden ausschließlich Beispieldaten angezeigt; es bestehen keine Verbindungen zu Odin, dem Shelly Plug oder
          anderen Diensten.
        </p>
      </Modal>
    </div>
  );
}

/** Kopfzeile + Inhaltsbereich einer Seite. */
export function Page({ children, className, ...topbar }: TopBarProps & { children: ReactNode; className?: string }) {
  return (
    <>
      <TopBar {...topbar} />
      <main className={['page', className].filter(Boolean).join(' ')}>{children}</main>
    </>
  );
}
