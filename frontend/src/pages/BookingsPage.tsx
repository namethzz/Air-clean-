import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, CalendarDays, CheckCircle2, ChevronRight, Clock3, MapPin, Navigation, Plus, ShieldCheck, SlidersHorizontal, Star, Wallet, Wrench } from 'lucide-react';
import type { Booking, BookingStatus, PageKey, UserRole } from '../types';
import StatusBadge from '../components/StatusBadge';
interface Props { bookings: Booking[]; role: UserRole; searchQuery: string; onNewBooking: () => void; onNavigate: (page: PageKey) => void; onStatusChange: (id: number, status: BookingStatus) => void; onSelectTechnician:(bookingId:number,technicianId:number)=>Promise<boolean>; onRefresh:()=>void; }
const tabs = ['ทั้งหมด', 'เปิดรับช่าง', 'รอเลือกช่าง', 'รอยืนยัน', 'ยืนยันแล้ว', 'กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ', 'รอชำระเงิน', 'มีปัญหาการชำระเงิน', 'เสร็จสิ้น', 'ยกเลิก'] as const;
function thaiDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); }
export default function BookingsPage({ bookings, role, searchQuery, onNewBooking, onNavigate, onStatusChange, onSelectTechnician, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<string>('ทั้งหมด'); const [sortNewest, setSortNewest] = useState(true);
  const filtered = useMemo(() => bookings.filter((booking) => (activeTab === 'ทั้งหมด' || booking.status === activeTab) && `${booking.code} ${booking.service} ${booking.technician} ${booking.unitLabel}`.toLowerCase().includes(searchQuery.toLowerCase())).sort((a,b) => sortNewest ? b.id-a.id : a.id-b.id), [bookings, activeTab, sortNewest, searchQuery]);
  const countFor = (tab: string) => tab === 'ทั้งหมด' ? bookings.length : bookings.filter((booking) => booking.status === tab).length;
  const candidateBookings = bookings.filter(booking => booking.status === 'เปิดรับช่าง' || booking.status === 'รอเลือกช่าง');
  const [selectingKey,setSelectingKey] = useState('');
  useEffect(() => {
    if (role !== 'customer' && role !== 'manager') return;
    const timer = window.setInterval(onRefresh, 12000);
    return () => window.clearInterval(timer);
  }, [role,onRefresh]);
  function actionFor(booking: Booking) {
    if (role !== 'technician' && role !== 'admin') {
      if (booking.status === 'เปิดรับช่าง' || booking.status === 'รอเลือกช่าง') return <span className="table-secondary">{booking.applicants?.length ? 'มีช่างสนใจ '+booking.applicants.length+' คน' : 'กำลังรอช่างสนใจ'}</span>;
      if (booking.status === 'กำลังเดินทาง' || booking.status === 'รอชำระเงิน' || booking.status === 'มีปัญหาการชำระเงิน') return <button className="table-action-button" onClick={() => onNavigate('tracking')}>{booking.status === 'รอชำระเงิน' ? <Wallet size={13}/> : <Navigation size={13}/>} {booking.status === 'รอชำระเงิน' ? 'ชำระหน้างาน' : 'ติดตามช่าง'} <ChevronRight size={14}/></button>;
      return <button className="icon-button table-view-button" aria-label="ดูรายละเอียด" title="ดูรายละเอียด" onClick={() => onNavigate('tracking')}><ChevronRight size={17}/></button>;
    }
    if (booking.status === 'รอยืนยัน') return <button className="table-action-button" onClick={() => onStatusChange(booking.id,'ยืนยันแล้ว')}>รับงาน <ChevronRight size={14}/></button>;
    if (booking.status === 'ยืนยันแล้ว') return <button className="table-action-button" onClick={() => onStatusChange(booking.id,'กำลังเดินทาง')}><Navigation size={13}/> เริ่มเดินทาง</button>;
    if (booking.status === 'กำลังเดินทาง') return <button className="table-action-button" onClick={() => onStatusChange(booking.id,'ถึงหน้างาน')}>ถึงหน้างาน <ChevronRight size={14}/></button>;
    if (booking.status === 'ถึงหน้างาน') return <button className="table-action-button" onClick={() => onStatusChange(booking.id,'กำลังดำเนินการ')}>เริ่มงาน <ChevronRight size={14}/></button>;
    if (booking.status === 'กำลังดำเนินการ') return <button className="table-action-button" onClick={() => onStatusChange(booking.id,'รอชำระเงิน')}>งานเสร็จแล้ว <ChevronRight size={14}/></button>;
    if (booking.status === 'รอชำระเงิน') return <button className="table-action-button" onClick={() => onNavigate('tracking')}><Wallet size={13}/> ยืนยันรับเงิน</button>;
    return <button className="icon-button table-view-button" aria-label="ดูรายละเอียด" title="ดูรายละเอียด" onClick={() => onNavigate('tracking')}><ChevronRight size={17}/></button>;
  }
  return <div className="page-stack">
    <div className="page-heading-row"><div><div className="eyebrow">BOOKING MANAGEMENT</div><h1>การจองของฉัน</h1><p className="page-subtitle">ติดตามนัดหมาย ระหว่างเดินทาง ไปถึงหน้างาน และปิดงานหลังชำระเงิน</p></div><button className="primary-button" onClick={onNewBooking}><Plus size={17}/> จองบริการใหม่</button></div>
    <div className="booking-summary-strip"><div><span className="summary-dot summary-dot-teal"/><strong>{countFor('ยืนยันแล้ว')}</strong><span>ยืนยันนัดแล้ว</span></div><div><span className="summary-dot summary-dot-amber"/><strong>{countFor('รอยืนยัน')}</strong><span>รอตอบรับ</span></div><div><span className="summary-dot summary-dot-green"/><strong>{countFor('รอชำระเงิน')}</strong><span>รอชำระเงิน</span></div><div className="summary-strip-note"><CalendarDays size={16}/> รับงาน เดินทาง และปิดภารกิจในขั้นตอนเดียว</div></div>
    <section className="panel bookings-table-panel"><div className="panel-heading"><div><h2>รายการจองทั้งหมด</h2><p>รหัสการจองและข้อมูลนัดหมายล่าสุด</p></div><button className="outline-button small-outline" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={15}/> {sortNewest ? 'ใหม่ไปเก่า' : 'เก่าไปใหม่'}</button></div>
      <div className="booking-tabs">{tabs.map((tab) => <button className={activeTab===tab?'active':''} key={tab} onClick={() => setActiveTab(tab)}>{tab}<span>{countFor(tab)}</span></button>)}</div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>รหัส / บริการ</th><th>วันและเวลา</th><th>ช่างผู้ให้บริการ</th><th>ราคา</th><th>สถานะ</th><th>การจัดการ</th></tr></thead><tbody>{filtered.map((booking) => <tr key={booking.id}><td><div className="booking-code">{booking.code}</div><strong>{booking.service}</strong><small className="table-secondary">{booking.unitLabel}</small></td><td><div className="table-date">{thaiDate(booking.date)}</div><small className="table-secondary"><Clock3 size={12}/> {booking.time} น.</small></td><td><div className="table-technician"><span className="avatar avatar-small">{booking.technicianInitials}</span><div><strong>{booking.technician}</strong><small><MapPin size={11}/> {booking.address}</small></div></div></td><td className="table-price">฿{booking.price.toLocaleString()}</td><td><StatusBadge status={booking.status}/></td><td>{actionFor(booking)}</td></tr>)}</tbody></table></div>
      {filtered.length===0 && <div className="empty-state"><SlidersHorizontal size={24}/><strong>ไม่มีรายการในหมวดนี้</strong><span>เมื่อมีรายการจองใหม่ จะแสดงข้อมูลที่นี่</span></div>}
      <div className="table-footer"><span>แสดง {filtered.length} จาก {bookings.length} รายการ</span><span>V.2 · ชำระหน้างาน</span></div>
    </section>

    {(role === 'customer' || role === 'manager' || role === 'admin') && <section className="panel interested-technicians-panel">
      <div className="panel-heading"><div><h2>ช่างที่สนใจรับงานของคุณ</h2><p>เปรียบเทียบคะแนน ประสบการณ์ และราคาที่เสนอ ก่อนกดยืนยันช่าง</p></div><button className="outline-button small-outline" onClick={onRefresh}><CheckCircle2 size={15}/> ตรวจสอบล่าสุด</button></div>
      {candidateBookings.length===0 ? <div className="empty-state compact"><Wrench size={24}/><strong>ยังไม่มีคำขอที่รอเลือกช่าง</strong><span>เมื่อช่างส่งความสนใจ รายชื่อและราคาจะปรากฏในส่วนนี้โดยอัตโนมัติ</span></div> : <div className="candidate-request-list">
        {candidateBookings.map(booking => <article className="candidate-request" key={booking.id}>
          <div className="candidate-request-heading"><div><span className="booking-code">{booking.code}</span><h3>{booking.service}</h3><p>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง · {thaiDate(booking.date)} เวลา {booking.time} น.</p><p className="candidate-request-address"><MapPin size={13}/>{booking.address}</p></div><StatusBadge status={booking.status}/></div>
          {(!booking.applicants || booking.applicants.length===0) ? <div className="candidate-waiting"><Clock3 size={17}/><div><strong>เปิดรับช่างใกล้เคียงแล้ว</strong><span>ระบบจะตรวจสอบรายชื่อช่างที่สนใจเป็นระยะ คุณไม่จำเป็นต้องเลือกช่างตอนสร้างคำขอ</span></div></div> :
          <div className="candidate-technician-grid">{booking.applicants.map(applicant => <div className="candidate-technician-card" key={applicant.technicianId}>
            <div className="candidate-tech-head"><span className="avatar avatar-small">{applicant.initials}</span><div><strong>{applicant.name}</strong><small>{applicant.title}</small></div>{applicant.verified && <ShieldCheck size={16} className="candidate-verified"/>}</div>
            <div className="candidate-tech-stats"><span><Star size={14} fill="currentColor"/>{applicant.rating.toFixed(1)} ({applicant.reviewCount})</span><span><Wrench size={14}/>{applicant.jobsCompleted} งาน</span></div>
            <div className="candidate-tech-area"><MapPin size={13}/>{applicant.area}</div>
            {applicant.note && <p className="candidate-tech-note">“{applicant.note}”</p>}
            <div className="candidate-tech-price"><span>{applicant.selected?'ช่างที่ยืนยันแล้ว':'ราคาที่เสนอ'}</span><strong>฿{applicant.quote.toLocaleString()}</strong></div>
            <button className={applicant.selected?'outline-button full-width':'primary-button full-width'} disabled={applicant.selected || booking.status==='ยืนยันแล้ว' || selectingKey!==''} onClick={async()=>{setSelectingKey(booking.id+':'+applicant.technicianId);const success=await onSelectTechnician(booking.id,applicant.technicianId);setSelectingKey('');if(success)onRefresh();}}>
              {selectingKey===booking.id+':'+applicant.technicianId?'กำลังยืนยัน...':applicant.selected?'ช่างที่เลือกแล้ว':'ยืนยันช่างคนนี้'}{applicant.selected?<CheckCircle2 size={15}/>:<ChevronRight size={15}/>}
            </button>
          </div>)}</div>}
        </article>)}
      </div>}
    </section>}
    <div className="info-callout"><Wrench size={19}/><div><strong>ภารกิจจะเสร็จสิ้นเมื่อทั้งสองฝ่ายยืนยันการชำระเงิน</strong><span>การยืนยันใน V.2 เป็นการบันทึกจากลูกค้าและช่าง ยังไม่มีการตรวจสอบธุรกรรม PromptPay ผ่านธนาคารอัตโนมัติ</span></div></div>
  </div>;
}