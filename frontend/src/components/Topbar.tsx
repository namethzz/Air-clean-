import { LogOut, Search } from 'lucide-react';
import type { UserRole } from '../types';
interface Props { role:UserRole; userName:string; searchQuery:string; onSearchChange:(value:string)=>void; onNewBooking:()=>void; onLogout:()=>void; }
const greetings:Record<UserRole,string>={customer:'พื้นที่ดูแลบ้านของคุณ',technician:'พื้นที่จัดการงานของคุณ',manager:'พื้นที่ดูแลอาคารของคุณ',admin:'ภาพรวมแพลตฟอร์ม'};
function initials(name:string):string{return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.slice(0,1)).join('')||'AC';}
export default function Topbar({role,userName,searchQuery,onSearchChange,onNewBooking,onLogout}:Props){
 return <header className="topbar">
  <div className="topbar-context"><div className="breadcrumb">AIRCARE <span>/</span> WORKSPACE</div><div className="topbar-title">{greetings[role]}</div></div>
  <div className="topbar-actions">
   <label className="global-search"><Search size={17}/><input value={searchQuery} onChange={event=>onSearchChange(event.target.value)} placeholder="ค้นหาช่างหรือรายการจอง..." aria-label="ค้นหาช่างหรือรายการจอง"/></label>
   {role!=='technician'&&<button type="button" className="primary-button topbar-book-button" onClick={onNewBooking}>จองบริการ</button>}
   <div className="topbar-divider"/><div className="topbar-profile" aria-label={'ผู้ใช้งาน '+userName}><span className="avatar avatar-small">{initials(userName)}</span><span className="topbar-user-name">{userName}</span></div><button type="button" className="topbar-logout-button" onClick={onLogout} aria-label="ออกจากระบบ" title="ออกจากระบบ"><LogOut size={16}/><span>ออกจากระบบ</span></button>
  </div>
 </header>;
}
