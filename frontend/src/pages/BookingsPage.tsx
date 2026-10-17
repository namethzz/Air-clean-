import { timeLabel } from '../lib/time';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, CheckCircle2, ChevronRight, Clock3, MapPin, Navigation, Plus, RefreshCw, SlidersHorizontal, Star, Wallet, Wrench } from 'lucide-react';
import type { Booking, BookingStatus, UserRole } from '../types';
import StatusBadge from '../components/StatusBadge';
import Avatar from '../components/Avatar';
import { EmptyState, PageHead } from '../components/kit';
import './Jobs.css';
import './Admin.css';

interface Props { bookings: Booking[]; role: UserRole; searchQuery: string; onNewBooking: () => void; onOpenJob: (id: number) => void; onStatusChange: (id: number, status: BookingStatus) => void; onSelectTechnician:(bookingId:number,technicianId:number)=>Promise<boolean>; onRefresh:()=>void; }
const tabs = ['ทั้งหมด', 'เปิดรับช่าง', 'รอเลือกช่าง', 'รอยืนยัน', 'ยืนยันแล้ว', 'กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ', 'รอชำระเงิน', 'มีปัญหาการชำระเงิน', 'เสร็จสิ้น', 'ยกเลิก'] as const;
const PAGE = 20;
const running: BookingStatus[] = ['ยืนยันแล้ว', 'กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ', 'รอชำระเงิน'];
function thaiDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }

/**
 * Every booking, for the admin at a desk: the band counts what is waiting, chips filter by status, and a plain
 * table lists the jobs (rows stack on a phone). The admin can move a job on when supporting a technician, and
 * pick a technician for a customer who asks for help; both are kept out of the way.
 */
export default function BookingsPage({ bookings, role, searchQuery, onNewBooking, onOpenJob, onStatusChange, onSelectTechnician, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<string>('ทั้งหมด');
  const [sortNewest, setSortNewest] = useState(true);
  // A page of rows at a time; a new filter or search starts again from the top.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [activeTab, sortNewest, searchQuery]);
  const filtered = useMemo(() => bookings.filter(booking => (activeTab === 'ทั้งหมด' || booking.status === activeTab) && `${booking.code} ${booking.service} ${booking.technician} ${booking.customer} ${booking.unitLabel}`.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id), [bookings, activeTab, sortNewest, searchQuery]);
  const countFor = (tab: string) => tab === 'ทั้งหมด' ? bookings.length : bookings.filter(booking => booking.status === tab).length;
  const waiting = bookings.filter(booking => booking.status === 'เปิดรับช่าง' || booking.status === 'รอเลือกช่าง');
  const problems = countFor('มีปัญหาการชำระเงิน');
  const [selectingKey, setSelectingKey] = useState('');
  useEffect(() => {
    if (role !== 'customer' && role !== 'manager') return;
    const timer = window.setInterval(onRefresh, 12000);
    return () => window.clearInterval(timer);
  }, [role, onRefresh]);

  /** The step the admin may take for the technician, on a small button; finished or waiting jobs open tracking. */
  function actionFor(booking: Booking) {
    const step = (label: string, status: BookingStatus, icon?: React.ReactNode) => <button type="button" className="ui-btn is-sm" onClick={() => onStatusChange(booking.id, status)}>{icon}{label}</button>;
    switch (booking.status) {
      case 'รอยืนยัน': return step('รับงานแทนช่าง', 'ยืนยันแล้ว');
      case 'ยืนยันแล้ว': return step('เริ่มเดินทาง', 'กำลังเดินทาง', <Navigation size={15}/>);
      case 'กำลังเดินทาง': return step('ถึงหน้างาน', 'ถึงหน้างาน');
      case 'ถึงหน้างาน': return step('เริ่มงาน', 'กำลังดำเนินการ');
      case 'กำลังดำเนินการ': return step('งานเสร็จ', 'รอชำระเงิน');
      case 'รอชำระเงิน': return <button type="button" className="ui-btn is-sm" onClick={() => onOpenJob(booking.id)}><Wallet size={15}/> ดูการชำระ</button>;
      default: return <button type="button" className="ui-btn is-ghost is-sm" aria-label={`ดูงาน ${booking.code}`} onClick={() => onOpenJob(booking.id)}><ChevronRight size={18}/></button>;
    }
  }

  return <div className="ui-page ad">
    <PageHead title="รายการจองทั้งหมด" actions={<>
      <button type="button" className="ui-btn" onClick={onRefresh}><RefreshCw size={17}/> โหลดใหม่</button>
      <button type="button" className="ui-btn" onClick={onNewBooking}><Plus size={17}/> สร้างคำขอใหม่</button>
    </>}>ทุกงานในระบบ ตั้งแต่เปิดรับช่างจนปิดงาน ลูกค้าจ่ายช่างโดยตรง งานปิดเมื่อทั้งสองฝ่ายยืนยันการชำระเงิน หรือ 3 วันหลังช่างยืนยันถ้าลูกค้าไม่แจ้งปัญหา</PageHead>

    <dl className="jb-summary ad-summary">
      <div><dt>ทั้งหมด</dt><dd className="ui-num">{bookings.length}</dd></div>
      <div><dt>รอเลือกช่าง</dt><dd className="ui-num">{waiting.length}</dd></div>
      <div><dt>กำลังดำเนินการ</dt><dd className="ui-num">{bookings.filter(booking => running.includes(booking.status)).length}</dd></div>
      <div className={problems ? 'is-turn' : ''}><dt>มีปัญหาการชำระเงิน</dt><dd className="ui-num">{problems}</dd></div>
    </dl>

    <section className="ui-card ad-table-card" aria-labelledby="ad-bookings">
      <div className="ui-card-head">
        <div><h2 id="ad-bookings">{activeTab === 'ทั้งหมด' ? 'ทุกสถานะ' : activeTab}</h2><p>แสดง {filtered.length} จาก {bookings.length} รายการ{searchQuery ? ` · ค้นหา “${searchQuery}”` : ''}</p></div>
        <button type="button" className="ui-btn is-sm" onClick={() => setSortNewest(value => !value)}><ArrowDownUp size={15}/> {sortNewest ? 'ใหม่ไปเก่า' : 'เก่าไปใหม่'}</button>
      </div>
      <div className="ad-chips" role="group" aria-label="กรองตามสถานะ">
        {tabs.filter(tab => tab === 'ทั้งหมด' || countFor(tab) > 0).map(tab => <button type="button" key={tab} className="ui-chip" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab} <b className="ui-num">{countFor(tab)}</b></button>)}
      </div>
      {filtered.length === 0
        ? <EmptyState icon={SlidersHorizontal} title="ไม่มีรายการในหมวดนี้">ลองเลือกสถานะอื่น หรือล้างคำค้นหา</EmptyState>
        : <table className="ad-table">
          <thead><tr><th scope="col">งาน</th><th scope="col">วันนัด</th><th scope="col">ลูกค้า / ช่าง</th><th scope="col" className="is-num">ราคา</th><th scope="col">สถานะ</th><th scope="col"><span className="sr-only">ทำต่อ</span></th></tr></thead>
          <tbody>{filtered.slice(0, shown).map(booking => <tr key={booking.id}>
            <td data-label="งาน"><span className="ad-code ui-num">{booking.code}</span><strong>{booking.service}</strong><small>{booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</small></td>
            <td data-label="วันนัด"><span className="ui-num">{thaiDate(booking.date)}</span><small><Clock3 size={12} aria-hidden="true"/> {timeLabel(booking)}</small></td>
            <td data-label="ลูกค้า / ช่าง"><strong>{booking.customer || '—'}</strong><small><Wrench size={12} aria-hidden="true"/> {booking.technician}</small><small><MapPin size={12} aria-hidden="true"/> {booking.address}</small></td>
            <td data-label="ราคา" className="is-num ui-num">฿{booking.price.toLocaleString()}</td>
            <td data-label="สถานะ"><StatusBadge status={booking.status}/></td>
            <td className="ad-act">{actionFor(booking)}</td>
          </tr>)}</tbody>
        </table>}
      {filtered.length > shown && <button type="button" className="ui-btn is-block" onClick={() => setShown(value => value + PAGE)}>แสดงอีก {Math.min(PAGE, filtered.length - shown)} รายการ (เหลือ {filtered.length - shown})</button>}
    </section>

    {waiting.length > 0 && <details className="ui-card ad-waiting">
      <summary><span><strong>งานที่รอลูกค้าเลือกช่าง</strong> <b className="ui-num">{waiting.length}</b></span><small>เลือกช่างแทนลูกค้าได้เมื่อลูกค้าขอให้ช่วย</small></summary>
      <ul className="ad-waiting-list">{waiting.map(booking => <li key={booking.id}>
        <div className="ad-waiting-head"><span className="ad-code ui-num">{booking.code}</span><strong>{booking.service}</strong><StatusBadge status={booking.status}/></div>
        <p>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง · {thaiDate(booking.date)} {timeLabel(booking)} · {booking.address}</p>
        {!booking.applicants?.length
          ? <p className="jb-note"><Clock3 size={16}/> ยังไม่มีช่างเสนอราคา</p>
          : <ul className="ad-offers">{booking.applicants.map(applicant => <li key={applicant.technicianId}>
            <span className="ad-offer-avatar" aria-hidden="true"><Avatar name={applicant.name} photoId={applicant.photoId}/></span>
            <span className="ad-offer-text"><strong>{applicant.name} · <span className="ui-num">฿{applicant.quote.toLocaleString()}</span></strong><small><Star size={12} aria-hidden="true"/> {applicant.rating.toFixed(1)} ({applicant.reviewCount}) · {applicant.jobsCompleted} งาน · {applicant.area}</small></span>
            <button type="button" className="ui-btn is-sm" disabled={applicant.selected || selectingKey !== ''}
              onClick={async () => { setSelectingKey(booking.id + ':' + applicant.technicianId); const success = await onSelectTechnician(booking.id, applicant.technicianId); setSelectingKey(''); if (success) onRefresh(); }}>
              {selectingKey === booking.id + ':' + applicant.technicianId ? 'กำลังยืนยัน…' : applicant.selected ? <><CheckCircle2 size={15}/> เลือกแล้ว</> : 'เลือกแทนลูกค้า'}
            </button>
          </li>)}</ul>}
      </li>)}</ul>
    </details>}
  </div>;
}
