import { AirVent, BadgeCheck, Wallet, Building2, History, MessageSquareWarning, CalendarDays, ShieldCheck, UserCog, CircleHelp, ClipboardCheck, ClipboardList, Home, LayoutDashboard, LogOut, MapPinned, MapPin, Plus, Search, Settings2 } from 'lucide-react';
import BrandMark from './BrandMark';
import type { PageKey, UserProfile, UserRole } from '../types';
interface Props { page:PageKey; onNavigate:(page:PageKey)=>void; role:UserRole; user:UserProfile; onLogout:()=>void; onNewBooking?:()=>void; actionCount?:number; }
type Item = {key:PageKey;label:string;icon:typeof LayoutDashboard;roles?:UserRole[];moreFor?:UserRole[]};
const names:Record<UserRole,string>={customer:'ลูกค้า',technician:'ช่างแอร์',manager:'ผู้ดูแลอาคาร',admin:'ผู้ดูแลระบบ'};
/** Customers get three destinations. Offers, tracking, payment and the service report all live inside "งานของฉัน". */
const customerItems:Item[]=[
  {key:'overview',label:'หน้าแรก',icon:Home},
  {key:'bookings',label:'งานของฉัน',icon:ClipboardList},
  {key:'history',label:'ประวัติการล้าง',icon:History},
];
/** Technicians get three destinations. Confirmed jobs, travel, report and payment all live inside "งานของฉัน". */
/** Building managers: the customer flow for whole buildings, plus their buildings. */
const managerItems:Item[]=[
  {key:'overview',label:'หน้าแรก',icon:Home},
  {key:'bookings',label:'งานของอาคาร',icon:ClipboardList},
  {key:'buildings',label:'อาคารของฉัน',icon:Building2},
  {key:'history',label:'ประวัติการล้าง',icon:History},
];
const technicianItems:Item[]=[
  {key:'nearbyJobs',label:'งานใกล้ฉัน',icon:MapPin},
  {key:'bookings',label:'งานของฉัน',icon:ClipboardList},
  {key:'membership',label:'สมาชิก AirClean',icon:BadgeCheck},
  {key:'profile',label:'โปรไฟล์และราคา',icon:UserCog},
];
const navItems:Item[]=[
  {key:'overview',label:'ภาพรวม',icon:LayoutDashboard},
  {key:'technicians',label:'ช่างทั้งหมด',icon:Search,roles:['admin']},
  {key:'nearbyJobs',label:'งานใกล้ฉัน',icon:MapPin,roles:['technician']},
  {key:'bookings',label:'รายการจอง',icon:CalendarDays},
  {key:'tracking',label:'ติดตามงาน',icon:MapPinned},
  {key:'reports',label:'รายงานบริการ',icon:ClipboardCheck},
  {key:'approvals',label:'ตรวจสอบช่าง',icon:ShieldCheck,roles:['admin']},
  {key:'issues',label:'เรื่องที่ถูกแจ้ง',icon:MessageSquareWarning,roles:['admin']},
  {key:'membership',label:'ค่าสมาชิกช่าง',icon:Wallet,roles:['admin']},
];
function initials(name:string):string{return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.slice(0,1)).join('')||'AC';}
export default function Sidebar({page,onNavigate,role,user,onLogout,onNewBooking,actionCount=0}:Props){
  const customer=role==='customer'||role==='manager';
  const technician=role==='technician';
  const main=role==='manager'?managerItems:customer?customerItems:technician?technicianItems:navItems.filter(item=>!item.roles||item.roles.includes(role));
  const renderItem=(item:Item)=>{const Icon=item.icon;const label=role==='admin'&&item.key==='technicians'?'ช่างทั้งหมด':item.label;const badge=((customer||technician)&&item.key==='bookings')||(role==='admin'&&item.key==='issues')?actionCount:0;return <button type="button" className={'nav-item '+(page===item.key?'active':'')} key={item.key} aria-current={page===item.key?'page':undefined} onClick={()=>onNavigate(item.key)}><Icon size={18} strokeWidth={1.9}/><span>{label}</span>{badge>0&&<b className="nav-badge" aria-label={badge+(role==='admin'?' เรื่องรอดำเนินการ':' งานรอคุณ')}>{badge}</b>}</button>;};
  return <aside className="sidebar">
    <div className="brand-lockup"><div className="brand-symbol"><BrandMark className="w-[82%] h-auto"/></div><div><div className="brand-name">AirClean<span>.</span></div><div className="brand-caption">COMFORT, IN CONTROL</div></div></div>
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
