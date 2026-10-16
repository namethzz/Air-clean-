import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** A page's heading, a line on what it is for, and its actions on the right (they wrap below on phones). */
export function PageHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return <header className="ui-page-head">
    <div><h1>{title}</h1>{children && <p>{children}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>;
}

/**
 * The plate: one object's key number (a price, a payout, a distance) readable at arm's length, with the facts
 * that qualify it underneath. `quiet` is the white version for the ones that are not first in line.
 */
export function Plate({ num, unit, meta, side, strip, quiet, className = '' }: {
  num: ReactNode; unit?: ReactNode; meta?: ReactNode; side?: ReactNode; strip?: ReactNode; quiet?: boolean; className?: string;
}) {
  return <div className={'ui-plate' + (quiet ? ' is-quiet' : '') + (className ? ' ' + className : '')}>
    <div className="ui-plate-num">{num}{unit && <small>{unit}</small>}</div>
    {side && <div className="ui-plate-side">{side}</div>}
    {meta && <div className="ui-plate-meta">{meta}</div>}
    {strip && <Strip>{strip}</Strip>}
  </div>;
}

/** The reflective strip: shown only when it is your turn to do something. */
export function Strip({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return <div className="ui-strip" role="status">{Icon && <Icon size={18} aria-hidden="true"/>}<span>{children}</span></div>;
}

/** An empty list that says what will appear here and offers the way to make it appear. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ui-empty">
    <Icon size={30} aria-hidden="true"/>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>;
}
