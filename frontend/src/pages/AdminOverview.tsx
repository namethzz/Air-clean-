import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, CalendarClock, ChevronRight, ClipboardList, Wind } from 'lucide-react';
import { timeLabel } from '../lib/time';
import HeroSection6 from '../components/ui/hero-section-6';
import { heroShots } from '../assets/hero';
import StatusBadge from '../components/StatusBadge';
import { EmptyState } from '../components/kit';
import { fetchAdminIssues, fetchAdminMembership, fetchTechnicianApplications, isApiConfigured } from '../lib/api';
import type { AppState, PageKey } from '../types';
import './Jobs.css';
import './Admin.css';

interface Queues { technicians: number | null; issues: number | null; slips: number | null; }

const day = (date: string) => new Date(date + 'T00:00:00');

/**
 * The admin's first page: the queues that wait on the admin come first, on the blue band, each orange while it has
 * work and one tap from its page; then the visits coming up and the latest requests.
 */
export default function AdminOverview({ state, userName, onNavigate, onOpenJob }: { state: AppState; userName: string; onNavigate: (page: PageKey) => void; onOpenJob: (id?: number) => void }) {
  const [queues, setQueues] = useState<Queues>({ technicians: null, issues: null, slips: null });
  useEffect(() => {
    if (!isApiConfigured()) return;
    let live = true;
    // Each count is shown as soon as it arrives; one that fails stays "—" rather than holding the others back.
    fetchTechnicianApplications().then(rows => { if (live) setQueues(q => ({ ...q, technicians: rows.filter(row => row.verificationStatus === 'Pending').length })); }).catch(() => undefined);
    fetchAdminIssues('open').then(rows => { if (live) setQueues(q => ({ ...q, issues: rows.length })); }).catch(() => undefined);
    fetchAdminMembership().then(data => { if (live) setQueues(q => ({ ...q, slips: data.payments.filter(row => row.status === 'Pending').length })); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const active = state.bookings.filter(b => !['เสร็จสิ้น', 'ยกเลิก', 'หมดเวลาเลือกช่าง'].includes(b.status));
  const upcoming = [...active].filter(b => !['เปิดรับช่าง', 'รอเลือกช่าง'].includes(b.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5);
  const latest = [...state.bookings].sort((a, b) => b.id - a.id).slice(0, 5);
  const flagged = state.bookings.filter(b => b.issue?.open || b.status === 'มีปัญหาการชำระเงิน').length;
  const waitingOnAdmin = (queues.technicians ?? 0) + (queues.issues ?? flagged) + (queues.slips ?? 0);
  const first: PageKey = (queues.issues ?? flagged) > 0 ? 'issues' : (queues.technicians ?? 0) > 0 ? 'approvals' : (queues.slips ?? 0) > 0 ? 'membership' : 'bookings';
  const cell = (label: string, value: number | null, page: PageKey, turn = true) =>
    <div className={turn && value ? 'is-turn' : ''}>
      <dt><button type="button" className="ad-queue" onClick={() => onNavigate(page)}>{label} <ChevronRight size={14} aria-hidden="true"/></button></dt>
      <dd className="ui-num">{value ?? '—'}</dd>
    </div>;

  return <div className="ad-home">
    <HeroSection6 variant="app" {...heroShots.admin}
      turn={waitingOnAdmin > 0}
      badge={waitingOnAdmin > 0 ? `มี ${waitingOnAdmin} เรื่องรอคุณ` : `สวัสดี ${userName}`}
      title="ภาพรวมแพลตฟอร์ม"
      text={`งานที่กำลังดำเนินการ ${active.length} รายการ · ช่างรอตรวจ ${queues.technicians ?? '—'} คน · สลิปรอตรวจ ${queues.slips ?? '—'} ใบ`}
      primary={first === 'bookings' ? { label: 'ดูรายการจอง', onClick: () => onNavigate('bookings'), icon: ClipboardList } : { label: first === 'issues' ? 'ดูเรื่องที่ถูกแจ้ง' : first === 'approvals' ? 'ตรวจสอบช่าง' : 'ตรวจสลิป', onClick: () => onNavigate(first), icon: ArrowRight, trailing: true }}
      secondary={{ label: 'ตรวจสอบช่าง', onClick: () => onNavigate('approvals'), icon: BadgeCheck }}/>

    <div className="ui-page ad">
      <dl className="jb-summary ad-summary" aria-label="งานที่รอผู้ดูแล">
        {cell('เรื่องที่ถูกแจ้ง', queues.issues ?? flagged, 'issues')}
        {cell('ช่างรอตรวจ', queues.technicians, 'approvals')}
        {cell('สลิปรอตรวจ', queues.slips, 'membership')}
        {cell('งานกำลังดำเนินการ', active.length, 'bookings', false)}
      </dl>

      <div className="ad-two">
        <section className="ui-card" aria-labelledby="ad-upcoming">
          <div className="ui-card-head">
            <div><h2 id="ad-upcoming">นัดที่กำลังจะมาถึง</h2><p>งานที่ช่างรับแล้ว เรียงตามวันนัด</p></div>
            <button type="button" className="ui-btn is-ghost is-sm" onClick={() => onNavigate('bookings')}>ดูทั้งหมด <ChevronRight size={16}/></button>
          </div>
          {upcoming.length === 0
            ? <EmptyState icon={CalendarClock} title="ยังไม่มีนัด">เมื่อลูกค้าเลือกช่างแล้ว นัดจะขึ้นที่นี่</EmptyState>
            : <ul className="jb-rows">{upcoming.map(b => <li key={b.id}>
              <button type="button" className="jb-row" onClick={() => onOpenJob(b.id)}>
                <span className="jb-date"><strong>{day(b.date).getDate()}</strong><small>{day(b.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
                <span className="jb-row-text"><strong>{b.service} · {b.unitCount || 1} เครื่อง</strong><span>{b.code} · {timeLabel(b)} · {b.technician}</span><StatusBadge status={b.status}/></span>
                <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
              </button>
            </li>)}</ul>}
        </section>

        <section className="ui-card" aria-labelledby="ad-latest">
          <div className="ui-card-head"><div><h2 id="ad-latest">คำขอล่าสุด</h2><p>ที่ลูกค้าส่งเข้ามาล่าสุด</p></div></div>
          {latest.length === 0
            ? <EmptyState icon={Wind} title="ยังไม่มีคำขอ">ข้อมูลจะขึ้นเมื่อเริ่มมีการใช้งาน</EmptyState>
            : <ul className="jb-rows">{latest.map(b => <li key={b.id}>
              <button type="button" className="jb-row" onClick={() => onOpenJob(b.id)}>
                <span className="jb-date"><strong>{day(b.date).getDate()}</strong><small>{day(b.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
                <span className="jb-row-text"><strong>{b.code} · {b.service}</strong><span>{b.customer || 'ลูกค้า'} · ฿{b.price.toLocaleString()}</span><StatusBadge status={b.status}/></span>
                <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
              </button>
            </li>)}</ul>}
        </section>
      </div>
    </div>
  </div>;
}
