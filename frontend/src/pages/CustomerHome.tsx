import { timeLabel } from '../lib/time';
import { ChevronRight, History } from 'lucide-react';
import HeroFinancial from '../components/ui/hero-financial';
import StatusBadge from '../components/StatusBadge';
import { formatThaiDate, openBookings, pickNextStep } from '../lib/nextStep';
import { guideFor } from '../lib/jobFlow';
import type { Booking, PageKey, ServiceReportRecord } from '../types';
import './CustomerExperience.css';

interface Props {
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

const firstSteps = [
  { title: 'ส่งคำขอ', text: 'บอกที่อยู่ จำนวนแอร์ และวันที่สะดวก ใช้เวลาไม่ถึงนาที' },
  { title: 'เลือกช่างจากข้อเสนอ', text: 'ช่างใกล้บ้านเสนอราคาและโปรไฟล์ให้คุณเปรียบเทียบ' },
  { title: 'ช่างมาล้างแอร์', text: 'ดูตำแหน่งช่างระหว่างเดินทาง และจ่ายเงินปลายทางเมื่อล้างเสร็จ' },
];

/** Customer overview: one next step, then the rest of what is in progress. */
export default function CustomerHome({ bookings, reports, userName, onNavigate, onOpenJob, onNewBooking }: Props) {
  const step = pickNextStep(bookings, reports);
  const others = openBookings(bookings).filter(item => item.id !== step.bookingId).slice(0, 5);
  const doneCount = bookings.filter(item => item.status === 'เสร็จสิ้น').length;
  const go = () => (step.to === 'newBooking' ? onNewBooking() : onOpenJob(step.bookingId));

  return <div className="ac-home">
    <p className="ac-home-hello">สวัสดี คุณ{firstName(userName)}</p>
    <HeroFinancial compact withPhoto={step.tone === 'start'} eyebrow={step.eyebrow} heading={step.title} description={step.text} primaryLabel={step.cta} onStart={go}/>

    {bookings.length === 0 && <ol className="ac-home-steps" aria-label="ขั้นตอนการใช้งาน">{firstSteps.map(item => <li key={item.title}><strong>{item.title}</strong><span>{item.text}</span></li>)}</ol>}

    {others.length > 0 && <section aria-labelledby="ac-home-list-title">
      <div className="ac-home-list-head">
        <h2 id="ac-home-list-title">งานอื่นของคุณ</h2>
        <button type="button" className="text-button" onClick={() => onOpenJob()}>ดูทั้งหมด <ChevronRight size={16}/></button>
      </div>
      <ul className="ac-home-list">{others.map(item => <li key={item.id}>
        <button type="button" className="ac-home-row" onClick={() => onOpenJob(item.id)} aria-label={`${item.service} ${item.status} เปิดดูงาน`}>
          <span className="ac-home-date"><strong>{formatThaiDate(item.date).split(' ')[0]}</strong><span>{formatThaiDate(item.date).split(' ').slice(1).join(' ')}</span></span>
          <span className="ac-home-main"><strong>{item.service}</strong><span>{guideFor(item).short} · {timeLabel(item)}</span></span>
          <StatusBadge status={item.status}/>
          <ChevronRight size={18} aria-hidden="true"/>
        </button>
      </li>)}</ul>
    </section>}

    {bookings.length > 0 && others.length === 0 && <button type="button" className="text-button ac-home-all" onClick={() => onOpenJob()}>ดูงานทั้งหมด <ChevronRight size={16}/></button>}

    <button type="button" className="ac-home-passport" onClick={() => onNavigate('history')}>
      <span className="ac-home-passport-icon"><History size={20}/></span>
      <span><strong>ประวัติการล้างแอร์</strong><small>{doneCount ? `ล้างไปแล้ว ${doneCount} ครั้ง · ดูวันที่ ช่าง และรอบล้างครั้งถัดไป` : 'งานที่ล้างเสร็จจะถูกเก็บไว้ที่นี่ให้อัตโนมัติ'}</small></span>
      <ChevronRight size={18} aria-hidden="true"/>
    </button>
  </div>;
}
