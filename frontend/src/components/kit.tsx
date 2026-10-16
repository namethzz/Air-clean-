import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X, type LucideIcon } from 'lucide-react';

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

/** A problem shown next to the thing it is about. `data-problem` lets a form scroll to it. */
export function Problem({ children, id }: { children: ReactNode; id?: string }) {
  return <p className="ui-problem" role="alert" id={id} data-problem><AlertCircle size={17} aria-hidden="true"/><span>{children}</span></p>;
}

const openSheets: number[] = [];
let sheetCount = 0;
const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A sheet: it rises from the bottom on phones and opens as a dialog on wider screens. The page behind stops
 * scrolling, focus moves in and stays in, and Escape or a tap outside closes only the sheet on top.
 * `footer` stays in view while the body scrolls, so a long form keeps its button in reach.
 */
export function Sheet({ title, sub, onClose, children, footer, wide, className = '' }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; className?: string;
}) {
  const titleId = useId();
  const box = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = ++sheetCount;
    openSheets.push(me);
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.documentElement.style.overflow = 'hidden';
    box.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== me || !box.current) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const items = [...box.current.querySelectorAll<HTMLElement>(focusable)].filter(item => item.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      openSheets.splice(openSheets.indexOf(me), 1);
      if (!openSheets.length) document.documentElement.style.overflow = '';
      before?.focus({ preventScroll: true });
    };
  }, []);
  // Inside the app frame, so the sheet keeps its type and colours.
  const host = document.querySelector('.ac-shell') ?? document.body;
  return createPortal(<div className="ui-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className={'ui-sheet is-framed' + (wide ? ' is-wide' : '') + (className ? ' ' + className : '')}>
      <header className="ui-sheet-head">
        <div><h2 id={titleId}>{title}</h2>{sub && <p>{sub}</p>}</div>
        <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="ปิด"><X size={20}/></button>
      </header>
      <div className="ui-sheet-body">{children}</div>
      {footer && <footer className="ui-sheet-foot">{footer}</footer>}
    </section>
  </div>, host);
}
