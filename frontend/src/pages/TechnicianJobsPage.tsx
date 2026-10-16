import { timeLabel } from '../lib/time';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX2, ArrowRight, CalendarClock, FileText, Phone, XCircle, Minus, Plus, Banknote, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, MapPin, Navigation, Send, Smartphone } from 'lucide-react';
import { RescheduleSheet, canReschedule, formatPhone, telLink } from '../components/Reschedule';
import ReceiptSheet from '../components/ReceiptSheet';
import StatusBadge from '../components/StatusBadge';
import LocationMap from '../components/LocationMap';
import Stepper, { useIsWide } from '../components/JobStepper';
import { JobPhotoGallery, JobPhotoPicker } from '../components/JobPhotos';
import { RoomBoard } from '../components/Rooms';
import { isClosed, isOffer, techClosed, techGuide, techNeedsAction, techStep, techSteps } from '../lib/jobFlow';
import { clashesWith } from '../lib/clash';
import './Membership.css';
import type { CompleteJobPayload, ProposeChangePayload } from '../lib/api';
import PriceChangeSheet from '../components/PriceChangeSheet';
import { PriceBreakdown } from '../components/Pricing';
import { cleanName, lastCleanedName, symptomName } from '../lib/pricing';
import type { Booking, BookingStatus, ServiceReportRecord } from '../types';
import type { JobFocus } from './CustomerJobsPage';
import './CustomerJobs.css';
import './Jobs.css';
import { PhotoCard, Steps } from '../components/kit';
import maskPhoto from '../assets/hero/photo-mask.webp';
import { BellRing, UserCog } from 'lucide-react';

interface Props {
  bookings: Booking[];
  reports: ServiceReportRecord[];
  focus: JobFocus | null;
  onFindJobs: () => void;
  /** Profile and price: what customers see on an offer. */
  onOpenProfile: () => void;
  onStatusChange: (id: number, status: BookingStatus) => void;
  onLocationUpdate: (id: number, latitude: number, longitude: number, accuracy?: number) => Promise<boolean>;
  onComplete: (id: number, payload: CompleteJobPayload) => Promise<boolean>;
  onProgress: (id: number, unitsDone: number, roomsDone?: string[]) => Promise<boolean>;
  onReschedule: (id: number, scheduledAt: string, timeWindow?: string, reason?: string) => Promise<boolean>;
  onProposeChange: (id: number, payload: ProposeChangePayload) => Promise<boolean>;
  onWithdrawChange: (id: number, changeId: string) => Promise<boolean>;
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

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (days: number) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + days); return date; };
const startOf = (item: Booking) => item.timeWindow ? item.timeWindow.split('-')[0] : item.time;

/** Visits in the order they happen; offers (not yet the technician's) after every confirmed visit. */
function byVisit(jobs: Booking[]): Booking[] {
  return [...jobs].sort((a, b) => Number(isOffer(a)) - Number(isOffer(b)) || (a.date + startOf(a)).localeCompare(b.date + startOf(b)));
}

function dayTitle(date: string): { name: string; when: string; past: boolean } {
  const today = dayKey(addDays(0)), tomorrow = dayKey(addDays(1));
  const full = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
  if (date === today) return { name: 'วันนี้', when: full, past: false };
  if (date === tomorrow) return { name: 'พรุ่งนี้', when: full, past: false };
  return { name: full, when: '', past: date < today };
}

/** "วันนี้ 2 งาน · พรุ่งนี้ 1 งาน", or the next day with work when today is free. */
function summary(open: Booking[]): string {
  const visits = open.filter(item => active.includes(item.status) || item.status === 'รอยืนยัน');
  const today = visits.filter(item => item.date === dayKey(addDays(0))).length;
  const tomorrow = visits.filter(item => item.date === dayKey(addDays(1))).length;
  const parts = [today ? `วันนี้ ${today} งาน` : 'วันนี้ว่าง', tomorrow ? `พรุ่งนี้ ${tomorrow} งาน` : ''].filter(Boolean);
  if (!today && !tomorrow) {
    const next = visits.find(item => item.date > dayKey(addDays(1)));
    if (next) parts.push(`งานถัดไป ${shortDate(next.date)}`);
  }
  return parts.join(' · ');
}

/** What a row says about where the job stands; the day and time are already the row's frame. */
function rowState(item: Booking): { text: string; tone: 'act' | 'live' | 'calm' | 'wait' } {
  switch (item.status) {
    case 'รอยืนยัน': return { text: 'ลูกค้าเลือกคุณ · กดรับงาน', tone: 'act' };
    case 'ยืนยันแล้ว': return { text: 'นัดแล้ว', tone: 'calm' };
    case 'กำลังเดินทาง': return { text: 'กำลังเดินทาง', tone: 'live' };
    case 'ถึงหน้างาน': case 'กำลังดำเนินการ': return { text: 'อยู่หน้างาน', tone: 'live' };
    case 'รอชำระเงิน': return { text: 'รับเงินแล้วกดปิดงาน', tone: 'act' };
    case 'มีปัญหาการชำระเงิน': return { text: 'ผู้ดูแลกำลังตรวจสอบ', tone: 'wait' };
    default: return { text: 'รอลูกค้าเลือก', tone: 'wait' };
  }
}

/** The open jobs as a diary: a week strip to see the busy days at a glance, then each day's visits by time. */
function Schedule({ jobs, selectedId, onSelect }: { jobs: Booking[]; selectedId?: number; onSelect: (id: number) => void }) {
  const visits = jobs.filter(item => !isOffer(item));
  const offers = jobs.filter(isOffer);
  const days = [...new Set(visits.map(item => item.date))];
  const week = Array.from({ length: 7 }, (_, index) => addDays(index));
  const jump = (date: string) => document.getElementById(`tj-day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <div className="tj-schedule">
    <ol className="tj-week" aria-label="7 วันข้างหน้า">{week.map((date, index) => {
      const key = dayKey(date);
      const count = visits.filter(item => item.date === key).length;
      return <li key={key}>
        <button type="button" className={'tj-week-day' + (count ? ' busy' : '') + (index === 0 ? ' today' : '')} disabled={!count} onClick={() => jump(key)}
          aria-label={`${date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })} ${count ? count + ' งาน' : 'ไม่มีงาน'}`}>
          <span>{index === 0 ? 'วันนี้' : date.toLocaleDateString('th-TH', { weekday: 'short' })}</span>
          <strong>{date.getDate()}</strong>
          <em aria-hidden="true">{count ? (count > 3 ? count : '•'.repeat(count)) : ''}</em>
        </button>
      </li>;
    })}</ol>

    {!visits.length && <p className="tj-free">ยังไม่มีงานที่ลูกค้ายืนยัน งานที่คุณเสนอราคาไว้อยู่ด้านล่าง</p>}

    {days.map(date => {
      const title = dayTitle(date);
      const rows = visits.filter(item => item.date === date);
      return <section key={date} id={`tj-day-${date}`} className={'tj-day' + (title.past ? ' past' : '')} aria-label={`${title.name} ${title.when}`}>
        <h2 className="tj-day-head"><strong>{title.past ? `เลยวันนัด · ${title.name}` : title.name}</strong>{title.when && <span>{title.when}</span>}<small>{rows.length} งาน</small></h2>
        <ul>{rows.map(item => <li key={item.id}><VisitRow item={item} active={selectedId === item.id} onSelect={onSelect} clash={clashesWith(item, visits).some(found => !found.soft)}/></li>)}</ul>
      </section>;
    })}

    {offers.length > 0 && <section className="tj-day tj-offers" aria-label="ข้อเสนอที่รอลูกค้าเลือก">
      <h2 className="tj-day-head"><strong>รอลูกค้าเลือก</strong><span>ยังไม่ใช่งานของคุณ</span><small>{offers.length} งาน</small></h2>
      <ul>{offers.map(item => <li key={item.id}><VisitRow item={item} active={selectedId === item.id} onSelect={onSelect} withDate/></li>)}</ul>
    </section>}
  </div>;
}

function VisitRow({ item, active: current, onSelect, withDate = false, clash = false }: { item: Booking; active: boolean; onSelect: (id: number) => void; withDate?: boolean; clash?: boolean }) {
  const [from, to] = item.timeWindow ? item.timeWindow.split('-') : [item.time, ''];
  const state = rowState(item);
  const quote = item.applicants?.[0]?.quote ?? item.price;
  return <button type="button" className={`tj-visit tone-${state.tone}` + (current ? ' active' : '')} aria-current={current ? 'true' : undefined} onClick={() => onSelect(item.id)}>
    <span className="tj-visit-time">
      {withDate && <b>{new Date(item.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</b>}
      <strong>{from}</strong>{to && <span>ถึง {to}</span>}
    </span>
    <span className="tj-visit-main">
      <strong className="tj-visit-place"><MapPin size={15} aria-hidden="true"/>{item.address || 'ยังไม่มีที่อยู่'}</strong>
      <span>{item.service} · {item.unitCount || 1} เครื่อง · ฿{quote.toLocaleString()}</span>
      <span className="tj-visit-tags"><em className="tj-visit-state">{state.text}</em>{clash && <b className="tj-clash"><CalendarX2 size={13}/> เวลาชน</b>}</span>
    </span>
    <ChevronRight size={18} aria-hidden="true"/>
  </button>;
}

/** Technician's single place for their jobs: offers waiting on customers, jobs to go to, and closing a job. */
export default function TechnicianJobsPage(props: Props) {
  const { bookings, focus, onFindJobs, onOpenProfile, onRefresh } = props;
  const wide = useIsWide();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** The job just closed on this screen: shows the "done" summary and what to do next instead of the old job page. */
  const [finishedId, setFinishedId] = useState<number | null>(null);
  const open = useMemo(() => byVisit(bookings.filter(item => !isClosed(item))), [bookings]);
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
  const finished = finishedId != null ? bookings.find(item => item.id === finishedId && (item.status === 'เสร็จสิ้น' || techClosed(item))) : undefined;
  const nextJob = open.find(item => active.includes(item.status) || item.status === 'รอยืนยัน');
  async function complete(id: number, payload: CompleteJobPayload) {
    const ok = await props.onComplete(id, payload);
    if (ok) { setFinishedId(id); setSelectedId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    return ok;
  }
  function openJob(id: number | null) { setFinishedId(null); setSelectedId(id); if (id != null) setTab('open'); }

  if (!bookings.length) {
    return <div className="ui-page is-narrow tj-first">
      <PhotoCard src={maskPhoto} alt="ช่างแอร์สวมหน้ากากกำลังถอดแผ่นกรองแอร์" position="30% 35%" className="tj-first-photo"
        title="เริ่มรับงานแรกของคุณ"
        action={<button type="button" className="ui-btn is-light is-lg" onClick={onFindJobs}><MapPin size={20}/> ดูงานใกล้ฉัน</button>}>
        ยังไม่มีงานในตอนนี้ ดูงานล้างแอร์ใกล้ตัวแล้วส่งข้อเสนอได้เลย
      </PhotoCard>
      <section className="ui-card" aria-labelledby="tj-first-how">
        <div className="ui-card-head"><div><h2 id="tj-first-how">งานจะมาที่นี่อย่างไร</h2><p>ทุกงานที่คุณเสนอราคาจะอยู่ในหน้านี้ทันที</p></div></div>
        <Steps items={[
          { title: 'ดูงานใกล้ตัว', text: 'เห็นประเภทที่พัก จำนวนเครื่อง ระยะทาง และราคาประเมิน' },
          { title: 'กดสนใจรับงาน', text: 'ลูกค้าเห็นโปรไฟล์ ราคา และคะแนนของคุณ' },
          { title: 'ลูกค้าเลือกคุณ', text: 'งานขึ้นตารางของวันนั้น พร้อมที่อยู่ เบอร์โทร และปุ่มนำทาง' },
        ]}/>
      </section>
      <section className="ui-section" aria-labelledby="tj-first-tips">
        <div className="ui-section-head"><h2 id="tj-first-tips">เพิ่มโอกาสให้ลูกค้าเลือกคุณ</h2></div>
        <ul className="ui-list">
          <li><button type="button" className="ui-row" onClick={onOpenProfile}>
            <span className="ui-row-lead"><UserCog size={22}/></span>
            <span className="ui-row-text"><strong>รูปโปรไฟล์และราคาครบ</strong><span>ลูกค้าเลือกช่างที่เห็นหน้าและราคาชัดเจนได้ง่ายกว่า</span></span>
            <span className="ui-row-trail"><ChevronRight size={18}/></span>
          </button></li>
          <li><button type="button" className="ui-row" onClick={onOpenProfile}>
            <span className="ui-row-lead"><BellRing size={22}/></span>
            <span className="ui-row-text"><strong>เปิดการแจ้งเตือนในมือถือ</strong><span>รู้ทันทีเมื่อลูกค้าเลือกคุณ ไม่พลาดงาน</span></span>
            <span className="ui-row-trail"><ChevronRight size={18}/></span>
          </button></li>
        </ul>
      </section>
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
        <div><h1>งานของฉัน</h1>{toGo > 0 && <p className="tj-summary">{summary(open)}</p>}</div>
      </div>
      <div className="cj-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>กำลังดำเนินการ <span>{open.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'closed'} className={tab === 'closed' ? 'active' : ''} onClick={() => setTab('closed')}>เสร็จสิ้นและยกเลิก <span>{closed.length}</span></button>
      </div>
      {tab === 'open'
        ? (open.length === 0 ? <p className="cj-list-empty">ไม่มีงานที่กำลังดำเนินการ</p> : <Schedule jobs={open} selectedId={selected?.id} onSelect={setSelectedId}/>)
        : closed.length === 0 ? <p className="cj-list-empty">ยังไม่มีงานที่ปิดแล้ว</p>
        : <ul>{closed.map(item => <li key={item.id}>
            <button type="button" className={'cj-row' + (selected?.id === item.id ? ' active' : '')} aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
              <span className="cj-row-date"><strong>{new Date(item.date + 'T00:00:00').getDate()}</strong><span>{new Date(item.date + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</span></span>
              <span className="cj-row-main">
                <strong>{item.service} · {item.unitCount || 1} เครื่อง</strong>
                <span>{techGuide(item).short}</span>
                <small>{shortDate(item.date)} · {timeLabel(item)}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true"/>
            </button>
          </li>)}</ul>}
      <button type="button" className="cj-add" onClick={onFindJobs}><MapPin size={17}/> ดูงานใกล้ฉัน</button>
    </section>

    <section className="cj-detail" aria-label="รายละเอียดงาน">
      {selected ? <JobDetail key={selected.id} {...props} onComplete={complete} booking={selected} onBack={() => setSelectedId(null)}/> : <p className="cj-pick">เลือกงานจากรายการเพื่อดูรายละเอียด</p>}
    </section>
  </div>;
}

function JobDetail({ booking, bookings, reports, onBack, onStatusChange, onLocationUpdate, onComplete, onProgress, onReschedule, onProposeChange, onWithdrawChange }: Props & { booking: Booking; onBack: () => void }) {
  const guide = techGuide(booking);
  const [moving, setMoving] = useState(false);
  const report = reports.find(item => item.bookingId === booking.id);
  const gps = useShareLocation(booking, onLocationUpdate, () => onStatusChange(booking.id, 'ถึงหน้างาน'));
  const cancelled = booking.status === 'ยกเลิก';
  const offer = isOffer(booking);
  const going = active.includes(booking.status);
  const hasDestination = booking.latitude != null && booking.longitude != null;
  const hasOwn = booking.technicianLatitude != null && booking.technicianLongitude != null;
  const myQuote = booking.applicants?.[0]?.quote;
  const [receipt, setReceipt] = useState(false);

  return <article className="cj-article">
    <button type="button" className="cj-back" onClick={onBack}><ChevronLeft size={18}/> งานทั้งหมด</button>
    <header className="cj-head">
      <div><span className="cj-code">{booking.code}</span><h2>{booking.service} · {booking.unitCount || 1} เครื่อง</h2><p>{shortDate(booking.date)} · {timeLabel(booking)}</p></div>
      <StatusBadge status={booking.status}/>
    </header>

    {!cancelled && <Stepper labels={techSteps} step={techStep(booking.status)}/>}

    <section className={'cj-now' + (techNeedsAction(booking) ? ' urgent' : '')}>
      <h3>{guide.title}</h3>
      <p>{guide.hint}</p>
      {(booking.status === 'รอยืนยัน' || booking.status === 'ยืนยันแล้ว') && (() => {
        const clashes = clashesWith(booking, bookings);
        if (!clashes.length) return null;
        const hard = clashes.some(item => !item.soft);
        return <p className={'clash-note' + (hard ? ' hard' : '')}><CalendarX2 size={16}/><span><strong>{hard ? 'เวลาชนกับงานอื่นของคุณ' : 'อาจชนกับงานอื่นของคุณ'}</strong> {clashes.map(item => `${item.job.code} ${timeLabel(item.job)}`).join(', ')}{booking.status === 'รอยืนยัน' ? ' · โทรคุยกับลูกค้าเพื่อเลื่อนเวลา หรือยกเลิกถ้าไปไม่ได้' : ''}</span></p>;
      })()}
      {offer && <div className="tj-offer">
        <div><span>ราคาที่คุณเสนอ</span><strong>฿{(myQuote ?? booking.price).toLocaleString()}</strong></div>
        {booking.applicants?.[0]?.lines?.length ? <details className="pr-details"><summary>คิดจากใบราคาของคุณ</summary><PriceBreakdown lines={booking.applicants[0].lines}/></details> : null}
        {booking.offerDeadline && <p className="cj-note"><Clock3 size={15}/> ลูกค้าจะเลือกช่างภายใน {new Date(booking.offerDeadline).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. ถ้าไม่เลือก ข้อเสนอจะหมดอายุและคุณได้รับแจ้ง</p>}
        <p className="cj-note"><Clock3 size={15}/> ที่อยู่เต็มของลูกค้าจะแสดงเมื่อลูกค้าเลือกคุณ</p>
      </div>}
      {canReschedule(booking, 'technician') && <button type="button" className="cj-ghost cj-reschedule" onClick={() => setMoving(true)}><CalendarClock size={16}/> เปลี่ยนวันนัด</button>}
      {['รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status) && <TechCancel onConfirm={() => onStatusChange(booking.id, 'ยกเลิก')}/>}
      {moving && <RescheduleSheet booking={booking} side="technician" onSend={(at, window, reason) => onReschedule(booking.id, at, window, reason)} onClose={() => setMoving(false)}/>}
      {booking.status === 'รอยืนยัน' && <button type="button" className="cj-primary full" onClick={() => onStatusChange(booking.id, 'ยืนยันแล้ว')}>รับงาน <Check size={17}/></button>}
      {booking.status === 'เสร็จสิ้น' && <p className="cj-done"><CheckCircle2 size={18}/> ได้รับเงิน ฿{booking.price.toLocaleString()} {booking.paymentMethod === 'PromptPay' ? '(โอน)' : '(เงินสด)'}</p>}
    </section>

    {going && <section className="cj-block tj-destination">
      <h3><MapPin size={18}/> ที่ต้องไป</h3>
      <p className="tj-address">{booking.address}</p>
      {booking.customerPhone && <div className="cj-call"><a className="cj-ghost" href={telLink(booking.customerPhone)}><Phone size={17}/> โทรหาลูกค้า {formatPhone(booking.customerPhone)}</a></div>}
      <p className="cj-note">{booking.customer} · {booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</p>
      <p className="cj-note">{conditionText(booking)}</p>
      {hasDestination && <LocationMap key={booking.id + booking.status} center={hasOwn && booking.status === 'กำลังเดินทาง' ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude! } : { latitude: booking.latitude!, longitude: booking.longitude! }}
        destination={{ latitude: booking.latitude!, longitude: booking.longitude!, label: 'บ้านลูกค้า', kind: 'destination' }}
        technician={hasOwn && booking.status === 'กำลังเดินทาง' ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude!, label: 'ตำแหน่งของคุณ', kind: 'technician' } : undefined}
        accuracy={booking.status === 'กำลังเดินทาง' ? booking.locationAccuracy ?? undefined : undefined} height={220} zoom={15}/>}
      <a className="cj-primary full" href={mapsLink(booking)} target="_blank" rel="noreferrer"><Navigation size={17}/> นำทางด้วย Google Maps</a>
      {booking.status === 'ยืนยันแล้ว' && <button type="button" className="cj-ghost" onClick={() => onStatusChange(booking.id, 'กำลังเดินทาง')}><Send size={16}/> ออกเดินทาง · ให้ลูกค้าเห็นตำแหน่งของฉัน</button>}
      {booking.status === 'กำลังเดินทาง' && <p className="cj-note"><MapPin size={15}/> {gps.message || 'กำลังรับพิกัดจากอุปกรณ์'} <button type="button" className="cj-link" onClick={gps.retry}>ลองใหม่</button></p>}
    </section>}

    {going && booking.notes && <section className="cj-block tj-notes"><h3>ข้อมูลจากลูกค้า</h3><p>{booking.notes}</p></section>}
    {going && booking.rooms?.length ? <RoomChecklist booking={booking} onProgress={onProgress}/> : going && (booking.unitCount || 1) >= 3 && <UnitProgress booking={booking} onProgress={onProgress}/>}

    {going && booking.status !== 'รอชำระเงิน' && <PriceOnSite booking={booking} onPropose={payload => onProposeChange(booking.id, payload)} onWithdraw={changeId => onWithdrawChange(booking.id, changeId)}/>}
    {going && !techClosed(booking) && <FinishJob booking={booking} onComplete={onComplete}/>}

    {booking.status === 'เสร็จสิ้น' && <section className="cj-block"><JobPhotoGallery bookingId={booking.id}/></section>}
    {booking.status === 'เสร็จสิ้น' && booking.paymentStatus === 'Paid' && <button type="button" className="cj-ghost tj-receipt" onClick={() => setReceipt(true)}><FileText size={16}/> ใบเสร็จของงานนี้</button>}
    {receipt && <ReceiptSheet bookingId={booking.id} canIssue={false} onClose={() => setReceipt(false)}/>}
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
        <div><dt>งานและสภาพแอร์</dt><dd>{conditionText(booking)}</dd></div>
      </dl>
    </section>}
  </article>;
}

/** "ล้างธรรมดา · ล้างล่าสุดเกิน 1 ปี · มีกลิ่นอับ": the clean asked for and what the customer said about the units. */
function conditionText(booking: Booking): string {
  return [cleanName(Boolean(booking.deep)), booking.hardAccessUnits ? `คอยล์ร้อนเข้าถึงยาก ${booking.hardAccessUnits} เครื่อง` : '',
    booking.lastCleaned ? 'ล้างล่าสุด ' + lastCleanedName(booking.lastCleaned) : '', ...(booking.symptoms ?? []).map(symptomName)].filter(Boolean).join(' · ');
}

/**
 * The price agreed with the customer, and the one way to change it: ask in the app. While a request waits the
 * job cannot be closed, so what is collected is always what the customer agreed to.
 */
function PriceOnSite({ booking, onPropose, onWithdraw }: { booking: Booking; onPropose: (payload: ProposeChangePayload) => Promise<boolean>; onWithdraw: (changeId: string) => Promise<boolean> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = booking.pendingChange?.status === 'Pending' ? booking.pendingChange : null;
  const last = [...(booking.changes ?? [])].reverse().find(item => item.status === 'Approved' || item.status === 'Declined');
  return <section className="cj-block tj-price">
    <h3>ราคาที่ตกลงกับลูกค้า</h3>
    {booking.priceLines?.length ? <PriceBreakdown lines={booking.priceLines} totalLabel="ยอดที่เก็บจากลูกค้า"/> : <p className="cj-amount">฿{booking.price.toLocaleString()}</p>}
    {last && !pending && <p className="cj-note">คำขอล่าสุด: ลูกค้า{last.status === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'} ({last.kind === 'correction' ? 'ปรับรายการแอร์' : 'งานเพิ่ม'} ฿{last.newPrice.toLocaleString()})</p>}
    {pending
      ? <div className="tj-pending" role="status">
        <strong>รอลูกค้าตอบ: ราคาใหม่ ฿{pending.newPrice.toLocaleString()} (เดิม ฿{pending.oldPrice.toLocaleString()})</strong>
        <span>“{pending.reason}” · ลูกค้าได้รับแจ้งแล้ว ให้ลูกค้ากดอนุมัติในแอป ระหว่างนี้ยังปิดงานไม่ได้</span>
        <button type="button" className="cj-ghost" disabled={busy} onClick={async () => { setBusy(true); await onWithdraw(pending.id); setBusy(false); }}>{busy ? 'กำลังยกเลิก…' : 'ยกเลิกคำขอ'}</button>
      </div>
      : <>
        <p className="cj-note">แอร์ไม่ตรงกับที่ลูกค้าแจ้ง หรือต้องทำงานเพิ่ม? ขอในแอปให้ลูกค้ากดอนุมัติก่อน ห้ามเก็บเงินเกินยอดในแอป</p>
        <button type="button" className="cj-ghost" onClick={() => setAsking(true)}>ขอปรับราคา / งานเพิ่ม</button>
      </>}
    {asking && <PriceChangeSheet booking={booking} onSend={onPropose} onClose={() => setAsking(false)}/>}
  </section>;
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
      {booking.status === 'เสร็จสิ้น'
        ? <><li><Check size={16} strokeWidth={3}/> บันทึกประวัติการล้างแอร์ให้ลูกค้าแล้ว</li><li><Check size={16} strokeWidth={3}/> แจ้งลูกค้าให้ให้คะแนนคุณแล้ว</li></>
        : <li><Clock3 size={16} strokeWidth={2.6}/> แจ้งลูกค้าให้ยืนยันการจ่ายเงินแล้ว ถ้าไม่มีการแจ้งปัญหา ระบบปิดงานให้เองใน 3 วัน</li>}
    </ul>
    <dl className="tj-done-stats">
      <div><dt>วันนี้</dt><dd>{doneToday.length} งาน · ฿{sum(doneToday).toLocaleString()}</dd></div>
      <div><dt>เดือนนี้</dt><dd>{doneMonth.length} งาน · ฿{sum(doneMonth).toLocaleString()}</dd></div>
    </dl>
    {next
      ? <section className="tj-done-next">
        <h2>งานถัดไป · {nextWhen} {timeLabel(next)}</h2>
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

/** Cancelling a job the technician cannot do; asks once, after suggesting a call to the customer. */
function TechCancel({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  return asking
    ? <div className="cj-confirm" role="alertdialog" aria-label="ยืนยันยกเลิกงาน">
      <p>ยกเลิกงานนี้? ลูกค้าจะได้รับแจ้งและต้องหาช่างใหม่ ถ้าแค่ไม่สะดวกวันนี้ ลองโทรตกลงวันใหม่กับลูกค้า แล้วกด “เปลี่ยนวันนัด” แทน</p>
      <div><button type="button" className="cj-danger" onClick={onConfirm}><XCircle size={16}/> ยกเลิกงาน</button><button type="button" className="cj-ghost" onClick={() => setAsking(false)}>ไม่ยกเลิก</button></div>
    </div>
    : <button type="button" className="cj-link lp-danger tj-cancel" onClick={() => setAsking(true)}><XCircle size={15}/> ยกเลิกงานนี้</button>;
}

/** Building jobs with rooms: tap each room when it is done; saved shortly after the last tap. */
function RoomChecklist({ booking, onProgress }: { booking: Booking; onProgress: Props['onProgress'] }) {
  const [rooms, setRooms] = useState(booking.rooms ?? []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Taps made while a save is on its way stay unsaved, so they are not dropped when that save returns.
  const taps = useRef(0);
  useEffect(() => { if (!dirty) setRooms(booking.rooms ?? []); }, [booking.rooms]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(async () => {
      const at = taps.current;
      setSaving(true);
      await onProgress(booking.id, 0, rooms.filter(room => room.done).map(room => room.name));
      setSaving(false);
      if (taps.current === at) setDirty(false);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [rooms, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="cj-block tj-progress">
    <h3>ห้องที่ล้างแล้ว</h3>
    <RoomBoard rooms={rooms} onToggle={name => { taps.current++; setRooms(list => list.map(room => room.name === name ? { ...room, done: !room.done } : room)); setDirty(true); }}/>
    <p className="cj-note">{saving ? 'กำลังบันทึก…' : 'แตะห้องเมื่อล้างเสร็จ ลูกค้าเห็นทันทีว่าห้องไหนเสร็จแล้ว'}</p>
  </section>;
}

/** Large jobs: count finished units as you go, so the customer sees how far along the building is. */
function UnitProgress({ booking, onProgress }: { booking: Booking; onProgress: Props['onProgress'] }) {
  const total = booking.unitCount || 1;
  const [done, setDone] = useState(booking.unitsDone ?? 0);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDone(booking.unitsDone ?? 0); }, [booking.unitsDone]);
  // Save shortly after the last tap, so quick taps send one update.
  useEffect(() => {
    if (done === (booking.unitsDone ?? 0)) return;
    const timer = window.setTimeout(async () => { setSaving(true); await onProgress(booking.id, done); setSaving(false); }, 700);
    return () => window.clearTimeout(timer);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="cj-block tj-progress">
    <h3>ล้างไปแล้ว</h3>
    <div className="tj-progress-row">
      <button type="button" aria-label="ลดหนึ่งเครื่อง" disabled={done <= 0} onClick={() => setDone(value => Math.max(0, value - 1))}><Minus size={20}/></button>
      <strong aria-live="polite">{done}<small> / {total} เครื่อง</small></strong>
      <button type="button" aria-label="เพิ่มหนึ่งเครื่อง" disabled={done >= total} onClick={() => setDone(value => Math.min(total, value + 1))}><Plus size={20}/></button>
    </div>
    <div className="cj-progress" aria-hidden="true"><span style={{ width: `${(done / total) * 100}%` }}/></div>
    <p className="cj-note">{saving ? 'กำลังบันทึก…' : 'กด + ทุกครั้งที่ล้างเสร็จหนึ่งเครื่อง ลูกค้าเห็นความคืบหน้าทันที'}</p>
  </section>;
}

/** The one press at the end: job done and money received. Records the report and the cleaning history. */
function FinishJob({ booking, onComplete }: { booking: Booking; onComplete: Props['onComplete'] }) {
  const [method, setMethod] = useState<'Cash' | 'PromptPay'>(booking.paymentMethod ?? 'Cash');
  const [checks, setChecks] = useState({ cleanedFilter: true, cleanedCoil: true, checkedDrain: true, checkedCooling: true });
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState({ after: 0, failed: false });
  // At least one "after" photo, unless uploading failed (bad signal must not block closing the job).
  const photosReady = photos.after > 0 || photos.failed;
  // The amount is not settled while the customer has not answered a price change.
  const waiting = booking.pendingChange?.status === 'Pending';
  async function finish() {
    setBusy(true);
    const ok = await onComplete(booking.id, { method, summary: note.trim() || undefined, ...checks });
    setBusy(false);
    if (!ok) setAsking(false);
  }
  return <section className="cj-block tj-finish">
    <h3>ล้างเสร็จแล้ว? ปิดงานที่นี่</h3>
    <p className="cj-note">กดครั้งเดียวหลังล้างเสร็จและได้รับเงินจากลูกค้าแล้ว ลูกค้าจะได้รับแจ้งให้ยืนยันการจ่ายเงิน แล้วระบบบันทึกประวัติการล้างแอร์ให้อัตโนมัติ</p>
    <div className="tj-photos">
      <h4>รูปงาน</h4>
      <p className="cj-note">ถ่ายรูปแอร์หลังล้างอย่างน้อย 1 รูป ลูกค้าจะเห็นรูปในงานของเขา</p>
      <JobPhotoPicker bookingId={booking.id} onChange={setPhotos}/>
    </div>
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
      : <>
        <button type="button" className="cj-primary full" disabled={!photosReady || waiting} onClick={() => setAsking(true)}><CheckCircle2 size={18}/> งานเสร็จและได้รับเงินแล้ว</button>
        {waiting && <p className="cj-note tj-photo-needed">รอลูกค้าตอบคำขอปรับราคาก่อน หรือยกเลิกคำขอ</p>}
        {!photosReady && <p className="cj-note tj-photo-needed">เพิ่มรูปหลังล้างก่อนปิดงาน</p>}
        {photos.failed && photos.after === 0 && <p className="cj-note tj-photo-needed">อัปโหลดรูปไม่ได้ ปิดงานต่อได้ แล้วเพิ่มรูปภายหลังภายใน 1 วัน</p>}
      </>}
  </section>;
}
