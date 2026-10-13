import { AirVent, CalendarDays, CircleHelp, ClipboardCheck, LayoutDashboard, LogOut, MapPinned, Search, Users, Wind } from 'lucide-react';
import type { PageKey, UserProfile, UserRole } from '../types';
interface Props { page:PageKey; onNavigate:(page:PageKey)=>void; role:UserRole; user:UserProfile; onLogout:()=>void; }
const names:Record<UserRole,string>={customer:'ลูกค้า',technician:'ช่างแอร์',manager:'ผู้ดูแลอาคาร',admin:'ผู้ดูแลระบบ'};
const navItems:{key:PageKey;label:string;icon:typeof LayoutDashboard;roles?:UserRole[]}[]=[
  {key:'overview',label:'ภาพรวม',icon:LayoutDashboard},
  {key:'technicians',label:'ค้นหาช่าง',icon:Search,roles:['customer','manager','admin']},
  {key:'bookings',label:'รายการจอง',icon:CalendarDays},
  {key:'tracking',label:'ติดตามงาน',icon:MapPinned},
  {key:'passport',label:'ประวัติแอร์',icon:AirVent,roles:['customer','manager','admin']},
  {key:'batch',label:'งานหลายเครื่อง',icon:Users,roles:['manager','admin','customer']},
  {key:'reports',label:'รายงานบริการ',icon:ClipboardCheck},
];
function initials(name:string):string{return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.slice(0,1)).join('')||'AC';}
export default function Sidebar({page,onNavigate,role,user,onLogout}:Props){
  const visible=navItems.filter(item=>!item.roles||item.roles.includes(role));
  return <aside className="sidebar">
    <div className="brand-lockup"><div className="brand-symbol"><Wind size={22} strokeWidth={2.1}/></div><div><div className="brand-name">AirCare<span>.</span></div><div className="brand-caption">COMFORT, IN CONTROL</div></div></div>
    <div className="workspace-switcher"><div className="workspace-icon"><AirVent size={18}/></div><div className="workspace-copy"><span>พื้นที่ทำงาน</span><strong>{names[role]}</strong></div></div>
    <div className="sidebar-label">เมนูหลัก</div>
    <nav className="side-nav" aria-label="เมนูหลัก">{visible.map(item=>{const Icon=item.icon;return <button type="button" className={'nav-item '+(page===item.key?'active':'')} key={item.key} onClick={()=>onNavigate(item.key)}><Icon size={18} strokeWidth={1.9}/><span>{item.label}</span></button>;})}</nav>
    <div className="sidebar-bottom">
      <div className="sidebar-label">บัญชีของคุณ</div>
      <div className="sidebar-user"><div className="avatar avatar-ink">{initials(user.fullName)}</div><div className="sidebar-user-copy"><strong>{user.fullName}</strong><span>{user.email}</span></div></div>
      <button type="button" className="nav-item sidebar-logout" onClick={onLogout}><LogOut size={18}/><span>ออกจากระบบ</span></button>
      <div className="sidebar-help-note"><CircleHelp size={15}/><span>หากต้องการความช่วยเหลือ โปรดติดต่อผู้ดูแลระบบ</span></div>
    </div>
  </aside>;
}
