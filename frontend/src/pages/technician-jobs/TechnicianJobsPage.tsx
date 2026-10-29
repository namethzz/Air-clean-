import { timeLabel } from '../../lib/time';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Banknote, BellRing, CalendarClock, CalendarX2, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, FilePen, FileText,
  MapPin, Minus, Navigation, Phone, Plus, Send, ShieldCheck, Smartphone, UserCog, XCircle,
} from 'lucide-react';
import { RescheduleSheet, canReschedule, formatPhone, telLink } from '../../components/job/Reschedule';
import ReceiptSheet from '../../components/job/ReceiptSheet';
import StatusBadge from '../../components/job/StatusBadge';
import LocationMap from '../../components/job/LocationMap';
import { Journey, useIsWide } from '../../components/job/JobStepper';
import { JobPhotoGallery, JobPhotoPicker } from '../../components/job/JobPhotos';
import { RoomBoard } from '../../components/booking/Rooms';
import { isClosed, isOffer, techClosed, techGuide, techStep, techSteps, techTurn } from '../../lib/jobFlow';
import { clashesWith } from '../../lib/clash';
import type { CompleteJobPayload, ProposeChangePayload } from '../../lib/api';
import PriceChangeSheet from './PriceChangeSheet';
import { PriceBreakdown } from '../../components/job/Pricing';
import { bahtRange, cleanName, conditionText } from '../../lib/pricing';
import type { Booking, BookingStatus, ServiceReportRecord } from '../../types';
import type { JobFocus } from '../../types';
import { Plate, PhotoCard, Steps } from '../../components/kit';
import maskPhoto from '../../assets/hero/photo-mask.webp';
import '../jobs/CustomerJobs.css';
import '../../components/job/Jobs.css';
import './TechnicianJobs.css';

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
  // An offer shows the technician's own quote; a job they have is at its agreed price (which may have changed on site).
  const quote = isOffer(item) ? (item.applicants?.[0]?.quote ?? item.price) : item.price;
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
    setFinishedId(null);
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
  // The next visit still to do: not the job just closed, nor any other the technician has closed and been paid for.
  const nextJob = open.find(item => item.id !== finishedId && !techClosed(item) && (active.includes(item.status) || item.status === 'รอยืนยัน'));
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
          { title: 'ดูงานใกล้ตัว', text: 'เห็นราคาของคุณ ระยะทาง จำนวนเครื่อง และสภาพแอร์ ก่อนตัดสินใจ' },
          { title: 'ส่งข้อเสนอ', text: 'ลูกค้าเห็นโปรไฟล์ ราคา และคะแนนของคุณ' },
          { title: 'ลูกค้าเลือกคุณ', text: 'งานขึ้นตารางของวันนั้น พร้อมที่อยู่ เบอร์โทร และปุ่มนำทาง' },
        ]}/>
      </section>
      <section className="ui-section" aria-labelledby="tj-first-tips">
        <div className="ui-section-head"><h2 id="tj-first-tips">เพิ่มโอกาสให้ลูกค้าเลือกคุณ</h2></div>
        <ul className="ui-list">
          <li><button type="button" className="ui-row" onClick={onOpenProfile}>
            <span className="ui-row-lead"><UserCog size={22}/></span>
            <span className="ui-row-text"><strong>รูปโปรไฟล์และใบราคาครบ</strong><span>ลูกค้าเลือกช่างที่เห็นหน้าและราคาชัดเจนได้ง่ายกว่า</span></span>
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
    return <div className="ui-page is-narrow">
      <JobFinished booking={finished} bookings={bookings} next={nextJob} onOpen={openJob} onFindJobs={onFindJobs}/>
    </div>;
  }

  return <div className={'jb tj' + (selected && !wide ? ' is-detail' : '')}>
    <section className="jb-list" aria-label="รายการงาน">
      <div className="tj-head">
        <h1>งานของฉัน</h1>
        {toGo > 0 && <p className="tj-summary">{summary(open)}</p>}
      </div>
      <div className="ui-tabs" role="tablist" aria-label="กลุ่มงาน">
        <button type="button" role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>กำลังดำเนินการ <span className="ui-num">{open.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'closed'} onClick={() => setTab('closed')}>เสร็จสิ้นและยกเลิก <span className="ui-num">{closed.length}</span></button>
      </div>
      {tab === 'open'
        ? (open.length === 0 ? <p className="jb-none">ไม่มีงานที่กำลังดำเนินการ</p> : <Schedule jobs={open} selectedId={selected?.id} onSelect={setSelectedId}/>)
        : closed.length === 0 ? <p className="jb-none">ยังไม่มีงานที่ปิดแล้ว</p>
        : <ul className="jb-rows">{closed.map(item => <li key={item.id}>
            <button type="button" className={'jb-row' + (selected?.id === item.id ? ' is-active' : '')} aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
              <span className="jb-date"><strong>{new Date(item.date + 'T00:00:00').getDate()}</strong><small>{new Date(item.date + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</small></span>
              <span className="jb-row-text">
                <strong>{item.service} · {item.unitCount || 1} เครื่อง</strong>
                <span>{item.status === 'เสร็จสิ้น' ? `ได้รับ ฿${item.price.toLocaleString()}` : techGuide(item).short}</span>
                <small>{shortDate(item.date)} · {timeLabel(item)}</small>
                <StatusBadge status={item.status}/>
              </span>
              <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
            </button>
          </li>)}</ul>}
      <button type="button" className="ui-btn jb-add" onClick={onFindJobs}><MapPin size={18}/> ดูงานใกล้ฉัน</button>
    </section>

    <section className="jb-detail" aria-label="รายละเอียดงาน">
      {selected ? <JobDetail key={selected.id} {...props} onComplete={complete} booking={selected} onBack={() => setSelectedId(null)}/> : <p className="jb-pick">เลือกงานจากรายการเพื่อดูรายละเอียด</p>}
    </section>
  </div>;
}

/**
 * One job, for a technician on site with a phone in one hand: the band says where the job is and whose turn it
 * is, then one card per thing to do, each with one large main button.
 */
function JobDetail({ booking, bookings, reports, onBack, onStatusChange, onLocationUpdate, onComplete, onProgress, onReschedule, onProposeChange, onWithdrawChange }: Props & { booking: Booking; onBack: () => void }) {
  const guide = techGuide(booking);
  const turn = techTurn(booking);
  const [moving, setMoving] = useState(false);
  const report = reports.find(item => item.bookingId === booking.id);
  const gps = useShareLocation(booking, onLocationUpdate, () => onStatusChange(booking.id, 'ถึงหน้างาน'));
  const cancelled = booking.status === 'ยกเลิก';
  const offer = isOffer(booking);
  const going = active.includes(booking.status);
  const hasDestination = booking.latitude != null && booking.longitude != null;
  const hasOwn = booking.technicianLatitude != null && booking.technicianLongitude != null;
  const myQuote = booking.applicants?.[0]?.quote ?? booking.price;
  const [receipt, setReceipt] = useState(false);
  const clashes = booking.status === 'รอยืนยัน' || booking.status === 'ยืนยันแล้ว' ? clashesWith(booking, bookings) : [];
  const hardClash = clashes.some(item => !item.soft);
  const cancellable = booking.status === 'รอยืนยัน' || booking.status === 'ยืนยันแล้ว';
  const traveling = booking.status === 'กำลังเดินทาง';

  return <article className="jb-job tj-job">
    <button type="button" className="ui-btn is-ghost is-sm jb-back" onClick={onBack}><ChevronLeft size={18}/> งานทั้งหมด</button>
    <header className={'jb-hero' + (cancelled ? ' is-off' : '')}>
      <div className="jb-hero-top">
        <span className="jb-code ui-num">{booking.code}</span>
        <span className="jb-hero-status">{booking.status}</span>
      </div>
      <h2>{booking.service} · {booking.unitCount || 1} เครื่อง</h2>
      <p className="jb-when"><CalendarClock size={16} aria-hidden="true"/> {shortDate(booking.date)} · {timeLabel(booking)}</p>
      {!cancelled && <Journey labels={techSteps} step={techStep(booking.status)}/>}
      <div className="jb-guide">
        <strong>{guide.title}</strong>
        <p>{guide.hint}</p>
      </div>
      {turn && <div className="ui-strip jb-turn" role="status"><ChevronRight size={18} aria-hidden="true"/><span>{turn}</span></div>}
    </header>

    {clashes.length > 0 && <p className={'ui-alert ' + (hardClash ? 'is-problem' : 'is-wait')}><CalendarX2 size={18}/><span>
      <strong>{hardClash ? 'เวลาชนกับงานอื่นของคุณ' : 'อาจชนกับงานอื่นของคุณ'}</strong> {clashes.map(item => `${item.job.code} ${timeLabel(item.job)}`).join(', ')}
      {booking.status === 'รอยืนยัน' ? ' · โทรคุยกับลูกค้าเพื่อเลื่อนเวลา หรือยกเลิกถ้าไปไม่ได้' : ''}
    </span></p>}

    {offer && <section className="ui-card tj-offer" aria-label="ข้อเสนอของคุณ">
      <Plate quiet num={'฿' + myQuote.toLocaleString()} unit="ราคาที่คุณเสนอ"
        meta={booking.market ? <span>ราคากลางงานนี้ {bahtRange(booking.market)}</span> : undefined}/>
      {booking.applicants?.[0]?.lines?.length ? <details className="pr-details"><summary>คิดจากใบราคาของคุณ</summary><PriceBreakdown lines={booking.applicants[0].lines}/></details> : null}
      {booking.offerDeadline && <p className="jb-note"><Clock3 size={16}/> ลูกค้าจะเลือกช่างภายใน {new Date(booking.offerDeadline).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. ถ้าไม่เลือก ข้อเสนอจะหมดอายุและคุณได้รับแจ้ง</p>}
      <p className="jb-note"><ShieldCheck size={16}/> ที่อยู่เต็มและเบอร์ลูกค้าจะแสดงเมื่อลูกค้าเลือกคุณ</p>
    </section>}

    {booking.status === 'รอยืนยัน' && <section className="ui-card">
      <button type="button" className="ui-btn is-primary is-lg is-block" onClick={() => onStatusChange(booking.id, 'ยืนยันแล้ว')}><Check size={20}/> รับงาน</button>
      <p className="jb-note">กดรับแล้ว งานจะขึ้นตารางของวันนัด ลูกค้าได้รับแจ้งทันที</p>
    </section>}

    {going && <section className="ui-card tj-go" aria-labelledby={`tj-go-${booking.id}`}>
      <div className="ui-card-head"><div><h2 id={`tj-go-${booking.id}`}>ที่ต้องไป</h2><p>{booking.customer} · {booking.propertyType || 'ที่พัก'}</p></div></div>
      <p className="tj-address">{booking.address}</p>
      {booking.customerPhone && <a className="ui-btn is-lg is-block tj-call" href={telLink(booking.customerPhone)} aria-label={`โทรหาลูกค้า ${formatPhone(booking.customerPhone)}`}>
        <Phone size={20} aria-hidden="true"/><span className="tj-call-label">โทรหาลูกค้า</span><span className="ui-num">{formatPhone(booking.customerPhone)}</span>
      </a>}
      {hasDestination && <div className="jb-map"><LocationMap key={booking.id + booking.status} center={hasOwn && traveling ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude! } : { latitude: booking.latitude!, longitude: booking.longitude! }}
        destination={{ latitude: booking.latitude!, longitude: booking.longitude!, label: 'บ้านลูกค้า', kind: 'destination' }}
        technician={hasOwn && traveling ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude!, label: 'ตำแหน่งของคุณ', kind: 'technician' } : undefined}
        accuracy={traveling ? booking.locationAccuracy ?? undefined : undefined} height={220} zoom={15}/></div>}
      {booking.status === 'ยืนยันแล้ว' && <button type="button" className="ui-btn is-primary is-lg is-block" onClick={() => onStatusChange(booking.id, 'กำลังเดินทาง')}><Send size={20}/> ออกเดินทาง</button>}
      <a className={'ui-btn is-lg is-block' + (traveling ? ' is-primary' : '')} href={mapsLink(booking)} target="_blank" rel="noreferrer"><Navigation size={20}/> นำทางด้วย Google Maps</a>
      {booking.status === 'ยืนยันแล้ว' && <p className="jb-note"><MapPin size={16}/> กดออกเดินทางแล้ว ลูกค้าเห็นตำแหน่งของคุณ เมื่อถึงหน้างานระบบรู้เองจาก GPS</p>}
      {traveling && <p className="ui-alert is-info tj-gps" role="status"><MapPin size={18}/><span>{gps.message || 'กำลังรับพิกัดจากอุปกรณ์'}</span><button type="button" className="ui-btn is-ghost is-sm" onClick={gps.retry}>ลองใหม่</button></p>}
    </section>}

    {(going || offer) && <section className="ui-card" aria-labelledby={`tj-work-${booking.id}`}>
      <h2 id={`tj-work-${booking.id}`}>งานที่ต้องทำ</h2>
      <dl className="jb-facts">
        {offer && <div><dt>พื้นที่</dt><dd>{booking.address}</dd></div>}
        <div><dt>แอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
        <div><dt>งานและสภาพแอร์</dt><dd>{jobCondition(booking)}</dd></div>
        {going && booking.notes && <div><dt>ข้อมูลจากลูกค้า</dt><dd className="jb-pre">{booking.notes}</dd></div>}
      </dl>
    </section>}

    {going && booking.rooms?.length ? <RoomChecklist booking={booking} onProgress={onProgress}/> : going && (booking.unitCount || 1) >= 3 && <UnitProgress booking={booking} onProgress={onProgress}/>}
    {going && booking.status !== 'รอชำระเงิน' && <PriceOnSite booking={booking} onPropose={payload => onProposeChange(booking.id, payload)} onWithdraw={changeId => onWithdrawChange(booking.id, changeId)}/>}
    {going && !techClosed(booking) && <FinishJob booking={booking} onComplete={onComplete}/>}

    {booking.status === 'เสร็จสิ้น' && <section className="ui-card">
      <Plate quiet num={'฿' + booking.price.toLocaleString()} unit={booking.paymentMethod === 'PromptPay' ? 'ได้รับเงินโอน' : 'ได้รับเงินสด'}
        meta={<span><CheckCircle2 size={15} aria-hidden="true"/> ปิดงานแล้ว{booking.customerRating ? ` · ลูกค้าให้ ${booking.customerRating} ดาว` : ''}</span>}/>
      {booking.paymentStatus === 'Paid' && <button type="button" className="ui-btn" onClick={() => setReceipt(true)}><FileText size={18}/> ใบเสร็จของงานนี้</button>}
      {receipt && <ReceiptSheet bookingId={booking.id} canIssue={false} onClose={() => setReceipt(false)}/>}
    </section>}
    {booking.status === 'เสร็จสิ้น' && <JobPhotoGallery bookingId={booking.id} className="ui-card"/>}
    {report && booking.status === 'เสร็จสิ้น' && <section className="ui-card">
      <h2>สรุปงานที่บันทึกไว้</h2>
      <p className="jb-report">{report.summary}</p>
      <ul className="jb-checks is-grid">{checklist.map(item => <li key={item.key} className={report[item.key] ? 'is-ok' : ''}>{report[item.key] ? <Check size={17} strokeWidth={3} aria-hidden="true"/> : <XCircle size={17} aria-hidden="true"/>} {item.label}<span className="sr-only">{report[item.key] ? ' (ทำแล้ว)' : ' (ไม่ได้ทำ)'}</span></li>)}</ul>
    </section>}

    {!going && !offer && <section className="ui-card jb-facts-card">
      <h2>รายละเอียดงาน</h2>
      <dl className="jb-facts">
        <div><dt>ลูกค้า</dt><dd>{booking.customer || '-'}</dd></div>
        <div><dt>สถานที่</dt><dd>{booking.address}</dd></div>
        <div><dt>แอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
        <div><dt>ค่าบริการ</dt><dd><span className="ui-num">฿{booking.price.toLocaleString()}</span> · เก็บเงินปลายทาง</dd></div>
      </dl>
    </section>}

    {(canReschedule(booking, 'technician') || cancellable) && <section className="ui-card jb-facts-card" aria-label="เปลี่ยนนัดหรือยกเลิก">
      <div className="jb-facts-actions">
        {canReschedule(booking, 'technician') && <button type="button" className="ui-btn" onClick={() => setMoving(true)}><CalendarClock size={18}/> เปลี่ยนวันนัด</button>}
        {cancellable && <TechCancel onConfirm={() => onStatusChange(booking.id, 'ยกเลิก')}/>}
      </div>
      {moving && <RescheduleSheet booking={booking} side="technician" onSend={(at, window, reason) => onReschedule(booking.id, at, window, reason)} onClose={() => setMoving(false)}/>}
    </section>}
  </article>;
}

/** "ล้างธรรมดา · ล้างล่าสุดเกิน 1 ปี · มีกลิ่นอับ": the clean asked for and what the customer said about the units. */
function jobCondition(booking: Booking): string {
  return [cleanName(Boolean(booking.deep)), booking.hardAccessUnits ? `คอยล์ร้อนเข้าถึงยาก ${booking.hardAccessUnits} เครื่อง` : '', conditionText(booking)].filter(Boolean).join(' · ');
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
  return <section className="ui-card tj-price" aria-labelledby={`tj-price-${booking.id}`}>
    <h2 id={`tj-price-${booking.id}`}>ราคาที่ตกลงกับลูกค้า</h2>
    {booking.priceLines?.length ? <PriceBreakdown lines={booking.priceLines} totalLabel="ยอดที่เก็บจากลูกค้า"/> : <p className="tj-amount ui-num">฿{booking.price.toLocaleString()}</p>}
    {last && !pending && <p className="jb-note">คำขอล่าสุด: ลูกค้า{last.status === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'} ({last.kind === 'correction' ? 'ปรับรายการแอร์' : 'งานเพิ่ม'} ฿{last.newPrice.toLocaleString()})</p>}
    {pending
      ? <div className="tj-pending" role="status">
        <strong>รอลูกค้าตอบ: ราคาใหม่ ฿{pending.newPrice.toLocaleString()} (เดิม ฿{pending.oldPrice.toLocaleString()})</strong>
        <span>“{pending.reason}” · ลูกค้าได้รับแจ้งแล้ว ให้ลูกค้ากดอนุมัติในแอป ระหว่างนี้ยังปิดงานไม่ได้</span>
        <button type="button" className="ui-btn" disabled={busy} onClick={async () => { setBusy(true); await onWithdraw(pending.id); setBusy(false); }}>{busy ? 'กำลังยกเลิก…' : 'ยกเลิกคำขอ'}</button>
      </div>
      : <>
        <p className="jb-note">แอร์ไม่ตรงกับที่ลูกค้าแจ้ง หรือต้องทำงานเพิ่ม? ขอในแอปให้ลูกค้ากดอนุมัติก่อน ห้ามเก็บเงินเกินยอดในแอป</p>
        <button type="button" className="ui-btn" onClick={() => setAsking(true)}><FilePen size={18}/> ขอปรับราคา / งานเพิ่ม</button>
      </>}
    {asking && <PriceChangeSheet booking={booking} onSend={onPropose} onClose={() => setAsking(false)}/>}
  </section>;
}

function localDate(offsetDays = 0) {
  const day = new Date(); day.setDate(day.getDate() + offsetDays);
  return new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Right after closing: the money on a plate, what was saved, today's and this month's takings, and where to go next. */
function JobFinished({ booking, bookings, next, onOpen, onFindJobs }: { booking: Booking; bookings: Booking[]; next?: Booking; onOpen: (id: number | null) => void; onFindJobs: () => void }) {
  const today = localDate();
  // Paid jobs: closed, or closed by the technician and waiting for the customer to confirm (the money is in hand).
  const paid = bookings.filter(item => item.status === 'เสร็จสิ้น' || techClosed(item));
  const doneToday = paid.filter(item => item.date === today);
  const month = today.slice(0, 7);
  const doneMonth = paid.filter(item => item.date.startsWith(month));
  const sum = (rows: Booking[]) => rows.reduce((total, item) => total + item.price, 0);
  const nextWhen = next ? (next.date === today ? 'วันนี้' : next.date === localDate(1) ? 'พรุ่งนี้' : shortDate(next.date)) : '';
  return <article className="tj-done" aria-live="polite">
    <header className="jb-hero tj-done-hero">
      <span className="tj-done-icon"><CheckCircle2 size={30} strokeWidth={2.2}/></span>
      <h1>ปิดงานเรียบร้อย</h1>
      <p className="tj-done-amount ui-num">+฿{booking.price.toLocaleString()}</p>
      <p className="tj-done-sub">{booking.paymentMethod === 'PromptPay' ? 'รับเงินโอน' : 'รับเงินสด'} · {booking.code} · {booking.customer}</p>
    </header>
    <section className="ui-card">
      <ul className="jb-checks">
        <li className="is-ok"><Check size={17} strokeWidth={3}/> บันทึกการรับเงินแล้ว</li>
        {booking.status === 'เสร็จสิ้น'
          ? <><li className="is-ok"><Check size={17} strokeWidth={3}/> บันทึกประวัติการล้างแอร์ให้ลูกค้าแล้ว</li><li className="is-ok"><Check size={17} strokeWidth={3}/> แจ้งลูกค้าให้ให้คะแนนคุณแล้ว</li></>
          : <li><Clock3 size={17} strokeWidth={2.6}/> แจ้งลูกค้าให้ยืนยันการจ่ายเงินแล้ว ถ้าไม่มีการแจ้งปัญหา ระบบปิดงานให้เองใน 3 วัน</li>}
      </ul>
      <dl className="tj-done-stats">
        <div><dt>วันนี้</dt><dd><span className="ui-num">฿{sum(doneToday).toLocaleString()}</span><small>{doneToday.length} งาน</small></dd></div>
        <div><dt>เดือนนี้</dt><dd><span className="ui-num">฿{sum(doneMonth).toLocaleString()}</span><small>{doneMonth.length} งาน</small></dd></div>
      </dl>
    </section>
    {next
      ? <section className="ui-card" aria-labelledby="tj-next">
        <div className="ui-card-head"><div><h2 id="tj-next">งานถัดไป · {nextWhen} {timeLabel(next)}</h2><p>{next.customer} · {next.unitCount || 1} เครื่อง · ฿{next.price.toLocaleString()}</p></div></div>
        <p className="tj-address">{next.address}</p>
        <button type="button" className="ui-btn is-primary is-lg is-block" onClick={() => onOpen(next.id)}>ไปงานถัดไป <ArrowRight size={20}/></button>
        <button type="button" className="ui-btn is-block" onClick={onFindJobs}><MapPin size={18}/> หางานเพิ่มใกล้ฉัน</button>
      </section>
      : <section className="ui-card" aria-labelledby="tj-next">
        <div className="ui-card-head"><div><h2 id="tj-next">ไม่มีงานที่ต้องไปต่อ</h2><p>ดูงานใหม่ใกล้ตัวแล้วส่งข้อเสนอได้เลย</p></div></div>
        <button type="button" className="ui-btn is-primary is-lg is-block" onClick={onFindJobs}><MapPin size={20}/> หางานใหม่ใกล้ฉัน</button>
      </section>}
    <button type="button" className="ui-btn is-ghost tj-done-all" onClick={() => onOpen(null)}><ClipboardList size={18}/> ดูงานทั้งหมด</button>
  </article>;
}

/** Cancelling a job the technician cannot do; asks once, after suggesting a call to the customer. */
function TechCancel({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="ui-btn is-danger" onClick={() => setAsking(true)}><XCircle size={18}/> ยกเลิกงานนี้</button>;
  return <div className="jb-confirm is-danger" role="alertdialog" aria-label="ยืนยันยกเลิกงาน">
    <p>ยกเลิกงานนี้? ลูกค้าจะได้รับแจ้งและต้องหาช่างใหม่ ถ้าแค่ไม่สะดวกวันนี้ ลองโทรตกลงวันใหม่กับลูกค้า แล้วกด “เปลี่ยนวันนัด” แทน</p>
    <div className="jb-confirm-actions"><button type="button" className="ui-btn is-danger" onClick={onConfirm}>ยกเลิกงาน</button><button type="button" className="ui-btn" onClick={() => setAsking(false)}>ไม่ยกเลิก</button></div>
  </div>;
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
  return <section className="ui-card" aria-labelledby={`tj-rooms-${booking.id}`}>
    <h2 id={`tj-rooms-${booking.id}`}>ห้องที่ล้างแล้ว</h2>
    <RoomBoard rooms={rooms} onToggle={name => { taps.current++; setRooms(list => list.map(room => room.name === name ? { ...room, done: !room.done } : room)); setDirty(true); }}/>
    <p className="jb-note" aria-live="polite">{saving ? 'กำลังบันทึก…' : 'แตะห้องเมื่อล้างเสร็จ ลูกค้าเห็นทันทีว่าห้องไหนเสร็จแล้ว'}</p>
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
  return <section className="ui-card" aria-labelledby={`tj-units-${booking.id}`}>
    <h2 id={`tj-units-${booking.id}`}>ล้างไปแล้ว</h2>
    <div className="tj-progress-row">
      <button type="button" className="ui-btn is-lg" aria-label="ลดหนึ่งเครื่อง" disabled={done <= 0} onClick={() => setDone(value => Math.max(0, value - 1))}><Minus size={24}/></button>
      <strong aria-live="polite"><span className="ui-num">{done}</span><small> / {total} เครื่อง</small></strong>
      <button type="button" className="ui-btn is-primary is-lg" aria-label="เพิ่มหนึ่งเครื่อง" disabled={done >= total} onClick={() => setDone(value => Math.min(total, value + 1))}><Plus size={24}/></button>
    </div>
    <div className="jb-bar" aria-hidden="true"><span style={{ width: `${(done / total) * 100}%` }}/></div>
    <p className="jb-note">{saving ? 'กำลังบันทึก…' : 'กด + ทุกครั้งที่ล้างเสร็จหนึ่งเครื่อง ลูกค้าเห็นความคืบหน้าทันที'}</p>
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
  return <section className="ui-card tj-finish" aria-labelledby={`tj-finish-${booking.id}`}>
    <div className="ui-card-head"><div><h2 id={`tj-finish-${booking.id}`}>ล้างเสร็จแล้ว? ปิดงานที่นี่</h2><p>กดครั้งเดียวหลังล้างเสร็จและได้รับเงินแล้ว ลูกค้าได้รับแจ้งให้ยืนยันการจ่ายเงิน และระบบบันทึกประวัติการล้างแอร์ให้เอง</p></div></div>
    <div className="tj-photos">
      <h3>1. ถ่ายรูปหลังล้าง</h3>
      <p className="jb-note">อย่างน้อย 1 รูป ลูกค้าจะเห็นรูปในงานของเขา</p>
      <JobPhotoPicker bookingId={booking.id} onChange={setPhotos}/>
    </div>
    <div className="tj-collect">
      <h3>2. เก็บเงินจากลูกค้า</h3>
      <Plate quiet num={'฿' + booking.price.toLocaleString()} unit="ตามยอดในแอป"/>
      <div className="ui-tabs" role="group" aria-label="ลูกค้าจ่ายด้วย">
        <button type="button" aria-pressed={method === 'Cash'} onClick={() => setMethod('Cash')}><Banknote size={19}/> เงินสด</button>
        <button type="button" aria-pressed={method === 'PromptPay'} onClick={() => setMethod('PromptPay')}><Smartphone size={19}/> โอน</button>
      </div>
    </div>
    <details className="tj-more">
      <summary>รายการที่ทำ (ติ๊กไว้ให้แล้ว) และหมายเหตุ</summary>
      <div className="tj-checkgrid">{checklist.map(item => <label key={item.key} className="ui-check"><input type="checkbox" checked={checks[item.key]} onChange={event => setChecks(prev => ({ ...prev, [item.key]: event.target.checked }))}/> {item.label}</label>)}</div>
      <div className="ui-field"><label htmlFor={`tj-note-${booking.id}`}>หมายเหตุถึงลูกค้า (ไม่บังคับ)</label><textarea id={`tj-note-${booking.id}`} className="ui-textarea" rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="เช่น แนะนำล้างทุก 6 เดือน ท่อน้ำทิ้งปกติ"/></div>
    </details>
    {asking
      ? <div className="jb-confirm" role="alertdialog" aria-label="ยืนยันปิดงาน">
        <p>ยืนยันว่าล้างเสร็จและได้รับเงิน <strong className="ui-num">฿{booking.price.toLocaleString()}</strong> ({method === 'Cash' ? 'เงินสด' : 'โอน'}) แล้ว</p>
        <div className="jb-confirm-actions"><button type="button" className="ui-btn is-primary is-lg" disabled={busy} aria-busy={busy} onClick={() => void finish()}>{busy ? 'กำลังบันทึก…' : 'ยืนยันปิดงาน'}</button><button type="button" className="ui-btn is-lg" disabled={busy} onClick={() => setAsking(false)}>ยังไม่ปิด</button></div>
      </div>
      : <>
        <button type="button" className="ui-btn is-primary is-lg is-block" disabled={!photosReady || waiting} onClick={() => setAsking(true)}><CheckCircle2 size={20}/> งานเสร็จและได้รับเงินแล้ว</button>
        {waiting && <p className="jb-note tj-needed">รอลูกค้าตอบคำขอปรับราคาก่อน หรือยกเลิกคำขอ</p>}
        {!waiting && !photosReady && <p className="jb-note tj-needed">เพิ่มรูปหลังล้างก่อนปิดงาน</p>}
        {photos.failed && photos.after === 0 && <p className="jb-note tj-needed">อัปโหลดรูปไม่ได้ ปิดงานต่อได้ แล้วเพิ่มรูปภายหลังภายใน 1 วัน</p>}
      </>}
  </section>;
}
