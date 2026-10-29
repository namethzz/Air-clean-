import { BadgeCheck, Wallet, Building2, History, MessageSquareWarning, CalendarDays, ShieldCheck, UserCog, ClipboardCheck, ClipboardList, Home, LayoutDashboard, LogOut, MapPinned, MapPin, Plus, Search } from 'lucide-react';
import BrandMark from '../BrandMark';
import type { PageKey, UserProfile, UserRole } from '../../types';
import Avatar from '../Avatar';

interface Props { page:PageKey; onNavigate:(page:PageKey)=>void; role:UserRole; user:UserProfile; onLogout:()=>void; onNewBooking?:()=>void; actionCount?:number; }
type Item = {key:PageKey;label:string;icon:typeof LayoutDashboard};
export const roleNames:Record<UserRole,string>={customer:'ลูกค้า',technician:'ช่างแอร์',manager:'ผู้ดูแลอาคาร',admin:'ผู้ดูแลระบบ'};

/** Customers: offers, tracking, payment and the service report all live inside "งานของฉัน". */
const customerItems:Item[]=[
  {key:'overview',label:'หน้าแรก',icon:Home},
  {key:'bookings',label:'งานของฉัน',icon:ClipboardList},
  {key:'history',label:'ประวัติการล้าง',icon:History},
];
/** Building managers: the customer flow for whole buildings, plus their buildings. */
const managerItems:Item[]=[
  {key:'overview',label:'หน้าแรก',icon:Home},
  {key:'bookings',label:'งานของอาคาร',icon:ClipboardList},
  {key:'buildings',label:'อาคารของฉัน',icon:Building2},
  {key:'history',label:'ประวัติการล้าง',icon:History},
];
/** Technicians: confirmed jobs, travel, report and payment all live inside "งานของฉัน". */
const technicianItems:Item[]=[
  {key:'nearbyJobs',label:'งานใกล้ฉัน',icon:MapPin},
  {key:'bookings',label:'งานของฉัน',icon:ClipboardList},
  {key:'membership',label:'สมาชิก AirClean',icon:BadgeCheck},
  {key:'profile',label:'โปรไฟล์และราคา',icon:UserCog},
];
const adminItems:Item[]=[
  {key:'overview',label:'ภาพรวม',icon:LayoutDashboard},
  {key:'approvals',label:'ตรวจสอบช่าง',icon:ShieldCheck},
  {key:'technicians',label:'ช่างทั้งหมด',icon:Search},
  {key:'bookings',label:'รายการจอง',icon:CalendarDays},
  {key:'issues',label:'เรื่องที่ถูกแจ้ง',icon:MessageSquareWarning},
  {key:'membership',label:'ค่าสมาชิกช่าง',icon:Wallet},
  {key:'tracking',label:'ติดตามงาน',icon:MapPinned},
  {key:'reports',label:'รายงานบริการ',icon:ClipboardCheck},
];
export const navItemsFor=(role:UserRole)=>role==='manager'?managerItems:role==='customer'?customerItems:role==='technician'?technicianItems:adminItems;

/**
 * The vest-blue rail: every destination for the role, the main action for people who book, and the account.
 * On phones it is the admin's slide-in menu; the other roles use the bottom bar there instead.
 */
export default function Sidebar({page,onNavigate,role,user,onLogout,onNewBooking,actionCount=0}:Props){
  const badgeOn:PageKey=role==='admin'?'issues':'bookings';
  return <aside className="sh-rail" aria-label="เมนู AirClean">
    <div className="sh-brand">
      <span className="sh-brand-mark" aria-hidden="true"><BrandMark className="w-[80%] h-auto"/></span>
      <span className="sh-brand-text"><strong>AirClean</strong><small>{roleNames[role]}</small></span>
    </div>
    {onNewBooking&&<button type="button" className="sh-rail-cta" onClick={onNewBooking}><Plus size={20} strokeWidth={2.4}/>ขอช่างล้างแอร์</button>}
    <nav className="sh-nav" aria-label="เมนูหลัก">
      {navItemsFor(role).map(item=>{
        const Icon=item.icon, active=page===item.key, badge=item.key===badgeOn?actionCount:0;
        return <button type="button" key={item.key} className={'sh-nav-item'+(active?' is-active':'')} aria-current={active?'page':undefined} onClick={()=>onNavigate(item.key)}>
          <Icon size={20} strokeWidth={active?2.2:1.9}/><span>{item.label}</span>
          {badge>0&&<b className="sh-count" aria-label={badge+(role==='admin'?' เรื่องรอดำเนินการ':' งานรอคุณ')}>{badge}</b>}
        </button>;
      })}
    </nav>
    <div className="sh-rail-foot">
      <button type="button" className={'sh-me'+(page==='profile'?' is-active':'')} onClick={()=>onNavigate('profile')} aria-label="เปิดโปรไฟล์ของฉัน">
        <span className="sh-me-avatar" aria-hidden="true"><Avatar name={user.fullName} photoId={user.photoId}/></span>
        <span className="sh-me-text"><strong>{user.fullName}</strong><small>{user.email}</small></span>
      </button>
      <button type="button" className="sh-nav-item sh-logout" onClick={onLogout}><LogOut size={19}/><span>ออกจากระบบ</span></button>
    </div>
  </aside>;
}
