import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Inhalte rechts im Kartenkopf (Links, Tabs, Buttons) */
  actions?: ReactNode;
  /** Trennlinie unter dem Kartenkopf */
  divider?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

export function Card({ title, subtitle, icon, actions, divider = false, className, bodyClassName, children }: CardProps) {
  const hasHeader = Boolean(title || icon || actions);
  return (
    <section className={['card', className].filter(Boolean).join(' ')}>
      {hasHeader && (
        <header className={['card__header', divider && 'card__header--divider'].filter(Boolean).join(' ')}>
          {icon && <span className="card__icon">{icon}</span>}
          <div className="card__titles">
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={['card__body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}
