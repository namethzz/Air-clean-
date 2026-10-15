import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Banknote, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, MapPin, Navigation, Send, Smartphone, Wrench } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import LocationMap from '../components/LocationMap';
import Stepper, { useIsWide } from '../components/JobStepper';
import { isClosed, isOffer, sortByNeed, techGuide, techNeedsAction, techStep, techSteps } from '../lib/jobFlow';
import type { CompleteJobPayload } from '../lib/api';
import type { Booking, BookingStatus, ServiceReportRecord } from '../types';
import type { JobFocus } from './CustomerJobsPage';
import './CustomerJobs.css';

interface Props {
  bookings: Booking[];
  reports: ServiceReportRecord[];
  focus: JobFocus | null;
  onFindJobs: () => void;
  onStatusChange: (id: number, status: BookingStatus) => void;
  onLocationUpdate: (id: number, latitude: number, longitude: number, accuracy?: number) => Promise<boolean>;
  onComplete: (id: number, payload: CompleteJobPayload) => Promise<boolean>;
  onRefresh: () => void;
}

const checklist = [
  { key: 'cleanedFilter', label: 'ล้างแผ่นกรอง' },
  { key: 'cleanedCoil', label: 'ล้างคอยล์' },
  { key: 'checkedDrain', label: 'ตรวจท่อน้ำทิ้ง' },
  { key: 'checkedCooling', label: 'ตรวจความเย็น' },
] as const;

/** Within this distance of the customer's pin the job counts as arrived, without the technician pressing anything. */
const ARRIVAL_METERS = 150;
const active: BookingStatus[] = ['ยืนยันแล้ว', 'กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ', 'รอชำระเงิน'];

function shortDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}
function mapsLink(booking: Booking) {
  const target = booking.latitude != null && booking.longitude != null ? `${booking.latitude},${booking.longitude}` : encodeURIComponent(booking.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${target}&travelmode=driving`;
}
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** While travelling: sends the position every few seconds and marks the job arrived once close to the customer. */
function useShareLocation(booking: Booking, onLocationUpdate: Props['onLocationUpdate'], onArrive: () => void) {
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const arrived = useRef(false);
  // Held in a ref so a new callback identity on each render does not restart GPS watching.
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;
  const traveling = booking.status === 'กำลังเดินทาง';
  const { id, latitude: destLat, longitude: destLng } = booking;
  useEffect(() => {
    if (!traveling) { setMessage(''); return; }
    if (!navigator.geolocation) { setMessage('อุปกรณ์นี้ไม่รองรับ GPS ผ่านเบราว์เซอร์'); return; }
    let lastSentAt = 0, pending = false, disposed = false;
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
      const distance = destLat != null && destLng != null ? metersBetween(coords.latitude, coords.longitude, destLat, destLng) : null;
      if (distance != null && distance <= ARRIVAL_METERS + Math.min(coords.accuracy, 100) && !arrived.current) {
        arrived.current = true;
        setMessage('ถึงหน้างานแล้ว หยุดแชร์ตำแหน่ง');
        arriveRef.current();
        return;
      }
      setMessage(sent
        ? (distance != null ? `ส่งตำแหน่งแล้ว · อีกประมาณ ${distance >= 1000 ? (distance / 1000).toFixed(1) + ' กม.' : Math.round(distance) + ' ม.'}` : 'ส่งตำแหน่งแล้ว')
        : 'ส่งตำแหน่งไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต ระบบจะลองใหม่');
    }
    setMessage('กำลังขออนุญาตใช้ตำแหน่งจากอุปกรณ์…');
    const watchId = navigator.geolocation.watchPosition(
      position => { latest = position; if (Date.now() - lastSentAt >= 8000) void send(); },
      error => { latest = null; setMessage(error.code === 1 ? 'ยังไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS ในเบราว์เซอร์' : 'รับตำแหน่ง GPS ไม่สำเร็จ ตรวจสอบการตั้งค่าตำแหน่งและลองอีกครั้ง'); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    const heartbeat = window.setInterval(() => { void send(); }, 8000);
    return () => { disposed = true; window.clearInterval(heartbeat); navigator.geolocation.clearWatch(watchId); };
  }, [traveling, id, destLat, destLng, onLocationUpdate, attempt]);
  return { message, retry: () => setAttempt(value => value + 1) };
}

/** Technician's single place for their jobs: offers waiting on customers, jobs to go to, and closing a job. */
export default function TechnicianJobsPage(props: Props) {
  const { bookings, focus, onFindJobs, onRefresh } = props;
  const wide = useIsWide();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** The job just closed on this screen: shows the "done" summary and what to do next instead of the old job page. */
  const [finishedId, setFinishedId] = useState<number | null>(null);
  const open = useMemo(() => sortByNeed(bookings.filter(item => !isClosed(item)), techNeedsAction), [bookings]);
  const closed = useMemo(() => bookings.filter(isClosed).sort((a, b) => b.id - a.id), [bookings]);

  useEffect(() => {
    if (!focus) return;
    const target = bookings.find(item => item.id === focus.id);
    setSelectedId(focus.id);
    if (target) setTab(isClosed(target) ? 'closed' : 'open');
  }, [focus?.token, bookings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open.length) return;
    const timer = window.setInterval(onRefresh, 10000);
    return () => window.clearInterval(timer);
  }, [open.length, onRefresh]);

  const shown = tab === 'open' ? open : closed;
  const selected = bookings.find(item => item.id === selectedId) ?? (wide ? shown[0] : undefined);
  const toGo = open.filter(item => active.includes(item.status)).length;
  const finished = finishedId != null ? bookings.find(item => item.id === finishedId && item.status === 'เสร็จสิ้น') : undefined;
  const nextJob = open.find(item => active.includes(item.status) || item.status === 'รอยืนยัน');
  async function complete(id: number, payload: CompleteJobPayload) {
    const ok = await props.onComplete(id, payload);
    if (ok) { setFinishedId(id); setSelectedId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    return ok;
  }
  function openJob(id: number | null) { setFinishedId(null); setSelectedId(id); if (id != null) setTab('open'); }

  if (!bookings.length) {
    return <div className="cj-empty">
      <span className="cj-empty-icon"><Wrench size={30}/></span>
      <h1>ยังไม่มีงาน</h1>
      <p>ดูงานใกล้ตัวแล้วกดสนใจ งานที่คุณเสนอราคาจะมาอยู่ที่นี่ทันที และเมื่อลูกค้าเลือกคุณ จะมีที่อยู่และปุ่มนำทาง</p>
      <button type="button" className="cj-primary" onClick={onFindJobs}><MapPin size={18}/> ดูงานใกล้ฉัน</button>
    </div>;
  }

  if (finished) {
    return <div className="cj-page tj-done-page">
      <JobFinished booking={finished} bookings={bookings} next={nextJob} onOpen={openJob} onFindJobs={onFindJobs}/>
    </div>;
  }

  return <div className={'cj-page' + (selected && !wide ? ' cj-show-detail' : '')}>
    <section className="cj-list" aria-label="รายการงาน">
      <div className="cj-list-head">
        <h1>งานของฉัน</h1>
        {toGo > 0 && <span className="cj-action-pill">{toGo} งานที่ต้องไป</span>}
      </div>
      <div className="cj-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>กำลังดำเนินการ <span>{open.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'closed'} className={tab === 'closed' ? 'active' : ''} onClick={() => setTab('closed')}>เสร็จสิ้นและยกเลิก <span>{closed.length}</span></button>
      </div>
      {shown.length === 0
        ? <p className="cj-list-empty">{tab === 'open' ? 'ไม่มีงานที่กำลังดำเนินการ' : 'ยังไม่มีงานที่ปิดแล้ว'}</p>
        : <ul>{shown.map(item => {
          const offer = isOffer(item);
          const quote = item.applicants?.[0]?.quote;
          return <li key={item.id}>
            <button type="button" className={'cj-row' + (selected?.id === item.id ? ' active' : '') + (offer ? ' cj-row-offer' : '')} aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
              <span className="cj-row-date"><strong>{new Date(item.date + 'T00:00:00').getDate()}</strong><span>{new Date(item.date + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</span></span>
              <span className="cj-row-main">
                <strong>{item.service} · {item.unitCount || 1} เครื่อง</strong>
                <span className={techNeedsAction(item) ? 'cj-row-urgent' : ''}>{techGuide(item).short}</span>
                <small>{offer ? `ข้อเสนอ ฿${(quote ?? item.price).toLocaleString()} · ${item.time} น.` : active.includes(item.status) ? item.address : `${shortDate(item.date)} · ${item.time} น.`}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true"/>
            </button>
          </li>;
        })}</ul>}
      <button type="button" className="cj-add" onClick={onFindJobs}><MapPin size={17}/> ดูงานใกล้ฉัน</button>
    </section>

    <section className="cj-detail" aria-label="รายละเอียดงาน">
      {selected ? <JobDetail key={selected.id} {...props} onComplete={complete} booking={selected} onBack={() => setSelectedId(null)}/> : <p className="cj-pick">เลือกงานจากรายการเพื่อดูรายละเอียด</p>}
    </section>
  </div>;
}

function JobDetail({ booking, reports, onBack, onStatusChange, onLocationUpdate, onComplete }: Props & { booking: Booking; onBack: () => void }) {
  const guide = techGuide(booking);
  const report = reports.find(item => item.bookingId === booking.id);
  const gps = useShareLocation(booking, onLocationUpdate, () => onStatusChange(booking.id, 'ถึงหน้างาน'));
  const cancelled = booking.status === 'ยกเลิก';
  const offer = isOffer(booking);
  const going = active.includes(booking.status);
  const hasDestination = booking.latitude != null && booking.longitude != null;
  const hasOwn = booking.technicianLatitude != null && booking.technicianLongitude != null;
  const myQuote = booking.applicants?.[0]?.quote;

  return <article className="cj-article">
    <button type="button" className="cj-back" onClick={onBack}><ChevronLeft size={18}/> งานทั้งหมด</button>
    <header className="cj-head">
      <div><span className="cj-code">{booking.code}</span><h2>{booking.service} · {booking.unitCount || 1} เครื่อง</h2><p>{shortDate(booking.date)} · {booking.time} น.</p></div>
      <StatusBadge status={booking.status}/>
    </header>

    {!cancelled && <Stepper labels={techSteps} step={techStep(booking.status)}/>}

    <section className={'cj-now' + (techNeedsAction(booking) ? ' urgent' : '')}>
      <h3>{guide.title}</h3>
      <p>{guide.hint}</p>
      {offer && <div className="tj-offer">
        <div><span>ราคาที่คุณเสนอ</span><strong>฿{(myQuote ?? booking.price).toLocaleString()}</strong></div>
        <p className="cj-note"><Clock3 size={15}/> ที่อยู่เต็มของลูกค้าจะแสดงเมื่อลูกค้าเลือกคุณ</p>
      </div>}
      {booking.status === 'รอยืนยัน' && <button type="button" className="cj-primary full" onClick={() => onStatusChange(booking.id, 'ยืนยันแล้ว')}>รับงาน <Check size={17}/></button>}
      {booking.status === 'เสร็จสิ้น' && <p className="cj-done"><CheckCircle2 size={18}/> ได้รับเงิน ฿{booking.price.toLocaleString()} {booking.paymentMethod === 'PromptPay' ? '(โอน)' : '(เงินสด)'}</p>}
    </section>

    {going && <section className="cj-block tj-destination">
      <h3><MapPin size={18}/> ที่ต้องไป</h3>
      <p className="tj-address">{booking.address}</p>
      <p className="cj-note">{booking.customer} · {booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</p>
      {hasDestination && <LocationMap key={booking.id + booking.status} center={hasOwn && booking.status === 'กำลังเดินทาง' ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude! } : { latitude: booking.latitude!, longitude: booking.longitude! }}
        destination={{ latitude: booking.latitude!, longitude: booking.longitude!, label: 'บ้านลูกค้า', kind: 'destination' }}
        technician={hasOwn && booking.status === 'กำลังเดินทาง' ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude!, label: 'ตำแหน่งของคุณ', kind: 'technician' } : undefined}
        accuracy={booking.status === 'กำลังเดินทาง' ? booking.locationAccuracy ?? undefined : undefined} height={220} zoom={15}/>}
      <a className="cj-primary full" href={mapsLink(booking)} target="_blank" rel="noreferrer"><Navigation size={17}/> นำทางด้วย Google Maps</a>
      {booking.status === 'ยืนยันแล้ว' && <button type="button" className="cj-ghost" onClick={() => onStatusChange(booking.id, 'กำลังเดินทาง')}><Send size={16}/> ออกเดินทาง · ให้ลูกค้าเห็นตำแหน่งของฉัน</button>}
      {booking.status === 'กำลังเดินทาง' && <p className="cj-note"><MapPin size={15}/> {gps.message || 'กำลังรับพิกัดจากอุปกรณ์'} <button type="button" className="cj-link" onClick={gps.retry}>ลองใหม่</button></p>}
    </section>}

    {going && <FinishJob booking={booking} onComplete={onComplete}/>}

    {report && booking.status === 'เสร็จสิ้น' && <section className="cj-block">
      <h3>สรุปงานที่บันทึกไว้</h3>
      <p className="cj-report-summary">{report.summary}</p>
      <ul className="cj-checklist">{checklist.map(item => <li key={item.key} className={report[item.key] ? 'ok' : ''}><Check size={15} strokeWidth={3}/> {item.label}</li>)}</ul>
    </section>}

    {!going && !offer && <section className="cj-block">
      <h3>รายละเอียดงาน</h3>
      <dl className="cj-facts">
        <div><dt>ลูกค้า</dt><dd>{booking.customer || '-'}</dd></div>
        <div><dt>สถานที่</dt><dd>{booking.address}</dd></div>
        <div><dt>ที่พักและแอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
        <div><dt>ค่าบริการ</dt><dd>฿{booking.price.toLocaleString()} · เก็บเงินปลายทาง</dd></div>
      </dl>
    </section>}
    {offer && <section className="cj-block">
      <h3>รายละเอียดงาน</h3>
      <dl className="cj-facts">
        <div><dt>พื้นที่</dt><dd>{booking.address}</dd></div>
        <div><dt>ที่พักและแอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
      </dl>
    </section>}
  </article>;
}

function localDate(offsetDays = 0) {
  const day = new Date(); day.setDate(day.getDate() + offsetDays);
  return new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Right after closing a job: what was recorded, today's totals, and the next place to go (or finding new work). */
function JobFinished({ booking, bookings, next, onOpen, onFindJobs }: { booking: Booking; bookings: Booking[]; next?: Booking; onOpen: (id: number | null) => void; onFindJobs: () => void }) {
  const today = localDate();
  const doneToday = bookings.filter(item => item.status === 'เสร็จสิ้น' && item.date === today);
  const month = today.slice(0, 7);
  const doneMonth = bookings.filter(item => item.status === 'เสร็จสิ้น' && item.date.startsWith(month));
  const sum = (rows: Booking[]) => rows.reduce((total, item) => total + item.price, 0);
  const nextWhen = next ? (next.date === today ? 'วันนี้' : next.date === localDate(1) ? 'พรุ่งนี้' : shortDate(next.date)) : '';
  return <article className="tj-done" aria-live="polite">
    <div className="tj-done-hero">
      <span className="tj-done-icon"><CheckCircle2 size={34} strokeWidth={2.2}/></span>
      <h1>ปิดงานเรียบร้อย</h1>
      <p className="tj-done-amount">+฿{booking.price.toLocaleString()}</p>
      <p className="tj-done-sub">{booking.paymentMethod === 'PromptPay' ? 'รับเงินโอน' : 'รับเงินสด'} · {booking.code} · {booking.customer}</p>
    </div>
    <ul className="tj-done-saved">
      <li><Check size={16} strokeWidth={3}/> บันทึกการรับเงินแล้ว</li>
      <li><Check size={16} strokeWidth={3}/> บันทึกประวัติการล้างแอร์ให้ลูกค้าแล้ว</li>
      <li><Check size={16} strokeWidth={3}/> แจ้งลูกค้าให้ให้คะแนนคุณแล้ว</li>
    </ul>
    <dl className="tj-done-stats">
      <div><dt>วันนี้</dt><dd>{doneToday.length} งาน · ฿{sum(doneToday).toLocaleString()}</dd></div>
      <div><dt>เดือนนี้</dt><dd>{doneMonth.length} งาน · ฿{sum(doneMonth).toLocaleString()}</dd></div>
    </dl>
    {next
      ? <section className="tj-done-next">
        <h2>งานถัดไป · {nextWhen} {next.time} น.</h2>
        <p className="tj-address">{next.address}</p>
        <p className="cj-note">{next.customer} · {next.unitCount || 1} เครื่อง · ฿{next.price.toLocaleString()}</p>
        <button type="button" className="cj-primary full" onClick={() => onOpen(next.id)}>ไปงานถัดไป <ArrowRight size={18}/></button>
        <button type="button" className="cj-ghost" onClick={onFindJobs}><MapPin size={17}/> หางานเพิ่มใกล้ฉัน</button>
      </section>
      : <section className="tj-done-next">
        <h2>ไม่มีงานที่ต้องไปต่อ</h2>
        <p className="cj-note">ดูงานใหม่ใกล้ตัวแล้วส่งข้อเสนอได้เลย</p>
        <button type="button" className="cj-primary full" onClick={onFindJobs}><MapPin size={18}/> หางานใหม่ใกล้ฉัน</button>
      </section>}
    <button type="button" className="cj-link tj-done-all" onClick={() => onOpen(null)}><ClipboardList size={16}/> ดูงานทั้งหมด</button>
  </article>;
}

/** The one press at the end: job done and money received. Records the report and the cleaning history. */
function FinishJob({ booking, onComplete }: { booking: Booking; onComplete: Props['onComplete'] }) {
  const [method, setMethod] = useState<'Cash' | 'PromptPay'>(booking.paymentMethod ?? 'Cash');
  const [checks, setChecks] = useState({ cleanedFilter: true, cleanedCoil: true, checkedDrain: true, checkedCooling: true });
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  async function finish() {
    setBusy(true);
    const ok = await onComplete(booking.id, { method, summary: note.trim() || undefined, ...checks });
    setBusy(false);
    if (!ok) setAsking(false);
  }
  return <section className="cj-block tj-finish">
    <h3>ล้างเสร็จแล้ว? ปิดงานที่นี่</h3>
    <p className="cj-note">กดครั้งเดียวหลังล้างเสร็จและได้รับเงินจากลูกค้าแล้ว ระบบจะบันทึกประวัติการล้างแอร์ให้ลูกค้าอัตโนมัติ</p>
    <p className="cj-amount">฿{booking.price.toLocaleString()}</p>
    <div className="cj-methods" role="group" aria-label="ลูกค้าจ่ายด้วย">
      <button type="button" className={method === 'Cash' ? 'active' : ''} aria-pressed={method === 'Cash'} onClick={() => setMethod('Cash')}><Banknote size={17}/> เงินสด</button>
      <button type="button" className={method === 'PromptPay' ? 'active' : ''} aria-pressed={method === 'PromptPay'} onClick={() => setMethod('PromptPay')}><Smartphone size={17}/> โอน</button>
    </div>
    <details className="tj-more">
      <summary>รายการที่ทำ (ติ๊กไว้ให้แล้ว) และหมายเหตุ</summary>
      <div className="cj-checkgrid">{checklist.map(item => <label key={item.key}><input type="checkbox" checked={checks[item.key]} onChange={event => setChecks(prev => ({ ...prev, [item.key]: event.target.checked }))}/> {item.label}</label>)}</div>
      <label className="cj-field"><span>หมายเหตุถึงลูกค้า (ไม่บังคับ)</span><textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="เช่น แนะนำล้างทุก 6 เดือน ท่อน้ำทิ้งปกติ"/></label>
    </details>
    {asking
      ? <div className="cj-confirm" role="alertdialog" aria-label="ยืนยันปิดงาน">
        <p>ยืนยันว่าล้างเสร็จและได้รับเงิน ฿{booking.price.toLocaleString()} ({method === 'Cash' ? 'เงินสด' : 'โอน'}) แล้ว</p>
        <div><button type="button" className="cj-primary" disabled={busy} onClick={() => void finish()}>{busy ? 'กำลังบันทึก...' : 'ยืนยันปิดงาน'}</button><button type="button" className="cj-ghost" disabled={busy} onClick={() => setAsking(false)}>ยกเลิก</button></div>
      </div>
      : <button type="button" className="cj-primary full" onClick={() => setAsking(true)}><CheckCircle2 size={18}/> งานเสร็จและได้รับเงินแล้ว</button>}
  </section>;
}
