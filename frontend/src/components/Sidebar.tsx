import { AirVent, CalendarDays, UserCog, CircleHelp, ClipboardCheck, ClipboardList, Home, LayoutDashboard, LogOut, MapPinned, MapPin, Plus, Search, Settings2, Users, Wind } from 'lucide-react';
import type { PageKey, UserProfile, UserRole } from '../types';
interface Props { page:PageKey; onNavigate:(page:PageKey)=>void; role:UserRole; user:UserProfile; onLogout:()=>void; onNewBooking?:()=>void; actionCount?:number; }
type Item = {key:PageKey;label:string;icon:typeof LayoutDashboard;roles?:UserRole[];moreFor?:UserRole[]};
const names:Record<UserRole,string>={customer:'ลูกค้า',technician:'ช่างแอร์',manager:'ผู้ดูแลอาคาร',admin:'ผู้ดูแลระบบ'};
/** Customers get three destinations. Offers, tracking, payment and the service report all live inside "งานของฉัน". */
const customerItems:Item[]=[
  {key:'overview',label:'หน้าแรก',icon:Home},
  {key:'bookings',label:'งานของฉัน',icon:ClipboardList},
  {key:'passport',label:'แอร์ของฉัน',icon:AirVent},
];
/** Technicians get three destinations. Confirmed jobs, travel, report and payment all live inside "งานของฉัน". */
const technicianItems:Item[]=[
  {key:'nearbyJobs',label:'งานใกล้ฉัน',icon:MapPin},
  {key:'bookings',label:'งานของฉัน',icon:ClipboardList},
  {key:'profile',label:'โปรไฟล์และราคา',icon:UserCog},
];
const navItems:Item[]=[
  {key:'overview',label:'ภาพรวม',icon:LayoutDashboard},
  {key:'technicians',label:'ค้นหาช่าง',icon:Search,roles:['manager','admin']},
  {key:'nearbyJobs',label:'งานใกล้ฉัน',icon:MapPin,roles:['technician']},
  {key:'bookings',label:'รายการจอง',icon:CalendarDays},
  {key:'tracking',label:'ติดตามงาน',icon:MapPinned},
  {key:'passport',label:'ประวัติแอร์',icon:AirVent,roles:['manager','admin']},
  {key:'batch',label:'งานหลายเครื่อง',icon:Users,roles:['manager','admin']},
  {key:'reports',label:'รายงานบริการ',icon:ClipboardCheck},
];
function initials(name:string):string{return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.slice(0,1)).join('')||'AC';}
export default function Sidebar({page,onNavigate,role,user,onLogout,onNewBooking,actionCount=0}:Props){
  const customer=role==='customer';
  const technician=role==='technician';
  const main=customer?customerItems:technician?technicianItems:navItems.filter(item=>!item.roles||item.roles.includes(role));
  const renderItem=(item:Item)=>{const Icon=item.icon;const badge=(customer||technician)&&item.key==='bookings'?actionCount:0;return <button type="button" className={'nav-item '+(page===item.key?'active':'')} key={item.key} aria-current={page===item.key?'page':undefined} onClick={()=>onNavigate(item.key)}><Icon size={18} strokeWidth={1.9}/><span>{item.label}</span>{badge>0&&<b className="nav-badge" aria-label={badge+' งานรอคุณ'}>{badge}</b>}</button>;};
  return <aside className="sidebar">
    <div className="brand-lockup"><div className="brand-symbol"><Wind size={22} strokeWidth={2.1}/></div><div><div className="brand-name">AirClean<span>.</span></div><div className="brand-caption">COMFORT, IN CONTROL</div></div></div>
    <div className="workspace-switcher"><div className="workspace-icon"><AirVent size={18}/></div><div className="workspace-copy"><span>พื้นที่ทำงาน</span><strong>{names[role]}</strong></div></div>
    {customer
      ?onNewBooking&&<button type="button" className="sidebar-cta" onClick={onNewBooking}><Plus size={19} strokeWidth={2.3}/> ขอช่างล้างแอร์</button>
      :<div className="role-chip" aria-label={'บทบาทของคุณ: '+names[role]}><span className="role-chip-dot" aria-hidden="true"/>{names[role]}</div>}
    <nav className="side-nav" aria-label="เมนูหลัก">{main.map(renderItem)}</nav>
    <div className="sidebar-bottom">
      <button type="button" className="sidebar-user sidebar-profile-link" onClick={() => onNavigate("profile")} aria-label="เปิดโปรไฟล์ของฉัน"><div className="avatar avatar-ink">{initials(user.fullName)}</div><div className="sidebar-user-copy"><strong>{user.fullName}</strong><span>{user.email}</span></div><Settings2 size={16}/></button>
      <button type="button" className="nav-item sidebar-logout" onClick={onLogout}><LogOut size={18}/><span>ออกจากระบบ</span></button>
      {!customer&&<div className="sidebar-help-note"><CircleHelp size={15}/><span>หากต้องการความช่วยเหลือ โปรดติดต่อผู้ดูแลระบบ</span></div>}
    </div>
  </aside>;
}
