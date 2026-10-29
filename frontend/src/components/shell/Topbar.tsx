import type { ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import type { PageKey, UserRole } from '../../types';

interface Props { role: UserRole; page: PageKey; title: string; searchQuery: string; onSearchChange: (value: string) => void; onNewBooking: () => void; bell?: ReactNode; }

/** Search only filters these pages, so it appears only there. */
const searchHints: Partial<Record<PageKey, string>> = { technicians: 'ค้นหาช่าง', bookings: 'ค้นหารายการจอง' };

/** The wide-screen top bar: the page's name, search where it filters, and the bell. */
export default function Topbar({ role, page, title, searchQuery, onSearchChange, onNewBooking, bell }: Props) {
  const hint = role === 'admin' || role === 'manager' ? searchHints[page] : undefined;
  // Managers book from the rail too, but the job list is where they look for it.
  const canBook = role === 'manager' && page === 'bookings';
  return <header className="sh-top">
    <h1 className="sh-top-title">{title}</h1>
    <div className="sh-top-actions">
      {hint && <label className="sh-search"><Search size={18} aria-hidden="true"/><input value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder={hint + '…'} aria-label={hint}/></label>}
      {canBook && <button type="button" className="ui-btn is-primary" onClick={onNewBooking}><Plus size={18}/>ขอช่างล้างแอร์</button>}
      {bell}
    </div>
  </header>;
}
