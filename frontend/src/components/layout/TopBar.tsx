import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import { useAuth, useCurrentUser } from '../../auth/AuthContext';

export interface Crumb {
  label: string;
  to?: string;
}

export interface TopBarProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  breadcrumb?: Crumb[];
}

export function TopBar({ title, subtitle, icon, breadcrumb }: TopBarProps) {
  return (
    <header className={['topbar', subtitle && 'topbar--tall'].filter(Boolean).join(' ')}>
      <div className="topbar__heading">
        {icon && <span className="topbar__icon">{icon}</span>}
        <div className="topbar__titles">
          {breadcrumb ? (
            <nav aria-label="Brotkrumen">
              <ol className="breadcrumb">
                {breadcrumb.map((c, i) => (
                  <Fragment key={c.label}>
                    {i > 0 && (
                      <li aria-hidden className="breadcrumb__sep">
                        <ChevronRight size={18} />
                      </li>
                    )}
                    <li>
                      {c.to && i < breadcrumb.length - 1 ? (
                        <Link to={c.to}>{c.label}</Link>
                      ) : (
                        <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>{c.label}</span>
                      )}
                    </li>
                  </Fragment>
                ))}
              </ol>
            </nav>
          ) : (
            <h1 className="topbar__title">{title}</h1>
          )}
          {subtitle && <p className="topbar__subtitle">{subtitle}</p>}
        </div>
      </div>
      <UserMenu />
    </header>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Benutzermenü ${user.displayName}`}
      >
        <span className="avatar">{user.displayName.charAt(0).toUpperCase()}</span>
        <ChevronDown size={20} className="user-menu__chevron" />
      </button>
      {open && (
        <div className="user-menu__panel" role="menu">
          <div className="user-menu__identity">
            <span className="avatar avatar--sm">{user.displayName.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.username}</span>
            </div>
          </div>
          <button type="button" role="menuitem" className="user-menu__item" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
            <LogOut size={18} />
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}
