import { Bell, ChevronDown, Search } from 'lucide-react';
import type { UserRole } from '../types';

interface TopbarProps { role: UserRole; searchQuery: string; onSearchChange: (value: string) => void; onNewBooking: () => void; }
const greetings: Record<UserRole, string> = { customer: 'พื้นที่ดูแลบ้านของคุณ', technician: 'พื้นที่จัดการงานของคุณ', manager: 'พื้นที่ดูแลอาคารของคุณ', admin: 'ภาพรวมแพลตฟอร์ม' };

export default function Topbar({ role, searchQuery, onSearchChange, onNewBooking }: TopbarProps) {
  return <header className="topbar">
    <div className="topbar-context"><div className="breadcrumb">AIRCARE <span>/</span> WORKSPACE</div><div className="topbar-title">{greetings[role]}</div></div>
    <div className="topbar-actions">
      <label className="global-search"><Search size={17}/><input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="ค้นหาช่าง, การจอง..." aria-label="ค้นหา"/><kbd>⌘ K</kbd></label>
      <button className="icon-button notification-button" aria-label="การแจ้งเตือน"><Bell size={19}/><i/></button><div className="topbar-divider"/>
      <button className="topbar-profile" onClick={onNewBooking} title="จองบริการใหม่"><span className="avatar avatar-small">นท</span><ChevronDown size={14}/></button>
    </div>
  </header>;
}