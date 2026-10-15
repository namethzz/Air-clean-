import { Search } from 'lucide-react';
import type { PageKey, UserRole } from '../types';

interface Props { role: UserRole; page: PageKey; title: string; searchQuery: string; onSearchChange: (value: string) => void; onNewBooking: () => void; }

/** Search only filters these pages, so it appears only there. */
const searchHints: Partial<Record<PageKey, string>> = { technicians: 'ค้นหาช่าง...', bookings: 'ค้นหารายการจอง...' };

export default function Topbar({ role, page, title, searchQuery, onSearchChange, onNewBooking }: Props) {
  // Customers' job list is short and has its own tabs, so it has no search box.
  const hint = role === 'customer' || role === 'technician' ? undefined : searchHints[page];
  // The overview already has its own single call to action.
  // Customers have the button in the sidebar and bottom bar already.
  const canBook = role !== 'technician' && role !== 'customer' && page !== 'overview';
  return <header className="topbar">
    <div className="topbar-context"><div className="breadcrumb">AIRCLEAN <span>/</span> WORKSPACE</div><div className="topbar-title">{title}</div></div>
    <div className="topbar-actions">
      {hint && <label className="global-search"><Search size={17}/><input value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder={hint} aria-label={hint.replace('...', '')}/></label>}
      {canBook && <button type="button" className="primary-button topbar-book-button" onClick={onNewBooking}>ขอช่างล้างแอร์</button>}
    </div>
  </header>;
}
