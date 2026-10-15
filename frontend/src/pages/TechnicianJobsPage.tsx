import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Banknote, Check, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, MapPin, Navigation, Smartphone, Wrench } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import LocationMap from '../components/LocationMap';
import Stepper, { useIsWide } from '../components/JobStepper';
import { isClosed, sortByNeed, techGuide, techNeedsAction, techStep, techSteps } from '../lib/jobFlow';
import type { CreateServiceReportPayload } from '../lib/api';
import type { Booking, BookingStatus, PaymentMethod, ServiceReportRecord } from '../types';
import type { JobFocus } from './CustomerJobsPage';
import './CustomerJobs.css';

interface Props {
  bookings: Booking[];
  reports: ServiceReportRecord[];
  focus: JobFocus | null;
  onFindJobs: () => void;
  onStatusChange: (id: number, status: BookingStatus) => void;
  onLocationUpdate: (id: number, latitude: number, longitude: number, accuracy?: number) => Promise<boolean>;
  onPaymentConfirm: (id: number, method: PaymentMethod) => void;
  onPaymentIssue: (id: number, reason: string) => void;
  onCreateReport: (payload: CreateServiceReportPayload) => Promise<boolean>;
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
function mapsLink(booking: Booking) {
  const target = booking.latitude != null && booking.longitude != null ? `${booking.latitude},${booking.longitude}` : encodeURIComponent(booking.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${target}&travelmode=driving`;
}

/** Sends the technician's position every few seconds while the job is "on the way". */
function useShareLocation(booking: Booking, onLocationUpdate: Props['onLocationUpdate']) {
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const traveling = booking.status === 'กำลังเดินทาง';
  const id = booking.id;
  useEffect(() => {
    if (!traveling) { setMessage(''); return; }
    if (!navigator.geolocation) { setMessage('อุปกรณ์นี้ไม่รองรับ GPS ผ่านเบราว์เซอร์'); return; }
    let lastSentAt = 0;
    let pending = false;
    let disposed = false;
    let latest: GeolocationPosition | null = null;
    async function send() {
      if (!latest || pending || disposed) return;
      if (Date.now() - latest.timestamp > 30000) { setMessage('พิกัดไม่อัปเดต กรุณาเปิดหน้านี้ไว้และตรวจสอบ GPS'); return; }
      pending = true;
      const coords = latest.coords;
      const sent = await onLocationUpdate(id, coords.latitude, coords.longitude, coords.accuracy);
      pending = false;
      if (disposed) return;
      lastSentAt = Date.now();
      setMessage(sent ? `ส่งตำแหน่งแล้ว · ความแม่นยำประมาณ ${Math.round(coords.accuracy)} เมตร` : 'ส่งตำแหน่งไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต ระบบจะลองใหม่');
    }
    setMessage('กำลังขออนุญาตใช้ตำแหน่งจากอุปกรณ์…');
    const watchId = navigator.geolocation.watchPosition(
      position => { latest = position; if (Date.now() - lastSentAt >= 8000) void send(); },
      error => { latest = null; setMessage(error.code === 1 ? 'ยังไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS ในเบราว์เซอร์' : 'รับตำแหน่ง GPS ไม่สำเร็จ ตรวจสอบการตั้งค่าตำแหน่งและลองอีกครั้ง'); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    const heartbeat = window.setInterval(() => { void send(); }, 8000);
    return () => { disposed = true; window.clearInterval(heartbeat); navigator.geolocation.clearWatch(watchId); };
  }, [traveling, id, onLocationUpdate, attempt]);
  return { message, retry: () => setAttempt(value => value + 1) };
}

/** Technician's single place for confirmed jobs: travel, GPS, report and getting paid. */
export default function TechnicianJobsPage(props: Props) {
  const { bookings, focus, onFindJobs, onRefresh } = props;
  const wide = useIsWide();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const open = useMemo(() => sortByNeed(bookings.filter(item => !isClosed(item)), techNeedsAction), [bookings]);
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
  const actionCount = open.filter(techNeedsAction).length;

  if (!bookings.length) {
    return <div className="cj-empty">
      <span className="cj-empty-icon"><Wrench size={30}/></span>
      <h1>ยังไม่มีงานที่ได้รับ</h1>
      <p>ดูงานใกล้ตัวแล้วกดสนใจ เมื่อลูกค้าเลือกคุณ งานจะมาอยู่ที่นี่พร้อมที่อยู่และปุ่มเริ่มเดินทาง</p>
      <button type="button" className="cj-primary" onClick={onFindJobs}><MapPin size={18}/> ดูงานใกล้ฉัน</button>
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
          const urgent = techNeedsAction(item);
          return <li key={item.id}>
            <button type="button" className={'cj-row' + (selected?.id === item.id ? ' active' : '')} aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
              <span className="cj-row-date"><strong>{new Date(item.date + 'T00:00:00').getDate()}</strong><span>{new Date(item.date + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</span></span>
              <span className="cj-row-main">
                <strong>{item.customer || 'ลูกค้า'} · {item.unitCount || 1} เครื่อง</strong>
                <span className={urgent ? 'cj-row-urgent' : ''}>{techGuide(item).short}</span>
                <small>{shortDate(item.date)} · {item.time} น.</small>
              </span>
              <ChevronRight size={18} aria-hidden="true"/>
            </button>
          </li>;
        })}</ul>}
      <button type="button" className="cj-add" onClick={onFindJobs}><MapPin size={17}/> ดูงานใกล้ฉัน</button>
    </section>

    <section className="cj-detail" aria-label="รายละเอียดงาน">
      {selected ? <JobDetail key={selected.id} {...props} booking={selected} onBack={() => setSelectedId(null)}/> : <p className="cj-pick">เลือกงานจากรายการเพื่อดูรายละเอียด</p>}
    </section>
  </div>;
}

function JobDetail({ booking, reports, onBack, onStatusChange, onLocationUpdate, onPaymentConfirm, onPaymentIssue, onCreateReport }: Props & { booking: Booking; onBack: () => void }) {
  const guide = techGuide(booking);
  const report = reports.find(item => item.bookingId === booking.id);
  const gps = useShareLocation(booking, onLocationUpdate);
  const cancelled = booking.status === 'ยกเลิก';
  const canReport = !report && (booking.status === 'กำลังดำเนินการ' || booking.status === 'รอชำระเงิน');
  const hasDestination = booking.latitude != null && booking.longitude != null;
  const hasOwn = booking.technicianLatitude != null && booking.technicianLongitude != null;

  const act = (label: string, status: BookingStatus, Icon: typeof Check = ChevronRight) =>
    <button type="button" className="cj-primary full" onClick={() => onStatusChange(booking.id, status)}>{label} <Icon size={17}/></button>;

  return <article className="cj-article">
    <button type="button" className="cj-back" onClick={onBack}><ChevronLeft size={18}/> งานทั้งหมด</button>
    <header className="cj-head">
      <div><span className="cj-code">{booking.code}</span><h2>{booking.service}</h2><p>{shortDate(booking.date)} · {booking.time} น.</p></div>
      <StatusBadge status={booking.status}/>
    </header>

    {!cancelled && <Stepper labels={techSteps} step={techStep(booking.status)}/>}

    <section className={'cj-now' + (techNeedsAction(booking) ? ' urgent' : '')}>
      <h3>{guide.title}</h3>
      <p>{guide.hint}</p>
      {booking.status === 'รอยืนยัน' && act('รับงาน', 'ยืนยันแล้ว', Check)}
      {booking.status === 'ยืนยันแล้ว' && <>{act('เริ่มเดินทางและแชร์ตำแหน่ง', 'กำลังเดินทาง', Navigation)}<a className="cj-ghost" href={mapsLink(booking)} target="_blank" rel="noreferrer"><ExternalLink size={16}/> ดูเส้นทางใน Google Maps</a></>}
      {booking.status === 'กำลังเดินทาง' && <div className="cj-track">
        {hasDestination && <LocationMap key={booking.id} center={hasOwn ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude! } : { latitude: booking.latitude!, longitude: booking.longitude! }}
          destination={{ latitude: booking.latitude!, longitude: booking.longitude!, label: 'สถานที่ให้บริการ', kind: 'destination' }}
          technician={hasOwn ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude!, label: 'ตำแหน่งของคุณ', kind: 'technician' } : undefined}
          accuracy={booking.locationAccuracy ?? undefined} height={240} zoom={14}/>}
        <p className="cj-note"><MapPin size={15}/> {gps.message || 'กำลังรับพิกัดจากอุปกรณ์'}</p>
        {act('ถึงหน้างานแล้ว', 'ถึงหน้างาน', MapPin)}
        <a className="cj-ghost" href={mapsLink(booking)} target="_blank" rel="noreferrer"><ExternalLink size={16}/> นำทางด้วย Google Maps</a>
        <button type="button" className="cj-link" onClick={gps.retry}>ลองเชื่อมต่อ GPS อีกครั้ง</button>
      </div>}
      {booking.status === 'ถึงหน้างาน' && act('เริ่มล้างแอร์', 'กำลังดำเนินการ', Wrench)}
      {booking.status === 'กำลังดำเนินการ' && act('ล้างเสร็จแล้ว รอชำระเงิน', 'รอชำระเงิน', CheckCircle2)}
      {(booking.status === 'รอชำระเงิน' || booking.status === 'มีปัญหาการชำระเงิน') && <GetPaid booking={booking} onConfirm={onPaymentConfirm} onIssue={onPaymentIssue}/>}
      {booking.status === 'เสร็จสิ้น' && <p className="cj-done"><CheckCircle2 size={18}/> ได้รับเงิน ฿{booking.price.toLocaleString()}</p>}
    </section>

    {canReport && <ReportForm booking={booking} onCreate={onCreateReport}/>}
    {report && <section className="cj-block">
      <h3>รายงานที่บันทึกแล้ว</h3>
      <p className="cj-report-summary">{report.summary}</p>
      <ul className="cj-checklist">{checklist.map(item => <li key={item.key} className={report[item.key] ? 'ok' : ''}><Check size={15} strokeWidth={3}/> {item.label}</li>)}</ul>
      <p className={report.customerApproved ? 'cj-done' : 'cj-note'}>{report.customerApproved ? <><CheckCircle2 size={18}/> ลูกค้ายืนยันรายงานแล้ว</> : 'รอลูกค้ายืนยันรายงาน'}</p>
    </section>}

    <section className="cj-block">
      <h3>รายละเอียดงาน</h3>
      <dl className="cj-facts">
        <div><dt>ลูกค้า</dt><dd>{booking.customer || '-'}</dd></div>
        <div><dt>สถานที่</dt><dd>{booking.address}{!cancelled && <> <a className="cj-inline-link" href={mapsLink(booking)} target="_blank" rel="noreferrer">เปิดแผนที่</a></>}</dd></div>
        <div><dt>ที่พักและแอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
        <div><dt>ค่าบริการที่ตกลง</dt><dd>฿{booking.price.toLocaleString()} · รับเงินหน้างาน</dd></div>
      </dl>
    </section>
  </article>;
}

function GetPaid({ booking, onConfirm, onIssue }: { booking: Booking; onConfirm: Props['onPaymentConfirm']; onIssue: Props['onPaymentIssue'] }) {
  const [method, setMethod] = useState<PaymentMethod>(booking.paymentMethod ?? 'Cash');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const underReview = booking.status === 'มีปัญหาการชำระเงิน';
  const customerPaid = Boolean(booking.customerConfirmedPayment);
  const gotIt = Boolean(booking.technicianConfirmedPayment);
  return <div className="cj-pay">
    <p className="cj-amount">฿{booking.price.toLocaleString()}</p>
    {!underReview && !gotIt && <div className="cj-methods" role="group" aria-label="วิธีที่ลูกค้าชำระ">
      <button type="button" className={method === 'Cash' ? 'active' : ''} aria-pressed={method === 'Cash'} onClick={() => setMethod('Cash')}><Banknote size={17}/> เงินสด</button>
      <button type="button" className={method === 'PromptPay' ? 'active' : ''} aria-pressed={method === 'PromptPay'} onClick={() => setMethod('PromptPay')}><Smartphone size={17}/> PromptPay</button>
    </div>}
    <ul className="cj-checks">
      <li className={customerPaid ? 'ok' : ''}><CheckCircle2 size={17}/> {customerPaid ? 'ลูกค้ายืนยันว่าชำระแล้ว' : 'รอลูกค้ายืนยันการชำระเงิน'}</li>
      <li className={gotIt ? 'ok' : ''}><CheckCircle2 size={17}/> {gotIt ? 'คุณยืนยันว่าได้รับเงินแล้ว' : 'รอคุณยืนยันว่าได้รับเงิน'}</li>
    </ul>
    {!underReview && !gotIt && <button type="button" className="cj-primary full" onClick={() => onConfirm(booking.id, method)}>ฉันได้รับเงินแล้ว <Check size={17}/></button>}
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

function ReportForm({ booking, onCreate }: { booking: Booking; onCreate: Props['onCreateReport'] }) {
  const [summary, setSummary] = useState('');
  const [checks, setChecks] = useState({ cleanedFilter: false, cleanedCoil: false, checkedDrain: false, checkedCooling: false });
  const [beforePhotoUrl, setBefore] = useState('');
  const [afterPhotoUrl, setAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setFailed(false);
    const ok = await onCreate({ bookingId: booking.id, summary: summary.trim(), ...checks, beforePhotoUrl: beforePhotoUrl.trim() || undefined, afterPhotoUrl: afterPhotoUrl.trim() || undefined });
    setBusy(false);
    if (!ok) setFailed(true);
  }
  return <section className="cj-block">
    <h3>บันทึกรายงานงาน</h3>
    <p className="cj-report-summary">ลูกค้าจะเห็นรายงานนี้และกดยืนยัน ระบุเฉพาะสิ่งที่ทำและตรวจจริง</p>
    <form className="cj-form" onSubmit={submit}>
      <div className="cj-checkgrid">{checklist.map(item => <label key={item.key}><input type="checkbox" checked={checks[item.key]} onChange={event => setChecks(prev => ({ ...prev, [item.key]: event.target.checked }))}/> {item.label}</label>)}</div>
      <label className="cj-field"><span>สรุปงานที่ทำและคำแนะนำ</span><textarea rows={4} maxLength={2000} required value={summary} onChange={event => setSummary(event.target.value)} placeholder="เช่น ล้างแผ่นกรองและคอยล์เย็น ตรวจท่อน้ำทิ้งปกติ แนะนำล้างทุก 4 เดือน"/></label>
      <label className="cj-field"><span>ลิงก์ภาพก่อนทำ (ถ้ามี)</span><input type="url" maxLength={500} value={beforePhotoUrl} onChange={event => setBefore(event.target.value)} placeholder="https://..."/></label>
      <label className="cj-field"><span>ลิงก์ภาพหลังทำ (ถ้ามี)</span><input type="url" maxLength={500} value={afterPhotoUrl} onChange={event => setAfter(event.target.value)} placeholder="https://..."/></label>
      <p className="cj-note">ตอนนี้รองรับเฉพาะลิงก์รูปภาพ ยังไม่มีพื้นที่อัปโหลดไฟล์</p>
      {failed && <p className="cj-error" role="alert">บันทึกไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p>}
      <button type="submit" className="cj-primary full" disabled={busy || !summary.trim()}>{busy ? 'กำลังบันทึก...' : 'บันทึกรายงาน'}</button>
    </form>
  </section>;
}
