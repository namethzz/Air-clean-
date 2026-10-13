import { AirVent, CalendarDays, ChevronDown, CircleHelp, ClipboardCheck, LayoutDashboard, LogOut, Search, Settings2, ShieldCheck, Users, Wind } from 'lucide-react';
import type { PageKey, UserRole } from '../types';

interface SidebarProps { page: PageKey; onNavigate: (page: PageKey) => void; role: UserRole; onRoleChange: (role: UserRole) => void; }
const navItems: { key: PageKey; label: string; icon: typeof LayoutDashboard; roles?: UserRole[] }[] = [
  { key: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
  { key: 'technicians', label: 'ค้นหาช่าง', icon: Search, roles: ['customer', 'manager', 'admin'] },
  { key: 'bookings', label: 'การจองของฉัน', icon: CalendarDays },
  { key: 'passport', label: 'Aircon Passport', icon: AirVent, roles: ['customer', 'manager', 'admin'] },
  { key: 'batch', label: 'งานแบบกลุ่ม', icon: Users, roles: ['manager', 'admin', 'customer'] },
  { key: 'reports', label: 'รายงานบริการ', icon: ClipboardCheck, roles: ['technician', 'manager', 'admin'] },
];
const roleNames: Record<UserRole, string> = { customer: 'ลูกค้า', technician: 'ช่างแอร์', manager: 'ผู้ดูแลอาคาร', admin: 'ผู้ดูแลระบบ' };

export default function Sidebar({ page, onNavigate, role, onRoleChange }: SidebarProps) {
  const visibleItems = navItems.filter((item) => !item.roles || item.roles.includes(role));
  return <aside className="sidebar">
    <div className="brand-lockup"><div className="brand-symbol"><Wind size={21} strokeWidth={2.1}/></div><div><div className="brand-name">aircare<span>.</span></div><div className="brand-caption">COMFORT, IN CONTROL</div></div></div>
    <div className="workspace-switcher"><div className="workspace-icon"><AirVent size={17}/></div><div className="workspace-copy"><span>Workspace</span><strong>บ้านของคุณ</strong></div><ChevronDown size={15} className="muted-icon"/></div>
    <div className="sidebar-label">เมนูหลัก</div>
    <nav className="side-nav" aria-label="เมนูหลัก">{visibleItems.map((item) => { const Icon = item.icon; return <button className={`nav-item ${page === item.key ? 'active' : ''}`} key={item.key} onClick={() => onNavigate(item.key)}><Icon size={18} strokeWidth={1.8}/><span>{item.label}</span>{item.key === 'bookings' && <span className="nav-count">2</span>}</button>; })}</nav>
    <div className="sidebar-bottom">
      <div className="sidebar-label">การตั้งค่า</div>
      <button className="nav-item" onClick={() => onNavigate('overview')}><Settings2 size={18}/><span>ตั้งค่าบัญชี</span></button>
      <button className="nav-item" onClick={() => onNavigate('reports')}><CircleHelp size={18}/><span>ศูนย์ช่วยเหลือ</span></button>
      <div className="sidebar-role-card"><div className="role-heading"><ShieldCheck size={15}/><span>โหมดทดลองใช้งาน</span></div><select value={role} onChange={(event) => onRoleChange(event.target.value as UserRole)} aria-label="เลือกบทบาทผู้ใช้งาน">{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="role-help">สลับบทบาทเพื่อทดลองหน้าจอแต่ละฝั่ง</span></div>
      <div className="sidebar-user"><div className="avatar avatar-ink">นท</div><div className="sidebar-user-copy"><strong>นที ว.</strong><span>{roleNames[role]}</span></div><button className="icon-button logout-button" aria-label="ออกจากระบบ" onClick={() => { localStorage.removeItem('aircare.demo.token'); onRoleChange('customer'); }}><LogOut size={16}/></button></div>
    </div>
  </aside>;
}