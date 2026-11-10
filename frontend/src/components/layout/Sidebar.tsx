import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { ChevronDown, Info, Menu } from 'lucide-react';
import { MiraLogo, MiraWordmark } from '../brand/MiraLogo';
import { StatusDot } from '../ui/Primitives';
import { GlowWave } from '../illustrations/GlowWaves';
import { getNavigation, type NavChild, type NavGroupItem } from './navigation';
import { useSystems } from './Systems';
import type { OnlineStatus } from '../../types/models';

/** Live-Angaben eines angebundenen Systems je Kennung (Slug) */
type LiveSystems = Record<string, { status: OnlineStatus; name: string }>;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onAbout: () => void;
}

function isWithin(pathname: string, basePath: string) {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function Sidebar({ collapsed, onToggle, onAbout }: SidebarProps) {
  const items = useMemo(() => getNavigation(), []);
  // Name und Zustand der angebundenen Systeme (seit Stufe 2: KI-Server); übrige Einträge behalten ihre Demo-Werte
  const systems = useSystems();
  const liveSystems = useMemo(
    () => Object.fromEntries((systems?.systems ?? []).map((sys) => [sys.slug, { status: sys.status.state, name: sys.name }])) as LiveSystems,
    [systems],
  );
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.filter((i) => i.kind === 'group').map((g) => [g.id, isWithin(pathname, (g as NavGroupItem).basePath)])),
  );

  // Gruppe der aktuellen Route automatisch aufklappen
  useEffect(() => {
    items.forEach((item) => {
      if (item.kind === 'group' && isWithin(pathname, item.basePath)) {
        setOpenGroups((s) => (s[item.id] ? s : { ...s, [item.id]: true }));
      }
    });
  }, [pathname, items]);

  const onGroupClick = (group: NavGroupItem) => {
    if (collapsed) {
      navigate(group.to ?? group.children[0]?.to ?? group.basePath);
      return;
    }
    if (group.to && !isWithin(pathname, group.basePath)) {
      navigate(group.to);
      setOpenGroups((s) => ({ ...s, [group.id]: true }));
      return;
    }
    setOpenGroups((s) => ({ ...s, [group.id]: !s[group.id] }));
  };

  return (
    <aside className={['sidebar', collapsed && 'sidebar--collapsed'].filter(Boolean).join(' ')} aria-label="Hauptnavigation">
      <div className="sidebar__brand">
        <NavLink to="/dashboard" className="sidebar__logo" aria-label="MIRA – zum Dashboard">
          <MiraLogo size={collapsed ? 44 : 46} />
          {!collapsed && <MiraWordmark />}
        </NavLink>
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Menü ausklappen' : 'Menü einklappen'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Menü ausklappen' : 'Menü einklappen'}
        >
          <Menu size={24} />
        </button>
      </div>

      <nav className="sidebar__nav">
        <ul className="nav-list">
          {items.map((item) => {
            const Icon = item.icon;
            if (item.kind === 'link') {
              return (
                <li key={item.id} className="nav-entry">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => ['nav-item', isActive && 'is-active'].filter(Boolean).join(' ')}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="nav-item__icon" size={24} strokeWidth={1.8} />
                    <span className="nav-item__label">{item.label}</span>
                  </NavLink>
                  {collapsed && <span className="nav-flyout nav-flyout--label">{item.label}</span>}
                </li>
              );
            }

            const groupActive = isWithin(pathname, item.basePath);
            const open = !collapsed && openGroups[item.id];
            const submenuId = `submenu-${item.id}`;
            return (
              <li key={item.id} className={['nav-entry', 'nav-group', open && 'is-open'].filter(Boolean).join(' ')}>
                <button
                  type="button"
                  className={['nav-item', groupActive && 'is-active'].filter(Boolean).join(' ')}
                  onClick={() => onGroupClick(item)}
                  aria-expanded={collapsed ? undefined : Boolean(open)}
                  aria-controls={collapsed ? undefined : submenuId}
                  aria-current={item.to && pathname === item.to ? 'page' : undefined}
                >
                  <Icon className="nav-item__icon" size={24} strokeWidth={1.8} />
                  <span className="nav-item__label">{item.label}</span>
                  <ChevronDown className="nav-item__chevron" size={20} aria-hidden />
                </button>

                {open && (
                  <ul className="subnav" id={submenuId}>
                    {item.children.map((child) => (
                      <SubNavItem key={child.to} child={child} live={liveSystems} />
                    ))}
                  </ul>
                )}

                {collapsed && (
                  <div className="nav-flyout">
                    <span className="nav-flyout__title">{item.label}</span>
                    <ul className="nav-flyout__list">
                      {item.children.map((child) => (
                        <SubNavItem key={child.to} child={child} live={liveSystems} />
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <GlowWave className="sidebar__wave" flip />
        <button type="button" className="nav-item nav-item--about" onClick={onAbout} title={collapsed ? 'Über MIRA' : undefined}>
          <Info className="nav-item__icon" size={24} strokeWidth={1.8} />
          <span className="nav-item__label">Über MIRA</span>
        </button>
      </div>
    </aside>
  );
}

const statusLabel: Record<OnlineStatus, string> = { online: 'online', offline: 'nicht erreichbar', unknown: 'Status unbekannt' };

function SubNavItem({ child, live }: { child: NavChild; live: LiveSystems }) {
  const ChildIcon = child.icon;
  const current = child.slug ? live[child.slug] : undefined;
  const status = current?.status ?? child.status;
  const label = current?.name ?? child.label;
  return (
    <li className="subnav__entry">
      <NavLink to={child.to} className={({ isActive }) => ['subnav__item', isActive && 'is-active'].filter(Boolean).join(' ')}>
        {status && <StatusDot status={status} label={`${label}: ${statusLabel[status]}`} />}
        {ChildIcon && <ChildIcon size={20} strokeWidth={1.8} className="subnav__icon" />}
        <span>{label}</span>
      </NavLink>
    </li>
  );
}
