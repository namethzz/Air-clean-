import { timeLabel } from '../../lib/time';
import { ArrowRight, Building2, ChevronRight, ClipboardList, History, Plus } from 'lucide-react';
import StatusBadge from '../../components/job/StatusBadge';
import { openBookings, pickNextStep } from '../../lib/nextStep';
import { guideFor, needsAction } from '../../lib/jobFlow';
import type { Booking, PageKey, ServiceReportRecord, UserRole } from '../../types';
import HeroSection6 from '../../components/ui/hero-section-6';
import { heroShots } from '../../assets/hero';
import '../../components/job/Jobs.css';
import './Home.css';

interface Props {
  role?: UserRole;
  bookings: Booking[];
  reports: ServiceReportRecord[];
  userName: string;
  onNavigate: (page: PageKey) => void;
  /** Opens "my jobs", on one job when an id is given. */
  onOpenJob: (id?: number) => void;
  onNewBooking: () => void;
}

const titles = ['นาย', 'นาง', 'นางสาว', 'คุณ'];
function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(part => !/^(mr|mrs|ms|miss|dr)\.?$/i.test(part) && !titles.includes(part));
  return parts[0] ?? full;
}

const managerSteps = [
  { title: 'เพิ่มอาคาร', text: 'ปักหมุดอาคาร ใส่จำนวนแอร์และผู้ติดต่อหน้างานครั้งเดียว ใช้ซ้ำได้ทุกครั้ง' },
  { title: 'ขอช่างล้างทั้งอาคาร', text: 'ระบุจำนวนเครื่องและวันที่ ช่างใกล้อาคารเสนอราคาให้เลือก' },
  { title: 'ติดตามรายเครื่อง', text: 'ดูว่าช่างล้างไปแล้วกี่เครื่อง พร้อมรูปหลังล้างและประวัติแยกตามอาคาร' },
];
const firstSteps = [
  { title: 'ส่งคำขอ', text: 'บอกที่อยู่ จำนวนแอร์ และวันที่สะดวก ใช้เวลาไม่ถึงนาที' },
  { title: 'เลือกช่างจากข้อเสนอ', text: 'ช่างใกล้บ้านเสนอราคาและโปรไฟล์ให้คุณเปรียบเทียบ' },
  { title: 'ช่างมาล้างแอร์', text: 'ดูตำแหน่งช่างระหว่างเดินทาง และจ่ายเงินปลายทางเมื่อล้างเสร็จ' },
];
const day = (date: string) => new Date(date + 'T00:00:00');

/** Customer and building manager home: the one thing to do next, then the rest of what is in progress. */
export default function CustomerHome({ role, bookings, reports, userName, onNavigate, onOpenJob, onNewBooking }: Props) {
  const manager = role === 'manager';
  const step = pickNextStep(bookings, reports);
  const others = openBookings(bookings).filter(item => item.id !== step.bookingId).slice(0, 5);
  const doneCount = bookings.filter(item => item.status === 'เสร็จสิ้น').length;
  const go = () => (step.to === 'newBooking' ? onNewBooking() : onOpenJob(step.bookingId));
  const start = step.tone === 'start';

  const turn = step.tone === 'action';
  const shots = manager ? heroShots.manager : heroShots.customer;
  return <>
    <HeroSection6 variant="app" {...shots}
      turn={turn}
      badge={turn ? `ถึงตาคุณ${step.eyebrow && step.eyebrow !== 'ต้องทำตอนนี้' ? ` · ${step.eyebrow}` : ''}` : `สวัสดี คุณ${firstName(userName)}`}
      title={step.title}
      text={step.text}
      primary={{ label: step.cta, onClick: go, icon: start ? Plus : ArrowRight, trailing: !start }}
      secondary={manager ? { label: 'อาคารของฉัน', onClick: () => onNavigate('buildings'), icon: Building2 } : bookings.length ? { label: 'งานของฉัน', onClick: () => onOpenJob(), icon: ClipboardList } : undefined}/>

    <div className="ui-page hm">
    {bookings.length === 0 && <section className="ui-section" aria-labelledby="hm-how">
      <div className="ui-section-head"><h2 id="hm-how">ใช้งานอย่างไร</h2></div>
      <ol className="hm-steps">{(manager ? managerSteps : firstSteps).map((item, index) => <li key={item.title}>
        <span className="hm-step-num ui-num" aria-hidden="true">{index + 1}</span>
        <div><strong>{item.title}</strong><span>{item.text}</span></div>
      </li>)}</ol>
    </section>}

    {others.length > 0 && <section className="ui-section" aria-labelledby="hm-list-title">
      <div className="ui-section-head">
        <h2 id="hm-list-title">งานอื่นของคุณ</h2>
        <button type="button" className="ui-btn is-ghost is-sm" onClick={() => onOpenJob()}>ดูทั้งหมด <ChevronRight size={16}/></button>
      </div>
      <ul className="jb-rows">{others.map(item => {
        const turn = needsAction(item, reports);
        return <li key={item.id}>
          <button type="button" className={'jb-row' + (turn ? ' is-turn' : '')} onClick={() => onOpenJob(item.id)}>
            <span className="jb-date"><strong>{day(item.date).getDate()}</strong><small>{day(item.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
            <span className="jb-row-text">
              <strong>{item.service}{item.unitCount && item.unitCount > 1 ? ` · ${item.unitCount} เครื่อง` : ''}</strong>
              <span>{guideFor(item).short}</span>
              <small>{timeLabel(item)}</small>
              {turn ? <span className="ui-badge is-turn">ถึงตาคุณ</span> : <StatusBadge status={item.status}/>}
            </span>
            <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
          </button>
        </li>;
      })}</ul>
    </section>}

    {bookings.length > 0 && others.length === 0 && <button type="button" className="ui-btn is-ghost hm-all" onClick={() => onOpenJob()}>ดูงานทั้งหมด <ChevronRight size={16}/></button>}

    <ul className="ui-list hm-links">
      {manager && <li><button type="button" className="ui-row" onClick={() => onNavigate('buildings')}>
        <span className="ui-row-lead"><Building2 size={22}/></span>
        <span className="ui-row-text"><strong>อาคารของฉัน</strong><span>ข้อมูลอาคาร จำนวนแอร์ ผู้ติดต่อหน้างาน และรอบล้างของแต่ละอาคาร</span></span>
        <span className="ui-row-trail"><ChevronRight size={18}/></span>
      </button></li>}
      <li><button type="button" className="ui-row" onClick={() => onNavigate('history')}>
        <span className="ui-row-lead"><History size={22}/></span>
        <span className="ui-row-text"><strong>ประวัติการล้างแอร์</strong><span>{doneCount ? `ล้างไปแล้ว ${doneCount} ครั้ง · ดูวันที่ ช่าง และรอบล้างครั้งถัดไป` : 'งานที่ล้างเสร็จจะถูกเก็บไว้ที่นี่ให้อัตโนมัติ'}</span></span>
        <span className="ui-row-trail"><ChevronRight size={18}/></span>
      </button></li>
    </ul>
    </div>
  </>;
}
