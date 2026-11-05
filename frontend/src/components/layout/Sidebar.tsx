import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { ChevronDown, Info, Menu } from 'lucide-react';
import { MiraLogo, MiraWordmark } from '../brand/MiraLogo';
import { StatusDot } from '../ui/Primitives';
import { GlowWave } from '../illustrations/GlowWaves';
import { getNavigation, type NavChild, type NavGroupItem } from './navigation';

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
                      <SubNavItem key={child.to} child={child} />
                    ))}
                  </ul>
                )}

                {collapsed && (
                  <div className="nav-flyout">
                    <span className="nav-flyout__title">{item.label}</span>
                    <ul className="nav-flyout__list">
                      {item.children.map((child) => (
                        <SubNavItem key={child.to} child={child} />
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

function SubNavItem({ child }: { child: NavChild }) {
  const ChildIcon = child.icon;
  return (
    <li className="subnav__entry">
      <NavLink to={child.to} className={({ isActive }) => ['subnav__item', isActive && 'is-active'].filter(Boolean).join(' ')}>
        {child.status && <StatusDot status={child.status} />}
        {ChildIcon && <ChildIcon size={20} strokeWidth={1.8} className="subnav__icon" />}
        <span>{child.label}</span>
      </NavLink>
    </li>
  );
}
