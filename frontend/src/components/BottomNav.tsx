import { AirVent, ClipboardList, Home, Plus, UserRound } from 'lucide-react';
import type { PageKey } from '../types';

interface Props {
  page: PageKey;
  actionCount: number;
  onNavigate: (page: PageKey) => void;
  onNewBooking: () => void;
}

/** Thumb-reach navigation for customers on phones. Hidden on wide screens, where the sidebar is used. */
export default function BottomNav({ page, actionCount, onNavigate, onNewBooking }: Props) {
  const item = (key: PageKey, label: string, Icon: typeof Home, badge = 0) => {
    const active = page === key;
    return <button type="button" className={'bn-item' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={() => onNavigate(key)}>
      <span className="bn-icon"><Icon size={22} strokeWidth={active ? 2.3 : 1.9}/>{badge > 0 && <b aria-label={`${badge} งานรอคุณ`}>{badge}</b>}</span>
      <span>{label}</span>
    </button>;
  };
  return <nav className="bottom-nav" aria-label="เมนูหลัก">
    {item('overview', 'หน้าแรก', Home)}
    {item('bookings', 'งานของฉัน', ClipboardList, actionCount)}
    <button type="button" className="bn-add" onClick={onNewBooking}><span className="bn-add-dot"><Plus size={26} strokeWidth={2.4}/></span><span>ขอช่าง</span></button>
    {item('passport', 'แอร์ของฉัน', AirVent)}
    {item('profile', 'บัญชี', UserRound)}
  </nav>;
}
