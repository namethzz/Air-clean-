import { timeLabel } from '../../lib/time';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Banknote, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileText, History, Phone,
  MapPin, Plus, RotateCcw, ShieldCheck, Smartphone, Star, Timer, Wrench, X,
} from 'lucide-react';
import { RescheduleSheet, canReschedule, formatPhone, telLink } from '../../components/job/Reschedule';
import ReceiptSheet from '../../components/job/ReceiptSheet';
import { RoomBoard } from '../../components/booking/Rooms';
import { JobPhotoGallery } from '../../components/job/JobPhotos';
import StatusBadge from '../../components/job/StatusBadge';
import LocationMap from '../../components/job/LocationMap';
import { awaitingPriceAnswer, currentStep, guideFor, isClosedForCustomer, journeySteps, minutesToPick, needsAction, sortJobs } from '../../lib/jobFlow';
import type { Booking, BookingApplicant, BookingStatus, PaymentMethod, ServiceReportRecord, JobFocus } from '../../types';
import { Journey, useIsWide } from '../../components/job/JobStepper';
import Avatar from '../../components/Avatar';
import { Plate, PhotoCard, Steps } from '../../components/kit';
import { nextCleaning } from '../../lib/cleaning';
import { webLink } from '../../lib/links';
import { bahtRange, cleanName, conditionText, included, kindNames, notIncluded, positionNames, positionOf } from '../../lib/pricing';
import { PriceBreakdown } from '../../components/job/Pricing';
import type { PriceChange } from '../../types';
import filterPhoto from '../../assets/hero/photo-filter.webp';
import inspectPhoto from '../../assets/hero/photo-inspect.webp';
import './CustomerJobs.css';
import '../../components/job/Jobs.css';

interface Props {
  bookings: Booking[];
  reports: ServiceReportRecord[];
  focus: JobFocus | null;
  onNewBooking: () => void;
  onSelectTechnician: (bookingId: number, technicianId: number) => Promise<boolean>;
  onStatusChange: (id: number, status: BookingStatus) => void;
  onPaymentConfirm: (id: number, method: PaymentMethod) => void;
  onPaymentIssue: (id: number, reason: string) => void;
  onReportProblem: (id: number, reason: string) => Promise<boolean>;
  onOpenPassport: () => void;
  onReview: (bookingId: number, rating: number, comment: string) => Promise<boolean>;
  onReschedule: (id: number, scheduledAt: string, timeWindow?: string, reason?: string) => Promise<boolean>;
  onReopen: (id: number) => Promise<boolean>;
  onAnswerChange: (id: number, changeId: string, approve: boolean) => Promise<boolean>;
  onRefresh: () => void;
}

const checklist = [
  { key: 'cleanedFilter', label: 'ทำความสะอาดแผ่นกรอง' },
  { key: 'cleanedCoil', label: 'ทำความสะอาดคอยล์' },
  { key: 'checkedDrain', label: 'ตรวจท่อน้ำทิ้ง' },
  { key: 'checkedCooling', label: 'ตรวจการทำงานของเครื่อง' },
] as const;

const day = (date: string) => new Date(date + 'T00:00:00');
function shortDate(date: string) {
  return day(date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}
const units = (booking: Booking) => booking.unitCount && booking.unitCount > 1 ? ` · ${booking.unitCount} เครื่อง` : '';
const baht = (value: number) => '฿' + value.toLocaleString();

/** Customer's single place for a job: offers, tracking, payment and the service report. Building managers use it too. */
export default function CustomerJobsPage(props: Props) {
  const { bookings, reports, focus, onNewBooking, onRefresh } = props;
  const wide = useIsWide();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const open = useMemo(() => sortJobs(bookings.filter(item => !isClosedForCustomer(item)), reports), [bookings, reports]);
  const closed = useMemo(() => bookings.filter(isClosedForCustomer).sort((a, b) => b.id - a.id), [bookings]);

  useEffect(() => {
    if (!focus) return;
    const target = bookings.find(item => item.id === focus.id);
    setSelectedId(focus.id);
    if (target) setTab(isClosedForCustomer(target) ? 'closed' : 'open');
  }, [focus?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open.length) return;
    const timer = window.setInterval(onRefresh, 10000);
    return () => window.clearInterval(timer);
  }, [open.length, onRefresh]);

  const shown = tab === 'open' ? open : closed;
  const selected = bookings.find(item => item.id === selectedId) ?? (wide ? shown[0] : undefined);
  const actionCount = open.filter(item => needsAction(item, reports)).length;
  // Minutes left to pick a technician tick down on the list too.
  const now = useNow(open.some(item => item.offerDeadline && item.status === 'รอเลือกช่าง') ? 30000 : 0);

  const due = nextCleaning(bookings);
  const doneCount = bookings.filter(item => item.status === 'เสร็จสิ้น').length;

  if (!bookings.length) {
    return <div className="ui-page is-narrow jb-first">
      <PhotoCard src={inspectPhoto} alt="ช่างแอร์ถือแฟ้มตรวจเช็กแอร์ติดผนัง" position="62% 35%" className="jb-first-photo"
        title="ยังไม่มีงานล้างแอร์"
        action={<button type="button" className="ui-btn is-light is-lg" onClick={onNewBooking}><Plus size={20}/> ขอช่างล้างแอร์</button>}>
        ส่งคำขอครั้งเดียว ช่างในพื้นที่ที่สนใจจะเสนอราคาให้คุณเลือก
      </PhotoCard>
      <section className="ui-card" aria-labelledby="jb-first-how">
        <div className="ui-card-head"><div><h2 id="jb-first-how">งานของคุณจะมาอยู่ที่นี่</h2><p>ติดตามได้ทุกขั้น ตั้งแต่ส่งคำขอจนล้างเสร็จ</p></div></div>
        <Steps items={[
          { title: 'ส่งคำขอ', text: 'บอกที่อยู่ จำนวนแอร์ และวันที่สะดวก ใช้เวลาไม่ถึงนาที' },
          { title: 'เลือกช่างจากข้อเสนอ', text: 'เทียบราคา คะแนน และโปรไฟล์ของช่างใกล้บ้าน' },
          { title: 'ช่างมาล้าง แล้วจ่ายเมื่อเสร็จ', text: 'ดูตำแหน่งช่างระหว่างเดินทาง เงินสดหรือโอนก็ได้' },
        ]}/>
      </section>
    </div>;
  }

  return <div className={'jb' + (selected && !wide ? ' is-detail' : '')}>
    <section className="jb-list" aria-label="รายการงาน">
      <dl className="jb-summary">
        <div><dt>กำลังดำเนินการ</dt><dd className="ui-num">{open.length}</dd></div>
        <div className={actionCount ? 'is-turn' : ''}><dt>รอคุณทำต่อ</dt><dd className="ui-num">{actionCount}</dd></div>
        <div><dt>ล้างแล้ว</dt><dd><span className="ui-num">{doneCount}</span> ครั้ง</dd></div>
      </dl>
      {actionCount > 0 && <p className="jb-list-turn"><span className="ui-badge is-turn">ถึงตาคุณ</span> งานที่มีป้ายนี้ต้องให้คุณทำต่อ</p>}
      <div className="ui-tabs" role="tablist" aria-label="กลุ่มงาน">
        <button type="button" role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>กำลังดำเนินการ <span className="ui-num">{open.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'closed'} onClick={() => setTab('closed')}>เสร็จสิ้นและยกเลิก <span className="ui-num">{closed.length}</span></button>
      </div>
      {shown.length === 0
        ? <p className="jb-none">{tab === 'open' ? 'ไม่มีงานที่กำลังดำเนินการ' : 'ยังไม่มีงานที่ปิดแล้ว'}</p>
        : <ul className="jb-rows">{shown.map(item => {
          const urgent = needsAction(item, reports);
          const guide = guideFor(item);
          const left = minutesToPick(item, now);
          const choosing = left != null && (item.applicants?.length ?? 0) > 0;
          const active = selected?.id === item.id;
          return <li key={item.id}>
            <button type="button" className={'jb-row' + (active ? ' is-active' : '') + (urgent ? ' is-turn' : '')} aria-current={active ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
              <span className="jb-date"><strong>{day(item.date).getDate()}</strong><small>{day(item.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
              <span className="jb-row-text">
                <strong>{item.service}{units(item)}</strong>
                <span>{guide.short}</span>
                <small>{shortDate(item.date)} · {timeLabel(item)}</small>
                {urgent ? <span className="ui-badge is-turn">{choosing ? `เลือกช่างใน ${left} นาที` : 'ถึงตาคุณ'}</span> : <StatusBadge status={item.status}/>}
              </span>
              <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
            </button>
          </li>;
        })}</ul>}
      {due && <button type="button" className={'jb-due' + (due.overdue ? ' is-due' : '')} onClick={props.onOpenPassport}>
        <span className="jb-due-icon" aria-hidden="true"><CalendarClock size={22}/></span>
        <span className="jb-due-text">
          <small>{due.overdue ? 'รอบล้างแอร์' : 'ล้างครั้งถัดไป'}</small>
          <strong>{due.overdue ? 'ถึงรอบล้างแอร์แล้ว' : due.next.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</strong>
          <span>ล้างล่าสุด {shortDate(due.last.date)} · แนะนำทุก 6 เดือน</span>
        </span>
        <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
      </button>}
      <PhotoCard src={filterPhoto} alt="ช่างแอร์ใส่หมวกสีฟ้าถอดแผ่นกรองแอร์ออกมาล้าง" position="35% 40%" className="jb-invite"
        title="มีแอร์เครื่องอื่นต้องล้างไหม"
        action={<button type="button" className="ui-btn is-light" onClick={onNewBooking}><Plus size={18}/> ขอช่างล้างแอร์</button>}>
        ส่งคำขอใหม่ได้ทุกเมื่อ ช่างใกล้บ้านเสนอราคาให้คุณเลือก
      </PhotoCard>
    </section>

    <section className="jb-detail" aria-label="รายละเอียดงาน">
      {selected ? <JobDetail key={selected.id} {...props} booking={selected} onBack={() => setSelectedId(null)}/> : <p className="jb-pick">เลือกงานจากรายการเพื่อดูรายละเอียด</p>}
    </section>
  </div>;
}

/** What the customer has to do now, said on the reflective strip; null when nothing is theirs to do. */
function turnFor(booking: Booking): string | null {
  if (awaitingPriceAnswer(booking)) return 'ช่างขอปรับราคา อนุมัติหรือไม่อนุมัติด้านล่าง';
  if (booking.status === 'หมดเวลาเลือกช่าง') return 'เปิดรับข้อเสนออีกครั้ง หรือเลือกวันนัดใหม่ ด้านล่าง';
  if (booking.status === 'รอชำระเงิน' && !booking.customerConfirmedPayment)
    return booking.technicianConfirmedPayment ? 'ช่างแจ้งว่าได้รับเงินแล้ว ยืนยันหรือแจ้งปัญหาด้านล่าง' : 'จ่ายเงินให้ช่าง แล้วกดยืนยันด้านล่าง';
  if (booking.status === 'เสร็จสิ้น' && !booking.customerRating && !isClosedForCustomer(booking)) return 'ให้คะแนนช่างด้านล่าง';
  return null;
}

function JobDetail({ booking, reports, onBack, onNewBooking, onSelectTechnician, onStatusChange, onPaymentConfirm, onPaymentIssue, onReview, onReportProblem, onOpenPassport, onRefresh, onReschedule, onReopen, onAnswerChange }: Props & { booking: Booking; onBack: () => void }) {
  const guide = guideFor(booking);
  const [moving, setMoving] = useState(false);
  const report = reports.find(item => item.bookingId === booking.id);
  const cancelled = booking.status === 'ยกเลิก';
  const choosing = booking.status === 'เปิดรับช่าง' || booking.status === 'รอเลือกช่าง';
  const hasTech = !choosing && !cancelled && booking.status !== 'หมดเวลาเลือกช่าง' && booking.technicianId > 0 && booking.technician && booking.technician !== '-';
  const lapsed = booking.status === 'หมดเวลาเลือกช่าง';
  const cancellable = choosing || lapsed;
  const counting = booking.status === 'รอเลือกช่าง' && booking.offerDeadline && (booking.applicants?.length ?? 0) > 0;
  const turn = turnFor(booking);

  return <article className="jb-job">
    <button type="button" className="ui-btn is-ghost is-sm jb-back" onClick={onBack}><ChevronLeft size={18}/> งานทั้งหมด</button>
    <header className={'jb-hero' + (cancelled ? ' is-off' : '')}>
      <div className="jb-hero-top">
        <span className="jb-code ui-num">{booking.code}</span>
        <span className="jb-hero-status">{booking.status}</span>
      </div>
      <h2>{booking.service}{units(booking)}</h2>
      <p className="jb-when"><CalendarClock size={16} aria-hidden="true"/> {shortDate(booking.date)} · {timeLabel(booking)}</p>
      {!cancelled && <Journey labels={journeySteps} step={currentStep(booking)}/>}
      <div className="jb-guide">
        <strong>{guide.title}</strong>
        <p>{guide.hint}</p>
      </div>
      {counting ? <PickClock deadline={booking.offerDeadline!} onTimeUp={onRefresh}/> : turn && <div className="ui-strip jb-turn" role="status"><ChevronRight size={18} aria-hidden="true"/><span>{turn}</span></div>}
    </header>

    {booking.rooms?.length && !cancelled && (booking.unitsDone ?? 0) > 0 ? <section className="ui-card"><RoomBoard rooms={booking.rooms}/></section> : null}
    {!booking.rooms?.length && (booking.unitsDone ?? 0) > 0 && booking.status !== 'เสร็จสิ้น' && !cancelled && <section className="ui-card jb-units">
      <p>ช่างล้างไปแล้ว <strong className="ui-num">{booking.unitsDone}</strong> จาก {booking.unitCount} เครื่อง</p>
      <div className="jb-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, ((booking.unitsDone ?? 0) / Math.max(1, booking.unitCount ?? 1)) * 100)}%` }}/></div>
    </section>}

    {awaitingPriceAnswer(booking) && <ChangeAnswer booking={booking} change={booking.pendingChange!} onAnswer={approve => onAnswerChange(booking.id, booking.pendingChange!.id, approve)}/>}
    {choosing && <Offers booking={booking} onSelect={onSelectTechnician} onRefresh={onRefresh}/>}
    {lapsed && <Reopen booking={booking} onReopen={() => onReopen(booking.id)} onNewDate={() => setMoving(true)}/>}
    {(booking.status === 'กำลังเดินทาง' || booking.status === 'ถึงหน้างาน') && <Tracking booking={booking}/>}
    {(booking.status === 'รอชำระเงิน' || booking.status === 'มีปัญหาการชำระเงิน') && <Payment booking={booking} onConfirm={onPaymentConfirm} onIssue={onPaymentIssue}/>}
    {booking.status === 'เสร็จสิ้น' && <Review booking={booking} onReview={onReview}/>}

    {hasTech && <TechnicianCard booking={booking}/>}
    {booking.status === 'เสร็จสิ้น' && <AfterService booking={booking} onNewBooking={onNewBooking} onOpenPassport={onOpenPassport} onReportProblem={onReportProblem}/>}
    {report && <ReportBlock report={report}/>}
    {booking.status === 'เสร็จสิ้น' && <JobPhotoGallery bookingId={booking.id} title="รูปงานจากช่าง" className="ui-card"/>}

    <section className="ui-card jb-facts-card">
      <h2>รายละเอียดงาน</h2>
      <dl className="jb-facts">
        <div><dt>สถานที่</dt><dd>{booking.address}</dd></div>
        <div><dt>ที่พักและแอร์</dt><dd>{booking.propertyType || 'ที่พัก'} · {booking.unitCount || 1} เครื่อง{booking.unitLabel ? ` · ${booking.unitLabel}` : ''}</dd></div>
        {conditionText(booking) ? <div><dt>สภาพแอร์</dt><dd>{conditionText(booking)}</dd></div> : null}
        {booking.rooms?.length ? <div><dt>ห้อง</dt><dd>{booking.rooms.length} ห้อง · {booking.rooms.map(room => room.name).slice(0, 12).join(', ')}{booking.rooms.length > 12 ? ' …' : ''}</dd></div> : null}
        {booking.notes && <div><dt>ข้อมูลสำหรับช่าง</dt><dd className="jb-pre">{booking.notes}</dd></div>}
        {choosing && booking.market
          ? <div><dt>{booking.market.reference ? 'ราคาอ้างอิง' : 'ราคากลางงานนี้'}</dt><dd><span className="ui-num">{bahtRange(booking.market)}</span> · ราคาจริงตามที่ช่างเสนอ</dd></div>
          : <div><dt>{choosing ? 'ราคาประเมินเริ่มต้น' : 'ราคาที่ตกลง'}</dt><dd><span className="ui-num">{baht(booking.price)}</span> · เก็บเงินปลายทาง</dd></div>}
      </dl>
      {!choosing && booking.priceLines?.length ? <details className="pr-details jb-lines"><summary>ดูรายการราคา</summary><PriceBreakdown lines={booking.priceLines} totalLabel="ยอดที่ต้องจ่าย"/></details> : null}
      {(canReschedule(booking, 'customer') || cancellable) && <div className="jb-facts-actions">
        {canReschedule(booking, 'customer') && <button type="button" className="ui-btn" onClick={() => setMoving(true)}><CalendarClock size={18}/> เปลี่ยนวัน / เวลานัด</button>}
        {cancellable && <CancelRequest onConfirm={() => onStatusChange(booking.id, 'ยกเลิก')}/>}
      </div>}
      {moving && <RescheduleSheet booking={booking} side="customer" onSend={(at, window, reason) => onReschedule(booking.id, at, window, reason)} onClose={() => setMoving(false)}/>}
    </section>
  </article>;
}

/** Who is coming: the person first, then the one thing to do with them while the job is open — call. */
function TechnicianCard({ booking }: { booking: Booking }) {
  const chosen = booking.applicants?.find(item => item.selected);
  const open = !['เสร็จสิ้น', 'ยกเลิก'].includes(booking.status);
  return <section className="ui-card jb-tech">
    <h2>ช่างของคุณ</h2>
    <div className="jb-person">
      <span className="jb-avatar" aria-hidden="true"><Avatar name={booking.technician} photoId={booking.technicianPhotoId}/></span>
      <div>
        <strong>{booking.technician}</strong>
        <span>
          {chosen?.verified && <span className="ui-badge is-done">ผ่านการตรวจสอบ</span>}
          {chosen && <>{chosen.title}{chosen.rating ? <> · <Star size={14} fill="currentColor" aria-hidden="true"/> {chosen.rating.toFixed(1)}</> : null}</>}
        </span>
      </div>
    </div>
    {booking.technicianPhone && open && <a className="ui-btn is-primary is-lg is-block jb-call" href={telLink(booking.technicianPhone)} aria-label={`โทรหาช่าง ${formatPhone(booking.technicianPhone)}`}>
      <Phone size={20}/><span>โทรหาช่าง</span><span className="ui-num jb-call-number">{formatPhone(booking.technicianPhone)}</span>
    </a>}
  </section>;
}

/** Re-renders every `every` ms (0 = not at all) and returns the current time. */
function useNow(every: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!every) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

const PICK_WINDOW_MS = 60 * 60 * 1000;

/** The hour to choose, on the reflective strip: a clock and a draining bar. Refreshes the job when it runs out. */
function PickClock({ deadline, onTimeUp }: { deadline: string; onTimeUp: () => void }) {
  const now = useNow(1000);
  const end = new Date(deadline).getTime();
  const left = Math.max(0, end - now);
  const done = useRef(false);
  useEffect(() => { if (left === 0 && !done.current) { done.current = true; window.setTimeout(onTimeUp, 1500); } }, [left, onTimeUp]);
  const minutes = Math.floor(left / 60000), seconds = Math.floor((left % 60000) / 1000);
  const clock = new Date(end).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const low = left <= 10 * 60000;
  return <div className={'ui-strip jb-clock' + (low ? ' is-low' : '')} role="timer" aria-live="off" aria-label={`เหลือเวลาเลือกช่าง ${minutes} นาที`}>
    <Timer size={20} aria-hidden="true"/>
    <div className="jb-clock-text">
      <strong>{left === 0 ? 'หมดเวลาแล้ว กำลังอัปเดต…' : <>เลือกช่างภายใน <b className="ui-num">{minutes}:{String(seconds).padStart(2, '0')}</b></>}</strong>
      <span>ก่อน {clock} น. ไม่อย่างนั้นข้อเสนอจะหมดอายุ</span>
      <div className="jb-clock-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (left / PICK_WINDOW_MS) * 100)}%` }}/></div>
    </div>
  </div>;
}

/** The offers lapsed: one tap opens the request again (a new date first if the old one has passed). */
function Reopen({ booking, onReopen, onNewDate }: { booking: Booking; onReopen: () => Promise<boolean>; onNewDate: () => void }) {
  const [busy, setBusy] = useState(false);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const passed = day(booking.date) < today;
  return <section className="ui-card">
    {passed
      ? <><p className="jb-note"><CalendarClock size={16}/> วันนัดเดิม ({shortDate(booking.date)}) ผ่านไปแล้ว เลือกวันใหม่ก่อน แล้วค่อยเปิดรับข้อเสนอ</p>
        <button type="button" className="ui-btn is-primary is-lg is-block" onClick={onNewDate}><CalendarClock size={19}/> เลือกวันนัดใหม่</button></>
      : <><button type="button" className="ui-btn is-primary is-lg is-block" disabled={busy} aria-busy={busy} onClick={async () => { setBusy(true); await onReopen(); setBusy(false); }}><RotateCcw size={19}/> {busy ? 'กำลังเปิดรับ…' : 'เปิดรับข้อเสนออีกครั้ง'}</button>
        <p className="jb-note">ช่างใกล้บ้านจะเห็นงานนี้อีกครั้ง และเมื่อมีข้อเสนอแรก คุณมีเวลาเลือก 1 ชั่วโมง</p></>}
  </section>;
}

/** Offers as plates: the first in the chosen order is the blue one, the rest are white. Choosing asks once more. */
function Offers({ booking, onSelect, onRefresh }: { booking: Booking; onSelect: Props['onSelectTechnician']; onRefresh: () => void }) {
  const [sort, setSort] = useState<'price' | 'rating'>('price');
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const offers = [...(booking.applicants ?? [])].sort((a, b) => sort === 'price' ? a.quote - b.quote : b.rating - a.rating);
  const cheapest = offers.length > 1 ? Math.min(...offers.map(item => item.quote)) : null;

  if (!offers.length) return <section className="jb-waiting" aria-live="polite">
    <div className="ui-alert is-info"><Clock3 size={18}/><span><strong>ยังไม่มีข้อเสนอ</strong>ช่างใกล้บ้านเห็นคำขอแล้ว ข้อเสนอจะขึ้นที่นี่ทันที ระบบตรวจให้อัตโนมัติ</span></div>
    <div className="ui-skeleton jb-skel" aria-hidden="true"/>
    <div className="ui-skeleton jb-skel is-short" aria-hidden="true"/>
  </section>;

  async function choose(offer: BookingApplicant) {
    setBusy(true);
    const ok = await onSelect(booking.id, offer.technicianId);
    setBusy(false);
    setAsking(null);
    if (ok) onRefresh();
  }

  return <section className="ui-section jb-offers" aria-label="ข้อเสนอจากช่าง">
    <div className="ui-section-head">
      <h2>ข้อเสนอ {offers.length} ราย</h2>
      {offers.length > 1 && <div className="jb-sort" role="group" aria-label="เรียงข้อเสนอ">
        <button type="button" className="ui-chip" aria-pressed={sort === 'price'} onClick={() => setSort('price')}>ราคาต่ำสุด</button>
        <button type="button" className="ui-chip" aria-pressed={sort === 'rating'} onClick={() => setSort('rating')}>คะแนนสูงสุด</button>
      </div>}
    </div>
    {booking.market && <div className="pr-market jb-market">
      <div className="pr-market-head"><span>{booking.market.reference ? 'ราคาอ้างอิงงานนี้' : `ช่าง ${booking.market.technicians} คนในระบบ ส่วนใหญ่คิดงานนี้`}</span><strong className="ui-num">{bahtRange(booking.market)}</strong></div>
      <p>ทุกข้อเสนอคืองานเดียวกัน: {cleanName(Boolean(booking.deep))} {jobText(booking)} ราคาที่ต่ำหรือสูงกว่าราคากลางมาก ดูคะแนนและรีวิวประกอบ</p>
    </div>}
    <ul className="jb-plates">{offers.map((offer, index) => {
      const lead = index === 0;
      const position = offer.position ?? (booking.market ? positionOf(offer.quote, booking.market) : null);
      return <li key={offer.technicianId}>
        <Plate quiet={!lead} className="jb-offer"
          num={baht(offer.quote)}
          side={<span className="jb-offer-avatar"><Avatar name={offer.name} photoId={offer.photoId}/></span>}
          meta={<>
            <span className="jb-offer-name"><strong>{offer.name}</strong>{offer.verified && <span className="ui-plate-tag"><ShieldCheck size={13}/> ตรวจแล้ว</span>}{cheapest === offer.quote && <span className="ui-plate-tag">ถูกที่สุด</span>}{position && <span className={'pr-pos is-' + position}>{positionNames[position]}</span>}</span>
            <span className="jb-offer-stats"><span><Star size={14} fill="currentColor" aria-hidden="true"/> {offer.rating.toFixed(1)} ({offer.reviewCount} รีวิว)</span><span><Wrench size={14} aria-hidden="true"/> {offer.jobsCompleted} งาน</span><span><MapPin size={14} aria-hidden="true"/> {offer.area}</span></span>
            {offer.note && <span className="jb-offer-note">“{offer.note}”</span>}
          </>}/>
        {offer.lines?.length ? <details className="pr-details jb-offer-lines"><summary>ราคานี้คิดอย่างไร</summary><PriceBreakdown lines={offer.lines}/></details> : null}
        {asking === offer.technicianId
          ? <div className="jb-confirm" role="alertdialog" aria-label={`ยืนยันเลือก ${offer.name}`}>
            <p>เลือก <strong>{offer.name}</strong> ในราคา <strong className="ui-num">{baht(offer.quote)}</strong> ราคานี้จะล็อกไว้ ช่างบวกเพิ่มเองไม่ได้ ที่อยู่เต็มและเบอร์ของคุณจะเปิดให้ช่างคนนี้เท่านั้น</p>
            <div className="jb-confirm-actions">
              <button type="button" className="ui-btn is-primary is-lg" disabled={busy} aria-busy={busy} onClick={() => void choose(offer)}>{busy ? 'กำลังยืนยัน…' : 'ยืนยันเลือกช่างคนนี้'}</button>
              <button type="button" className="ui-btn is-lg" disabled={busy} onClick={() => setAsking(null)}>ยังไม่เลือก</button>
            </div>
          </div>
          : <button type="button" className={'ui-btn is-lg is-block jb-pick-btn' + (lead ? ' is-primary' : '')} disabled={busy || offer.selected} onClick={() => setAsking(offer.technicianId)}>
            <span>เลือก {offer.name.split(' ')[0]}</span> <span className="ui-num">{baht(offer.quote)}</span> <ChevronRight size={18}/>
          </button>}
      </li>;
    })}</ul>
    <div className="pr-promise">
      <strong><ShieldCheck size={18} aria-hidden="true"/>ทุกราคารวม{cleanName(Boolean(booking.deep))}ครบตามนี้</strong>
      <ul>{included[booking.deep ? 'deep' : 'standard'].map(text => <li key={text}>{text}</li>)}</ul>
      <span>{notIncluded} ถ้าหน้างานต้องทำเพิ่ม ช่างต้องขอในแอปพร้อมเหตุผล และราคาเปลี่ยนเมื่อคุณกดอนุมัติเท่านั้น · ยังไม่มีการเก็บเงินจนกว่างานจะเสร็จ</span>
    </div>
  </section>;
}

/** "แอร์ติดผนัง 2 เครื่อง (ใหญ่ 1) และฝังฝ้า 1 เครื่อง": the units in words, from the job's description. */
function jobText(booking: Booking): string {
  const items = booking.items ?? [];
  if (!items.length) return `${booking.unitCount ?? 1} เครื่อง`;
  return items.map(item => `แอร์${kindNames[item.kind]} ${item.count} เครื่อง${item.large ? ` (ใหญ่ ${item.large})` : ''}`).join(' และ ')
    + (booking.hardAccessUnits ? ` · คอยล์ร้อนเข้าถึงยาก ${booking.hardAccessUnits} เครื่อง` : '') + ' ·';
}

/**
 * The technician asked to change the price on site. Old and new price side by side, the reason in their words, the
 * lines, and two plain answers. Declining keeps the job as agreed.
 */
function ChangeAnswer({ booking, change, onAnswer }: { booking: Booking; change: PriceChange; onAnswer: (approve: boolean) => Promise<boolean> }) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const diff = change.newPrice - change.oldPrice;
  async function answer(approve: boolean) {
    setBusy(approve ? 'yes' : 'no');
    await onAnswer(approve);
    setBusy(null);
  }
  return <section className="ui-card jb-change" aria-labelledby={`change-${change.id}`}>
    <div className="ui-card-head"><div>
      <h2 id={`change-${change.id}`}>{change.kind === 'correction' ? 'ช่างขอปรับรายการแอร์' : 'ช่างขอทำงานเพิ่ม'}</h2>
      <p>เหตุผลจากช่าง: “{change.reason}”</p>
    </div></div>
    <div className="jb-change-sum">
      <div><span>ราคาเดิม</span><strong className="ui-num">{baht(change.oldPrice)}</strong></div>
      <ChevronRight size={22} aria-hidden="true"/>
      <div><span>ราคาใหม่</span><strong className="ui-num">{baht(change.newPrice)}</strong><small className="ui-num">{diff >= 0 ? '+' : '−'}{baht(Math.abs(diff))}</small></div>
    </div>
    {change.kind === 'correction' && <p className="jb-note">คิดจากใบราคาที่ช่างเสนอไว้ตอนแรก ช่างตั้งราคาใหม่เองไม่ได้</p>}
    {/* A correction replaces the cleaning lines; extra work already approved stays, so it is listed to add up to the new price. */}
    <PriceBreakdown lines={(change.kind === 'correction' ? [...change.lines, ...(booking.priceLines ?? []).filter(line => line.kind === 'extra')] : change.lines).map(line => ({ ...line, reason: null }))}
      totalLabel={change.kind === 'correction' ? 'ราคาใหม่รวม' : 'งานเพิ่มรวม'}/>
    <div className="jb-confirm-actions">
      <button type="button" className="ui-btn is-primary is-lg" disabled={busy != null} aria-busy={busy === 'yes'} onClick={() => void answer(true)}>{busy === 'yes' ? 'กำลังส่ง…' : <>อนุมัติ <span className="ui-num">{baht(change.newPrice)}</span></>}</button>
      <button type="button" className="ui-btn is-lg" disabled={busy != null} aria-busy={busy === 'no'} onClick={() => void answer(false)}>{busy === 'no' ? 'กำลังส่ง…' : 'ไม่อนุมัติ'}</button>
    </div>
    <p className="jb-note">ถ้าไม่อนุมัติ ช่างทำตามรายการเดิมในราคา {baht(change.oldPrice)} ไม่แน่ใจ ให้ช่างอธิบายหรือดูหน้างานก่อนตอบได้</p>
  </section>;
}

function Tracking({ booking }: { booking: Booking }) {
  const hasDestination = booking.latitude != null && booking.longitude != null;
  const hasTech = booking.technicianLatitude != null && booking.technicianLongitude != null;
  const updated = booking.locationUpdatedAt ? new Date(booking.locationUpdatedAt) : null;
  const time = updated && !Number.isNaN(updated.getTime()) ? updated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : null;
  const mapsUrl = hasDestination
    ? `https://www.google.com/maps/dir/?api=1&destination=${booking.latitude},${booking.longitude}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.address)}&travelmode=driving`;
  if (!hasDestination) return <p className="ui-alert">งานนี้ยังไม่มีพิกัดสำหรับแสดงแผนที่</p>;
  const destination = { latitude: booking.latitude!, longitude: booking.longitude!, label: 'สถานที่ให้บริการ', kind: 'destination' as const };
  const technician = hasTech ? { latitude: booking.technicianLatitude!, longitude: booking.technicianLongitude!, label: booking.technician, kind: 'technician' as const } : undefined;
  return <section className="ui-card jb-track">
    <div className="ui-card-head"><div><h2>ตำแหน่งช่าง</h2><p>{technician ? (time ? `อัปเดตล่าสุด ${time} น.` : 'มีตำแหน่งช่างแล้ว') : 'รอช่างแชร์ตำแหน่ง ช่างต้องเปิดแอปและอนุญาต GPS'}</p></div></div>
    <div className="jb-map"><LocationMap key={booking.id} center={technician ?? destination} destination={destination} technician={technician} accuracy={booking.locationAccuracy ?? undefined} height={280} zoom={14}/></div>
    <a className="ui-btn" href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={18}/> เปิดใน Google Maps</a>
  </section>;
}

function Payment({ booking, onConfirm, onIssue }: { booking: Booking; onConfirm: Props['onPaymentConfirm']; onIssue: Props['onPaymentIssue'] }) {
  const [method, setMethod] = useState<PaymentMethod>(booking.paymentMethod ?? 'Cash');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const underReview = booking.status === 'มีปัญหาการชำระเงิน';
  const youPaid = Boolean(booking.customerConfirmedPayment);
  const techGotIt = Boolean(booking.technicianConfirmedPayment);
  return <section className="ui-card jb-pay" aria-label="ชำระเงิน">
    <Plate num={baht(booking.price)} unit="เก็บเงินปลายทาง" meta={<span>จ่ายให้ <strong>{booking.technician}</strong> โดยตรงเมื่อล้างเสร็จ</span>}/>
    {booking.priceLines?.length ? <details className="pr-details"><summary>ยอดนี้มาจากอะไร</summary><PriceBreakdown lines={booking.priceLines} totalLabel="ยอดที่ต้องจ่าย"/></details> : null}
    {!underReview && !youPaid && techGotIt && <p className="ui-alert is-info jb-tech-paid">ช่างแจ้งว่าได้รับเงิน{booking.paymentMethod === 'PromptPay' ? 'โอน' : 'สด'} {baht(booking.price)} แล้ว ถ้าถูกต้อง กดยืนยันด้านล่าง ถ้ายังไม่ได้จ่ายหรือยอดไม่ตรง กดแจ้งปัญหา ถ้าไม่มีการแจ้งภายใน 3 วัน ระบบปิดงานให้อัตโนมัติ</p>}
    {!underReview && !youPaid && !techGotIt && <div className="ui-field">
      <span className="ui-label" id={`pay-how-${booking.id}`}>จ่ายด้วย</span>
      <div className="ui-tabs" role="group" aria-labelledby={`pay-how-${booking.id}`}>
        <button type="button" aria-pressed={method === 'Cash'} onClick={() => setMethod('Cash')}><Banknote size={18}/> เงินสด</button>
        <button type="button" aria-pressed={method === 'PromptPay'} onClick={() => setMethod('PromptPay')}><Smartphone size={18}/> โอนให้ช่าง</button>
      </div>
    </div>}
    <ul className="jb-checks">
      <li className={youPaid ? 'is-ok' : ''}><CheckCircle2 size={19}/> {youPaid ? 'คุณยืนยันว่าชำระแล้ว' : 'รอคุณยืนยันการชำระเงิน'}</li>
      <li className={techGotIt ? 'is-ok' : ''}><CheckCircle2 size={19}/> {techGotIt ? 'ช่างยืนยันว่าได้รับเงินแล้ว' : 'รอช่างยืนยันว่าได้รับเงิน'}</li>
    </ul>
    {!underReview && !youPaid && <button type="button" className="ui-btn is-primary is-lg is-block" onClick={() => onConfirm(booking.id, method)}>ฉันจ่ายเงินแล้ว <Check size={19}/></button>}
    {!underReview && (reporting
      ? <div className="jb-confirm">
        <div className="ui-field"><label htmlFor={`issue-${booking.id}`}>เกิดปัญหาอะไรกับการชำระเงิน</label>
          <textarea className="ui-textarea" id={`issue-${booking.id}`} rows={3} value={reason} maxLength={500} onChange={event => setReason(event.target.value)}/></div>
        <div className="jb-confirm-actions"><button type="button" className="ui-btn is-primary" disabled={!reason.trim()} onClick={() => { onIssue(booking.id, reason.trim()); setReporting(false); }}>ส่งให้ผู้ดูแลตรวจสอบ</button><button type="button" className="ui-btn" onClick={() => setReporting(false)}>ยกเลิก</button></div>
      </div>
      : <button type="button" className="ui-btn is-ghost is-sm jb-quiet-link" onClick={() => setReporting(true)}><AlertTriangle size={16}/> แจ้งปัญหาการชำระเงิน</button>)}
    <p className="jb-note">จ่ายตามยอดในแอปเท่านั้น ถ้าช่างขอเงินเพิ่มนอกแอป กดแจ้งปัญหาได้ · AirClean ไม่เก็บเงินล่วงหน้าและไม่รับเงินแทนช่าง ถ้าโอน ตรวจชื่อบัญชีช่างก่อนโอน</p>
  </section>;
}

function ReportBlock({ report }: { report: ServiceReportRecord }) {
  return <section className="ui-card">
    <h2>สรุปงานจากช่าง</h2>
    <p className="jb-report">{report.summary}</p>
    {/* Done or not is said in words and by the icon, not only by colour */}
    <ul className="jb-checks is-grid">{checklist.map(item => <li key={item.key} className={report[item.key] ? 'is-ok' : ''}>{report[item.key] ? <Check size={17} strokeWidth={3} aria-hidden="true"/> : <X size={17} strokeWidth={3} aria-hidden="true"/>} {item.label}<span className="sr-only">{report[item.key] ? ' (ทำแล้ว)' : ' (ไม่ได้ทำ)'}</span></li>)}</ul>
    {(webLink(report.beforePhotoUrl) || webLink(report.afterPhotoUrl)) && <p className="jb-photo-links">{webLink(report.beforePhotoUrl) && <a className="ui-link" href={webLink(report.beforePhotoUrl)!} target="_blank" rel="noopener noreferrer">ดูภาพก่อนทำ</a>}{webLink(report.afterPhotoUrl) && <a className="ui-link" href={webLink(report.afterPhotoUrl)!} target="_blank" rel="noopener noreferrer">ดูภาพหลังทำ</a>}</p>}
  </section>;
}

/** What to do after the job: the next recommended cleaning, book again, keep the history, or report a problem. */
function AfterService({ booking, onNewBooking, onOpenPassport, onReportProblem }: { booking: Booking; onNewBooking: () => void; onOpenPassport: () => void; onReportProblem: Props['onReportProblem'] }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const next = day(booking.date);
  next.setMonth(next.getMonth() + 6);
  async function send() {
    setBusy(true);
    const ok = await onReportProblem(booking.id, reason.trim());
    setBusy(false);
    if (ok) { setSent(true); setReporting(false); }
  }
  return <section className="ui-card jb-after">
    <h2>ขั้นต่อไป</h2>
    <div className="jb-next"><CalendarClock size={22} aria-hidden="true"/><div><strong>ล้างครั้งถัดไป {next.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</strong><span>ล้างทุก 6 เดือนช่วยให้แอร์เย็นเร็ว ประหยัดไฟ และลดฝุ่น</span></div></div>
    <div className="jb-after-actions">
      <button type="button" className="ui-btn is-primary" onClick={onNewBooking}><RotateCcw size={18}/> ขอช่างล้างแอร์อีกครั้ง</button>
      <button type="button" className="ui-btn" onClick={onOpenPassport}><History size={18}/> ประวัติการล้างแอร์</button>
      {booking.paymentStatus === 'Paid' && <button type="button" className="ui-btn" onClick={() => setReceipt(true)}><FileText size={18}/> ใบเสร็จรับเงิน</button>}
    </div>
    {receipt && <ReceiptSheet bookingId={booking.id} canIssue companyFirst={booking.placeId != null} onClose={() => setReceipt(false)}/>}
    {booking.issue?.kind === 'Service' && !booking.issue.open && booking.issue.resolutionNote && !sent &&
      <p className="ui-alert is-done"><CheckCircle2 size={18}/><span>ผู้ดูแลปิดเรื่องที่คุณแจ้งแล้ว: {booking.issue.resolutionNote}</span></p>}
    {sent || (booking.issue?.kind === 'Service' && booking.issue.open)
      ? <p className="ui-alert is-done"><CheckCircle2 size={18}/><span>ส่งเรื่องให้ผู้ดูแลแล้ว จะติดต่อกลับเร็วที่สุด</span></p>
      : reporting
        ? <div className="jb-confirm">
          <div className="ui-field"><label htmlFor={`problem-${booking.id}`}>เกิดปัญหาอะไรกับงานนี้</label>
            <textarea className="ui-textarea" id={`problem-${booking.id}`} rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="เช่น ล้างแล้วน้ำยังหยด หรือมีปัญหาเรื่องเงิน"/></div>
          <div className="jb-confirm-actions"><button type="button" className="ui-btn is-primary" disabled={busy || reason.trim().length < 3} aria-busy={busy} onClick={() => void send()}>{busy ? 'กำลังส่ง…' : 'ส่งให้ผู้ดูแล'}</button><button type="button" className="ui-btn" onClick={() => setReporting(false)}>ยกเลิก</button></div>
        </div>
        : <button type="button" className="ui-btn is-ghost is-sm jb-quiet-link" onClick={() => setReporting(true)}><AlertTriangle size={16}/> มีปัญหากับงานนี้</button>}
  </section>;
}

function Review({ booking, onReview }: { booking: Booking; onReview: Props['onReview'] }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (booking.customerRating) {
    return <p className="ui-alert is-done"><Star size={18} fill="currentColor"/><span>คุณให้คะแนนช่าง {booking.customerRating} จาก 5 ดาวแล้ว ขอบคุณครับ</span></p>;
  }
  async function send() {
    setBusy(true);
    await onReview(booking.id, rating, comment);
    setBusy(false);
  }
  return <section className="ui-card jb-review" aria-label="ให้คะแนนช่าง">
    <div className="ui-card-head"><div><h2>ให้คะแนน {booking.technician}</h2><p>ช่วยลูกค้าคนอื่นเลือกช่าง ใช้เวลาไม่ถึงนาที</p></div></div>
    <div className="jb-stars" role="radiogroup" aria-label="คะแนนช่าง">
      {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} ดาว`} className={value <= rating ? 'is-on' : ''} onClick={() => setRating(value)}><Star size={30} fill={value <= rating ? 'currentColor' : 'none'}/></button>)}
    </div>
    <div className="ui-field"><label htmlFor={`review-${booking.id}`}>ความเห็นเพิ่มเติม (ไม่บังคับ)</label>
      <textarea className="ui-textarea" id={`review-${booking.id}`} rows={3} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} placeholder="เช่น มาตรงเวลา ทำความสะอาดเรียบร้อย"/></div>
    <button type="button" className="ui-btn is-primary is-lg is-block" disabled={!rating || busy} aria-busy={busy} onClick={() => void send()}>{busy ? 'กำลังส่ง…' : rating ? `ส่งคะแนน ${rating} ดาว` : 'เลือกจำนวนดาวก่อน'}</button>
  </section>;
}

function CancelRequest({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="ui-btn is-danger" onClick={() => setAsking(true)}>ยกเลิกคำขอนี้</button>;
  return <div className="jb-confirm is-danger" role="alertdialog" aria-label="ยืนยันยกเลิกคำขอ">
    <p>ยกเลิกคำขอนี้? ช่างที่เสนอราคาไว้จะไม่เห็นงานอีก</p>
    <div className="jb-confirm-actions"><button type="button" className="ui-btn is-danger" onClick={onConfirm}>ยกเลิกคำขอ</button><button type="button" className="ui-btn" onClick={() => setAsking(false)}>เก็บคำขอไว้</button></div>
  </div>;
}
