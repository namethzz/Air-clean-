import HeroFinancial from '../components/ui/hero-financial';
import './CustomerExperience.css';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, Clock3, MapPin, Wallet, Wind, Wrench } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import CustomerHome from './CustomerHome';
import StatusBadge from '../components/StatusBadge';
import type { AppState, PageKey, UserRole } from '../types';
interface Props { state: AppState; role: UserRole; userName: string; onNavigate: (page: PageKey) => void; onNewBooking: () => void; }
function formatDate(value: string) { return new Date(value + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); }
type Target = PageKey | 'newBooking';
const heroCopy: Record<UserRole, { heading: (name: string) => string; description: string; primary: string; primaryTo: Target; secondary: string; secondaryTo: PageKey }> = {
  customer: { heading: name => `สวัสดี ${name}`, description: 'ส่งคำขอครั้งเดียว แล้วเลือกช่างจากข้อเสนอที่ส่งมาให้คุณ', primary: 'ขอช่างล้างแอร์', primaryTo: 'newBooking', secondary: 'ดูนัดหมายของฉัน', secondaryTo: 'bookings' },
  technician: { heading: name => `สวัสดี ${name}`, description: 'ค้นหางานใกล้ตัว ส่งข้อเสนอ และจัดการงานที่ลูกค้ายืนยันแล้ว', primary: 'ดูงานใกล้ฉัน', primaryTo: 'nearbyJobs', secondary: 'ตั้งค่าโปรไฟล์บริการ', secondaryTo: 'profile' },
  manager: { heading: name => `สวัสดี ${name}`, description: 'รวมแอร์หลายเครื่องเป็นคำขอเดียว ติดตามความคืบหน้า และตรวจรายงานจากช่าง', primary: 'สร้างงานหลายเครื่อง', primaryTo: 'batch', secondary: 'ดูรายการจอง', secondaryTo: 'bookings' },
  admin: { heading: () => 'ภาพรวมแพลตฟอร์ม', description: 'ติดตามรายการจอง ช่าง และรายงานบริการในระบบ', primary: 'ดูรายการจอง', primaryTo: 'bookings', secondary: 'ค้นหาช่าง', secondaryTo: 'technicians' },
};
const sideCopy: Record<UserRole, { title: string; sub: string; note: string; cta: string; to: PageKey }> = {
  customer: { title: 'เลือกช่างอย่างมั่นใจ', sub: 'คุณเป็นผู้เลือกและยืนยันช่าง', note: 'ราคาที่แสดงตอนสร้างคำขอเป็นเพียงการประเมิน ตรวจสอบข้อเสนอและโปรไฟล์ก่อนยืนยัน ที่อยู่เต็มของคุณจะแสดงเฉพาะช่างที่ได้รับเลือก', cta: 'ดูข้อเสนอสำหรับคำขอ', to: 'bookings' },
  technician: { title: 'ก่อนออกเดินทาง', sub: 'เริ่มงานเมื่อได้รับการยืนยันแล้ว', note: 'การส่งความสนใจยังไม่ถือว่าได้รับงาน เมื่อลูกค้าเลือกคุณ งานจะปรากฏในรายการจองพร้อมที่อยู่สำหรับเดินทาง', cta: 'ติดตามงานของฉัน', to: 'tracking' },
  manager: { title: 'ดูแลทั้งอาคารอย่างเป็นระบบ', sub: 'งานหลายเครื่องและรายงานบริการ', note: 'รวมแอร์หลายห้องเป็นคำขอเดียว ดูความคืบหน้าของแต่ละงาน และตรวจรายงานบริการจากช่างก่อนปิดงาน', cta: 'ดูงานหลายเครื่อง', to: 'batch' },
  admin: { title: 'ตรวจสอบภาพรวมระบบ', sub: 'รายการที่ต้องมีผู้ดูแลตรวจสอบ', note: 'ดูรายการจองและรายงานบริการ รวมถึงรายการที่ถูกแจ้งปัญหาการชำระเงินเพื่อให้ผู้ดูแลตรวจสอบ', cta: 'ดูรายการจอง', to: 'bookings' },
};
export default function DashboardPage({ state, role, userName, onNavigate, onNewBooking }: Props) {
  if (role === 'customer') return <CustomerHome bookings={state.bookings} reports={state.serviceReports} userName={userName} onNavigate={onNavigate} onNewBooking={onNewBooking}/>;
  const technician = role === 'technician';
  const active = state.bookings.filter(b => !['เสร็จสิ้น', 'ยกเลิก'].includes(b.status));
  const completed = state.bookings.filter(b => b.status === 'เสร็จสิ้น');
  const waiting = state.bookings.filter(b => ['เปิดรับช่าง', 'รอเลือกช่าง'].includes(b.status));
  const upcoming = [...active].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4);
  const primaryAction = () => technician ? onNavigate('nearbyJobs') : onNewBooking();
  const hero = heroCopy[role];
  const side = sideCopy[role];
  const go = (target: Target) => target === 'newBooking' ? onNewBooking() : onNavigate(target);
  return <div className="page-stack ac-dashboard">
    <HeroFinancial compact userName={userName} heading={hero.heading(userName)} description={hero.description} primaryLabel={hero.primary} secondaryLabel={hero.secondary} onStart={() => go(hero.primaryTo)} onBookings={() => go(hero.secondaryTo)}/>
    <section className="metric-grid"><MetricCard label="งานที่กำลังดำเนินการ" value={`${active.length} รายการ`} hint="รวมคำขอและนัดหมายที่ยังไม่ปิด" icon={CalendarClock} tone="sand"/><MetricCard label={technician ? 'งานที่เสร็จสิ้น' : 'คำขอที่รอเลือกช่าง'} value={`${technician ? completed.length : waiting.length} รายการ`} hint={technician ? 'ยืนยันการชำระเงินครบแล้ว' : 'เปิดรับช่างหรือกำลังเปรียบเทียบ'} icon={Wrench} tone="mint"/><MetricCard label="รอชำระเงิน" value={`${state.bookings.filter(b => b.status === 'รอชำระเงิน').length} รายการ`} hint="รอการยืนยันจากสองฝ่าย" icon={Clock3} tone="blue"/><MetricCard label={technician ? 'ค่าบริการงานที่ปิดแล้ว' : 'ค่าใช้บริการสะสม'} value={`฿${state.summary.totalSpent.toLocaleString()}`} hint="รวมเฉพาะรายการเสร็จสิ้น" icon={Wallet} tone="lavender"/></section>
    <div className="dashboard-grid"><section className="panel upcoming-panel"><div className="panel-heading"><div><h2>นัดหมายและคำขอของคุณ</h2><p>เรียงตามวันและเวลานัดหมาย</p></div><button className="text-button" onClick={() => onNavigate('bookings')}>ดูทั้งหมด <ChevronRight size={16}/></button></div><div className="booking-list">{upcoming.length === 0 ? <div className="empty-state compact"><CalendarClock size={25}/><strong>ยังไม่มีงานที่กำลังดำเนินการ</strong><span>{technician ? 'ค้นหางานใกล้ฉันเพื่อเริ่มส่งความสนใจ' : 'ส่งคำขอรับบริการเพื่อเริ่มหาช่างใกล้คุณ'}</span></div> : upcoming.map(b => <div className="booking-row" key={b.id}><div className="booking-date"><strong>{formatDate(b.date).split(' ')[0]}</strong><span>{formatDate(b.date).split(' ').slice(1).join(' ')}</span></div><div className="booking-row-main"><div className="booking-title-line"><strong>{b.service}</strong><StatusBadge status={b.status}/></div><span>{b.unitLabel}</span><div className="booking-meta"><span><Clock3 size={13}/>{b.time} น.</span><span><Wrench size={13}/>{b.technician}</span></div></div><button className="icon-button row-arrow" aria-label={`ดูรายการ ${b.code}`} onClick={() => onNavigate('bookings')}><ChevronRight size={18}/></button></div>)}</div><button className="outline-button full-width" onClick={primaryAction}>{technician ? 'ค้นหางานเพิ่มเติม' : 'สร้างคำขอใหม่'}<ArrowRight size={15}/></button></section>
      <section className="panel passport-summary-panel"><div className="panel-heading"><div><h2>{side.title}</h2><p>{side.sub}</p></div><MapPin size={24}/></div><div className="profile-summary-note">{side.note}</div><button className="outline-button full-width" onClick={() => onNavigate(side.to)}>{side.cta}<ArrowRight size={16}/></button></section></div>
    <section className="panel activity-panel"><div className="panel-heading"><div><h2>รายการล่าสุด</h2><p>แสดงจากข้อมูลการจองของบัญชีนี้</p></div></div><div className="activity-list">{[...state.bookings].sort((a, b) => b.id - a.id).slice(0, 4).map(b => <div className="activity-item" key={b.id}><div className="activity-icon booked"><CheckCircle2 size={16}/></div><div className="activity-copy"><strong>{b.code} · {b.service}</strong><span>{b.status} · {b.technician}</span></div><time>{formatDate(b.date)}</time></div>)}{!state.bookings.length && <div className="empty-state compact"><Wind size={24}/><strong>ยังไม่มีรายการ</strong><span>ข้อมูลจะปรากฏเมื่อเริ่มใช้งานบริการ</span></div>}</div></section>
  </div>;
}
