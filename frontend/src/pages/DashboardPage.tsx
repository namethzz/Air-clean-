import { ArrowRight, BadgeCheck, CalendarClock, ClipboardList, CheckCircle2, ChevronRight, Clock3, MapPin, Wallet, Wind, Wrench } from 'lucide-react';
import { timeLabel } from '../lib/time';
import HeroSection6 from '../components/ui/hero-section-6';
import { heroShots } from '../assets/hero';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import CustomerHome from './CustomerHome';
import type { AppState, PageKey, UserRole } from '../types';
import './CustomerExperience.css';

interface Props {
  state: AppState;
  role: UserRole;
  userName: string;
  onNavigate: (page: PageKey) => void;
  onOpenJob: (id?: number) => void;
  onNewBooking: () => void;
}

function formatDate(value: string) {
  return new Date(value + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/**
 * The first page after signing in. Customers and building managers get their own home; technicians start on
 * "งานใกล้ฉัน" instead, so what is left here is the admin's overview of the platform.
 */
export default function DashboardPage({ state, role, userName, onNavigate, onOpenJob, onNewBooking }: Props) {
  if (role === 'customer' || role === 'manager') {
    return <CustomerHome role={role} bookings={state.bookings} reports={state.serviceReports} userName={userName} onNavigate={onNavigate} onOpenJob={onOpenJob} onNewBooking={onNewBooking}/>;
  }

  const active = state.bookings.filter(b => !['เสร็จสิ้น', 'ยกเลิก'].includes(b.status));
  const waiting = state.bookings.filter(b => ['เปิดรับช่าง', 'รอเลือกช่าง'].includes(b.status));
  const awaitingPayment = state.bookings.filter(b => b.status === 'รอชำระเงิน');
  const upcoming = [...active].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4);
  const latest = [...state.bookings].sort((a, b) => b.id - a.id).slice(0, 4);
  const flagged = state.bookings.filter(b => b.issue?.open || b.status === 'มีปัญหาการชำระเงิน').length;

  return <div className="page-stack ac-dashboard">
    <HeroSection6 variant="app" {...heroShots.admin}
      turn={flagged > 0}
      badge={flagged > 0 ? `มี ${flagged} เรื่องรอผู้ดูแลตรวจสอบ` : `สวัสดี ${userName}`}
      title="ภาพรวมแพลตฟอร์ม"
      text={`งานที่กำลังดำเนินการ ${active.length} รายการ · รอเลือกช่าง ${waiting.length} รายการ · รอชำระเงิน ${awaitingPayment.length} รายการ`}
      primary={flagged > 0 ? { label: 'ดูเรื่องที่ถูกแจ้ง', onClick: () => onNavigate('issues'), icon: ArrowRight, trailing: true } : { label: 'ดูรายการจอง', onClick: () => onNavigate('bookings'), icon: ClipboardList }}
      secondary={{ label: 'อนุมัติช่าง', onClick: () => onNavigate('approvals'), icon: BadgeCheck }}/>

    <section className="metric-grid">
      <MetricCard label="งานที่กำลังดำเนินการ" value={`${active.length} รายการ`} hint="รวมคำขอและนัดหมายที่ยังไม่ปิด" icon={CalendarClock} tone="sand"/>
      <MetricCard label="คำขอที่รอเลือกช่าง" value={`${waiting.length} รายการ`} hint="เปิดรับช่างหรือกำลังเปรียบเทียบ" icon={Wrench} tone="mint"/>
      <MetricCard label="รอชำระเงิน" value={`${awaitingPayment.length} รายการ`} hint="รอการยืนยันจากสองฝ่าย" icon={Clock3} tone="blue"/>
      <MetricCard label="ค่าบริการงานที่ปิดแล้ว" value={`฿${state.summary.totalSpent.toLocaleString()}`} hint="รวมเฉพาะรายการเสร็จสิ้น" icon={Wallet} tone="lavender"/>
    </section>

    <div className="dashboard-grid">
      <section className="panel upcoming-panel">
        <div className="panel-heading">
          <div><h2>นัดหมายที่กำลังจะมาถึง</h2><p>เรียงตามวันและเวลานัดหมาย</p></div>
          <button className="text-button" onClick={() => onNavigate('bookings')}>ดูทั้งหมด <ChevronRight size={16}/></button>
        </div>
        <div className="booking-list">
          {upcoming.length === 0
            ? <div className="empty-state compact"><CalendarClock size={25}/><strong>ยังไม่มีงานที่กำลังดำเนินการ</strong><span>งานใหม่จะแสดงที่นี่เมื่อลูกค้าส่งคำขอ</span></div>
            : upcoming.map(b => <div className="booking-row" key={b.id}>
              <div className="booking-date"><strong>{formatDate(b.date).split(' ')[0]}</strong><span>{formatDate(b.date).split(' ').slice(1).join(' ')}</span></div>
              <div className="booking-row-main">
                <div className="booking-title-line"><strong>{b.service}</strong><StatusBadge status={b.status}/></div>
                <span>{b.unitLabel}</span>
                <div className="booking-meta"><span><Clock3 size={13}/>{timeLabel(b)}</span><span><Wrench size={13}/>{b.technician}</span></div>
              </div>
              <button className="icon-button row-arrow" aria-label={`ดูรายการ ${b.code}`} onClick={() => onNavigate('bookings')}><ChevronRight size={18}/></button>
            </div>)}
        </div>
      </section>
      <section className="panel passport-summary-panel">
        <div className="panel-heading"><div><h2>ตรวจสอบภาพรวมระบบ</h2><p>รายการที่ต้องมีผู้ดูแลตรวจสอบ</p></div><MapPin size={24}/></div>
        <div className="profile-summary-note">ดูรายการจองและรายงานบริการ รวมถึงรายการที่ถูกแจ้งปัญหาการชำระเงินเพื่อให้ผู้ดูแลตรวจสอบ</div>
        <button className="outline-button full-width" onClick={() => onNavigate('issues')}>ดูเรื่องที่ถูกแจ้ง<ArrowRight size={16}/></button>
      </section>
    </div>

    <section className="panel activity-panel">
      <div className="panel-heading"><div><h2>รายการล่าสุด</h2><p>คำขอที่ส่งเข้ามาล่าสุดในระบบ</p></div></div>
      <div className="activity-list">
        {latest.map(b => <div className="activity-item" key={b.id}>
          <div className="activity-icon booked"><CheckCircle2 size={16}/></div>
          <div className="activity-copy"><strong>{b.code} · {b.service}</strong><span>{b.status} · {b.technician}</span></div>
          <time>{formatDate(b.date)}</time>
        </div>)}
        {!state.bookings.length && <div className="empty-state compact"><Wind size={24}/><strong>ยังไม่มีรายการ</strong><span>ข้อมูลจะปรากฏเมื่อเริ่มมีการใช้งาน</span></div>}
      </div>
    </section>
  </div>;
}
