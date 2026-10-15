import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Banknote, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink,
  MapPin, Plus, ShieldCheck, Smartphone, Star, Wind, Wrench,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import LocationMap from '../components/LocationMap';
import { currentStep, guideFor, isClosed, journeySteps, needsAction, sortJobs } from '../lib/jobFlow';
import type { Booking, BookingApplicant, BookingStatus, PaymentMethod, ServiceReportRecord } from '../types';
import './CustomerJobs.css';

export interface JobFocus { id: number; token: number; }
interface Props {
  bookings: Booking[];
  reports: ServiceReportRecord[];
  focus: JobFocus | null;
  onNewBooking: () => void;
  onSelectTechnician: (bookingId: number, technicianId: number) => Promise<boolean>;
  onStatusChange: (id: number, status: BookingStatus) => void;
  onPaymentConfirm: (id: number, method: PaymentMethod) => void;
  onPaymentIssue: (id: number, reason: string) => void;
  onApproveReport: (id: number) => Promise<boolean>;
  onRefresh: () => void;
}

const checklist = [
  { key: 'cleanedFilter', label: 'ทำความสะอาดแผ่นกรอง' },
  { key: 'cleanedCoil', label: 'ทำความสะอาดคอยล์' },
  { key: 'checkedDrain', label: 'ตรวจท่อน้ำทิ้ง' },
  { key: 'checkedCooling', label: 'ตรวจการทำงานของเครื่อง' },
] as const;

function shortDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}
function useIsWide() {
  const query = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setWide(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return wide;
}

/** Customer's single place for a job: offers, tracking, payment and the service report. */
export default function CustomerJobsPage(props: Props) {
  const { bookings, reports, focus, onNewBooking, onRefresh } = props;
  const wide = useIsWide();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const open = useMemo(() => sortJobs(bookings.filter(item => !isClosed(item)), reports), [bookings, reports]);
  const closed = useMemo(() => bookings.filter(isClosed).sort((a, b) => b.id - a.id), [bookings]);

  useEffect(() => {
    if (!focus) return;
    const target = bookings.find(item => item.id === focus.id);
    setSelectedId(focus.id);
    if (target) setTab(isClosed(target) ? 'closed' : 'open');
  }, [focus?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open.length) return;
    const timer = window.setInterval(onRefresh, 10000);
    return () => window.clearInterval(timer);
  }, [open.length, onRefresh]);

  const shown = tab === 'open' ? open : closed;
  const selected = bookings.find(item => item.id === selectedId) ?? (wide ? shown[0] : undefined);
  const actionCount = open.filter(item => needsAction(item, reports)).length;

  if (!bookings.length) {
    return <div className="cj-empty">
      <span className="cj-empty-icon"><Wind size={30}/></span>
      <h1>ยังไม่มีงานล้างแอร์</h1>
      <p>ส่งคำขอครั้งเดียว ช่างในพื้นที่ที่สนใจจะเสนอราคาให้คุณเลือก</p>
      <button type="button" className="cj-primary" onClick={onNewBooking}><Plus size={18}/> ขอช่างล้างแอร์</button>
    </div>;
  }

  return <div className={'cj-page' + (selected && !wide ? ' cj-show-detail' : '')}>
    <section className="cj-list" aria-label="รายการงาน">
      <div className="cj-list-head">
        <h1>งานของฉัน</h1>
        {actionCount > 0 && <span className="cj-action-pill">{actionCount} งานรอคุณ</span>}
      </div>
      <div className="cj-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>กำลังดำเนินการ <span>{open.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'closed'} className={tab === 'closed' ? 'active' : ''} onClick={() => setTab('closed')}>เสร็จสิ้นและยกเลิก <span>{closed.length}</span></button>
      </div>
      {shown.length === 0
        ? <p className="cj-list-empty">{tab === 'open' ? 'ไม่มีงานที่กำลังดำเนินการ' : 'ยังไม่มีงานที่ปิดแล้ว'}</p>
        : <ul>{shown.map(item => {
          const urgent = needsAction(item, reports);
          const guide = guideFor(item);
          return <li key={item.id}>
            <button type="button" className={'cj-row' + (selected?.id === item.id ? ' active' : '')} aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
              <span className="cj-row-date"><strong>{new Date(item.date + 'T00:00:00').getDate()}</strong><span>{new Date(item.date + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</span></span>
              <span className="cj-row-main">
                <strong>{item.service}{item.unitCount && item.unitCount > 1 ? ` · ${item.unitCount} เครื่อง` : ''}</strong>
                <span className={urgent ? 'cj-row-urgent' : ''}>{guide.short}</span>
                <small>{shortDate(item.date)} · {item.time} น.</small>
              </span>
              <ChevronRight size={18} aria-hidden="true"/>
            </button>
          </li>;
        })}</ul>}
      <button type="button" className="cj-add" onClick={onNewBooking}><Plus size={17}/> ขอช่างล้างแอร์</button>
    </section>

    <section className="cj-detail" aria-label="รายละเอียดงาน">
      {selected ? <JobDetail key={selected.id} {...props} booking={selected} onBack={() => setSelectedId(null)}/> : <p className="cj-pick">เลือกงานจากรายการเพื่อดูรายละเอียด</p>}
    </section>
  </div>;
}

function Stepper({ status }: { status: BookingStatus }) {
  const step = currentStep(status);
  return <ol className="cj-steps" aria-label="ความคืบหน้า">
    {journeySteps.map((label, index) => {
      const state = step === 5 || index < step ? 'done' : index === step ? 'current' : 'next';
      return <li key={label} className={'cj-step ' + state} aria-current={state === 'current' ? 'step' : undefined}>
        <span className="cj-step-dot">{state === 'done' ? <Check size={15} strokeWidth={3}/> : index + 1}</span>
        <span className="cj-step-label">{label}</span>
      </li>;
    })}
  </ol>;
}

function JobDetail({ booking, reports, onBack, onSelectTechnician, onStatusChange, onPaymentConfirm, onPaymentIssue, onApproveReport, onRefresh }: Props & { booking: Booking; onBack: () => void }) {
  const guide = guideFor(booking);
  const report = reports.find(item => item.bookingId === booking.id);
  const cancelled = booking.status === 'ยกเลิก';
  const choosing = booking.status === 'เปิดรับช่าง' || booking.status === 'รอเลือกช่าง';
  const hasTech = !choosing && !cancelled && booking.technician && booking.technician !== '-';
  const cancellable = choosing;

  return <article className="cj-article">
    <button type="button" className="cj-back" onClick={onBack}><ChevronLeft size={18}/> งานทั้งหมด</button>
    <header className="cj-head">
      <div><span className="cj-code">{booking.code}</span><h2>{booking.service}</h2><p>{shortDate(booking.date)} · {booking.time} น.</p></div>
      <StatusBadge status={booking.status}/>
    </header>

    {!cancelled && <Stepper status={booking.status}/>}

    <section className={'cj-now' + (needsAction(booking, reports) ? ' urgent' : '')}>
      <h3>{guide.title}</h3>
      <p>{guide.hint}</p>
      {choosing && <Offers booking={booking} onSelect={onSelectTechnician} onRefresh={onRefresh}/>}
      {(booking.status === 'กำลังเดินทาง' || booking.status === 'ถึงหน้างาน') && <Tracking booking={booking}/>}
      {(booking.status === 'รอชำระเงิน' || booking.status === 'มีปัญหาการชำระเงิน') && <Payment booking={booking} onConfirm={onPaymentConfirm} onIssue={onPaymentIssue}/>}
      {booking.status === 'เสร็จสิ้น' && <p className="cj-done"><CheckCircle2 size={18}/> ชำระแล้ว ฿{booking.price.toLocaleString()}</p>}
    </section>

    {hasTech && <section className="cj-block">
      <h3>ช่างของคุณ</h3>
      <div className="cj-person"><span className="cj-avatar">{booking.technicianInitials}</span><div><strong>{booking.technician}</strong>{booking.applicants?.find(item => item.selected) && <small>{booking.applicants.find(item => item.selected)!.title}</small>}</div></div>
    </section>}

    {report && <ReportBlock report={report} onApprove={onApproveReport}/>}

    <section className="cj-block">
      <h3>รายละเอียดงาน</h3>
      <dl className="cj-facts">
        <div><dt>สถานที่</dt><dd>{booking.address}</dd></div>
        <div><dt>ที่พักและแอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
        <div><dt>{choosing ? 'ราคาประเมินเริ่มต้น' : 'ราคาที่ตกลง'}</dt><dd>฿{booking.price.toLocaleString()} · ชำระหน้างาน</dd></div>
      </dl>
      {cancellable && <CancelRequest onConfirm={() => onStatusChange(booking.id, 'ยกเลิก')}/>}
    </section>
  </article>;
}

function Offers({ booking, onSelect, onRefresh }: { booking: Booking; onSelect: Props['onSelectTechnician']; onRefresh: () => void }) {
  const [sort, setSort] = useState<'price' | 'rating'>('price');
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const offers = [...(booking.applicants ?? [])].sort((a, b) => sort === 'price' ? a.quote - b.quote : b.rating - a.rating);
  const cheapest = offers.length > 1 ? Math.min(...offers.map(item => item.quote)) : null;

  if (!offers.length) return <div className="cj-wait"><Clock3 size={18}/><span>ยังไม่มีข้อเสนอ ระบบตรวจให้อัตโนมัติทุกไม่กี่วินาที</span></div>;

  async function choose(offer: BookingApplicant) {
    setBusy(true);
    const ok = await onSelect(booking.id, offer.technicianId);
    setBusy(false);
    setAsking(null);
    if (ok) onRefresh();
  }

  return <div className="cj-offers">
    {offers.length > 1 && <div className="cj-sort" role="group" aria-label="เรียงข้อเสนอ">
      <span>เรียงตาม</span>
      <button type="button" className={sort === 'price' ? 'active' : ''} aria-pressed={sort === 'price'} onClick={() => setSort('price')}>ราคาต่ำสุด</button>
      <button type="button" className={sort === 'rating' ? 'active' : ''} aria-pressed={sort === 'rating'} onClick={() => setSort('rating')}>คะแนนสูงสุด</button>
    </div>}
    <ul>{offers.map(offer => <li key={offer.technicianId} className="cj-offer">
      <div className="cj-offer-top">
        <span className="cj-avatar">{offer.initials}</span>
        <div className="cj-offer-who"><strong>{offer.name}{offer.verified && <ShieldCheck size={15} aria-label="ผ่านการยืนยันตัวตน"/>}</strong><small>{offer.title}</small></div>
        <div className="cj-offer-price"><strong>฿{offer.quote.toLocaleString()}</strong>{cheapest === offer.quote && <span>ต่ำสุด</span>}</div>
      </div>
      <p className="cj-offer-stats"><span><Star size={14} fill="currentColor"/> {offer.rating.toFixed(1)} ({offer.reviewCount} รีวิว)</span><span><Wrench size={14}/> {offer.jobsCompleted} งาน</span><span><MapPin size={14}/> {offer.area}</span></p>
      {offer.note && <p className="cj-offer-note">“{offer.note}”</p>}
      {asking === offer.technicianId
        ? <div className="cj-confirm" role="alertdialog" aria-label={`ยืนยันเลือก ${offer.name}`}>
          <p>เลือก {offer.name} ในราคา ฿{offer.quote.toLocaleString()} และเปิดที่อยู่เต็มให้ช่างคนนี้</p>
          <div><button type="button" className="cj-primary" disabled={busy} onClick={() => void choose(offer)}>{busy ? 'กำลังยืนยัน...' : 'ยืนยันเลือกช่างคนนี้'}</button><button type="button" className="cj-ghost" disabled={busy} onClick={() => setAsking(null)}>ยกเลิก</button></div>
        </div>
        : <button type="button" className="cj-primary full" disabled={busy || offer.selected} onClick={() => setAsking(offer.technicianId)}>เลือกช่างคนนี้ <ChevronRight size={16}/></button>}
    </li>)}</ul>
    <p className="cj-note"><ShieldCheck size={15}/> ราคานี้ช่างเป็นผู้เสนอ ยังไม่มีการเก็บเงินจนกว่างานจะเสร็จ</p>
  </div>;
}

function Tracking({ booking }: { booking: Booking }) {
  const hasDestination = booking.latitude != null && booking.longitude != null;
  const hasTech = booking.technicianLatitude != null && booking.technicianLongitude != null;
  const updated = booking.locationUpdatedAt ? new Date(booking.locationUpdatedAt) : null;
  const time = updated && !Number.isNaN(updated.getTime()) ? updated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : null;
  const mapsUrl = hasDestination
    ? `https://www.google.com/maps/dir/?api=1&destination=${booking.latitude},${booking.longitude}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.address)}&travelmode=driving`;
  if (!hasDestination) return <p className="cj-note">งานนี้ยังไม่มีพิกัดสำหรับแสดงแผนที่</p>;
  const destination = { latitude: booking.latitude!, longitude: booking.longitude!, label: 'สถานที่ให้บริการ', kind: 'destination' as const };
  const technician = hasTech ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude!, label: booking.technician, kind: 'technician' as const } : undefined;
  return <div className="cj-track">
    <LocationMap key={booking.id} center={technician ?? destination} destination={destination} technician={technician} accuracy={booking.locationAccuracy ?? undefined} height={260} zoom={14}/>
    <p className="cj-note">{technician ? (time ? `ตำแหน่งช่างอัปเดตล่าสุด ${time} น.` : 'มีตำแหน่งช่างแล้ว') : 'รอช่างแชร์ตำแหน่ง ต้องให้ช่างเปิดหน้าแอปและอนุญาต GPS'}</p>
    <a className="cj-ghost" href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/> เปิดใน Google Maps</a>
  </div>;
}

function Payment({ booking, onConfirm, onIssue }: { booking: Booking; onConfirm: Props['onPaymentConfirm']; onIssue: Props['onPaymentIssue'] }) {
  const [method, setMethod] = useState<PaymentMethod>(booking.paymentMethod ?? 'Cash');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const underReview = booking.status === 'มีปัญหาการชำระเงิน';
  const youPaid = Boolean(booking.customerConfirmedPayment);
  const techGotIt = Boolean(booking.technicianConfirmedPayment);
  return <div className="cj-pay">
    <p className="cj-amount">฿{booking.price.toLocaleString()}</p>
    {!underReview && !youPaid && <div className="cj-methods" role="group" aria-label="วิธีชำระเงิน">
      <button type="button" className={method === 'Cash' ? 'active' : ''} aria-pressed={method === 'Cash'} onClick={() => setMethod('Cash')}><Banknote size={17}/> เงินสด</button>
      <button type="button" className={method === 'PromptPay' ? 'active' : ''} aria-pressed={method === 'PromptPay'} onClick={() => setMethod('PromptPay')}><Smartphone size={17}/> PromptPay</button>
    </div>}
    <ul className="cj-checks">
      <li className={youPaid ? 'ok' : ''}><CheckCircle2 size={17}/> {youPaid ? 'คุณยืนยันว่าชำระแล้ว' : 'รอคุณยืนยันการชำระเงิน'}</li>
      <li className={techGotIt ? 'ok' : ''}><CheckCircle2 size={17}/> {techGotIt ? 'ช่างยืนยันว่าได้รับเงินแล้ว' : 'รอช่างยืนยันว่าได้รับเงิน'}</li>
    </ul>
    {!underReview && !youPaid && <button type="button" className="cj-primary full" onClick={() => onConfirm(booking.id, method)}>ฉันชำระเงินแล้ว <Check size={17}/></button>}
    {!underReview && (reporting
      ? <div className="cj-confirm">
        <label htmlFor={`issue-${booking.id}`}>เกิดปัญหาอะไรกับการชำระเงิน</label>
        <textarea id={`issue-${booking.id}`} rows={3} value={reason} maxLength={500} onChange={event => setReason(event.target.value)}/>
        <div><button type="button" className="cj-primary" disabled={!reason.trim()} onClick={() => { onIssue(booking.id, reason.trim()); setReporting(false); }}>ส่งให้ผู้ดูแลตรวจสอบ</button><button type="button" className="cj-ghost" onClick={() => setReporting(false)}>ยกเลิก</button></div>
      </div>
      : <button type="button" className="cj-link" onClick={() => setReporting(true)}><AlertTriangle size={15}/> แจ้งปัญหาการชำระเงิน</button>)}
    <p className="cj-note">ระบบบันทึกการยืนยันจากลูกค้าและช่างเท่านั้น ยังไม่ได้ตรวจยอดโอน PromptPay กับธนาคาร</p>
  </div>;
}

function ReportBlock({ report, onApprove }: { report: ServiceReportRecord; onApprove: (id: number) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function approve() {
    setBusy(true); setFailed(false);
    const ok = await onApprove(report.id);
    setBusy(false);
    if (!ok) setFailed(true);
  }
  return <section className={'cj-block' + (report.customerApproved ? '' : ' cj-report-open')}>
    <h3>รายงานจากช่าง</h3>
    <p className="cj-report-summary">{report.summary}</p>
    <ul className="cj-checklist">{checklist.map(item => <li key={item.key} className={report[item.key] ? 'ok' : ''}><Check size={15} strokeWidth={3}/> {item.label}</li>)}</ul>
    {(report.beforePhotoUrl || report.afterPhotoUrl) && <p className="cj-photos">{report.beforePhotoUrl && <a href={report.beforePhotoUrl} target="_blank" rel="noreferrer">ดูภาพก่อนทำ</a>}{report.afterPhotoUrl && <a href={report.afterPhotoUrl} target="_blank" rel="noreferrer">ดูภาพหลังทำ</a>}</p>}
    {report.customerApproved
      ? <p className="cj-done"><CheckCircle2 size={18}/> คุณยืนยันรายงานแล้ว</p>
      : <button type="button" className="cj-primary full" disabled={busy} onClick={() => void approve()}>{busy ? 'กำลังยืนยัน...' : 'ยืนยันว่าตรวจรายงานแล้ว'} <ShieldCheck size={16}/></button>}
    {failed && <p className="cj-error" role="alert">ยืนยันรายงานไม่สำเร็จ ลองอีกครั้ง</p>}
  </section>;
}

function CancelRequest({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="cj-link danger" onClick={() => setAsking(true)}>ยกเลิกคำขอนี้</button>;
  return <div className="cj-confirm" role="alertdialog" aria-label="ยืนยันยกเลิกคำขอ">
    <p>ยกเลิกคำขอนี้? ช่างที่เสนอราคาไว้จะไม่เห็นงานอีก</p>
    <div><button type="button" className="cj-danger" onClick={onConfirm}>ยกเลิกคำขอ</button><button type="button" className="cj-ghost" onClick={() => setAsking(false)}>เก็บไว้</button></div>
  </div>;
}
