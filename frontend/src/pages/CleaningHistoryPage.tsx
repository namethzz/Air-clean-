import { useState } from 'react';
import { CalendarClock, Check, ChevronRight, FileText, History, Plus, Star } from 'lucide-react';
import ReceiptSheet from '../components/ReceiptSheet';
import type { Booking, ServiceReportRecord } from '../types';
import './CustomerJobs.css';

interface Props {
  bookings: Booking[];
  reports: ServiceReportRecord[];
  onOpenJob: (id: number) => void;
  onNewBooking: () => void;
}

const checklist = [
  { key: 'cleanedFilter', label: 'ล้างแผ่นกรอง' },
  { key: 'cleanedCoil', label: 'ล้างคอยล์' },
  { key: 'checkedDrain', label: 'ตรวจท่อน้ำทิ้ง' },
  { key: 'checkedCooling', label: 'ตรวจความเย็น' },
] as const;

const day = (date: string) => new Date(date + 'T00:00:00');
const longDate = (date: string) => day(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

/** Every finished cleaning, newest first, with when the next one is due. Built from the customer's own jobs. */
export default function CleaningHistoryPage({ bookings, reports, onOpenJob, onNewBooking }: Props) {
  const done = bookings.filter(item => item.status === 'เสร็จสิ้น').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const last = done[0];
  const next = last ? day(last.date) : null;
  next?.setMonth(next.getMonth() + 6);
  const overdue = next ? next.getTime() < Date.now() : false;
  const units = done.reduce((total, item) => total + (item.unitCount || 1), 0);
  const spent = done.reduce((total, item) => total + item.price, 0);
  const years = [...new Set(done.map(item => item.date.slice(0, 4)))];
  const [receiptFor, setReceiptFor] = useState<number | null>(null);

  if (!done.length) {
    return <div className="cj-empty">
      <span className="cj-empty-icon"><History size={30}/></span>
      <h1>ยังไม่มีประวัติการล้างแอร์</h1>
      <p>ทุกครั้งที่ช่างล้างเสร็จและปิดงาน วันที่ ช่าง ค่าบริการ และรายการที่ทำจะถูกเก็บไว้ที่นี่ให้อัตโนมัติ</p>
      <button type="button" className="cj-primary" onClick={onNewBooking}><Plus size={18}/> ขอช่างล้างแอร์</button>
    </div>;
  }

  return <div className="ch-page">
    <h1>ประวัติการล้างแอร์</h1>
    <section className={'ch-next' + (overdue ? ' due' : '')}>
      <CalendarClock size={22}/>
      <div>
        <strong>{overdue ? 'ถึงรอบล้างแอร์แล้ว' : `ล้างครั้งถัดไป ${next!.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`}</strong>
        <span>ล้างล่าสุด {longDate(last.date)} · แนะนำล้างทุก 6 เดือน</span>
      </div>
      <button type="button" className={overdue ? 'cj-primary' : 'cj-ghost'} onClick={onNewBooking}>ขอช่างล้างแอร์</button>
    </section>
    <dl className="ch-stats">
      <div><dt>ล้างไปแล้ว</dt><dd>{done.length} ครั้ง</dd></div>
      <div><dt>รวม</dt><dd>{units} เครื่อง</dd></div>
      <div><dt>ค่าบริการรวม</dt><dd>฿{spent.toLocaleString()}</dd></div>
    </dl>
    {years.map(year => <section key={year} aria-label={`ปี ${Number(year) + 543}`}>
      <h2 className="ch-year">{Number(year) + 543}</h2>
      <ol className="ch-list">{done.filter(item => item.date.startsWith(year)).map(item => {
        const report = reports.find(row => row.bookingId === item.id);
        return <li key={item.id}>
          <button type="button" className="ch-item" onClick={() => onOpenJob(item.id)} aria-label={`${item.service} ${longDate(item.date)} เปิดดูงาน`}>
            <span className="cj-row-date"><strong>{day(item.date).getDate()}</strong><span>{day(item.date).toLocaleDateString('th-TH', { month: 'short' })}</span></span>
            <span className="ch-main">
              <strong>{item.service} · {item.unitCount || 1} เครื่อง</strong>
              <span>{item.unitLabel || item.propertyType || ''}</span>
              <small>ช่าง {item.technician} · ฿{item.price.toLocaleString()} {item.paymentMethod === 'PromptPay' ? '(โอน)' : '(เงินสด)'}</small>
              {report && <span className="ch-checks">{checklist.filter(row => report[row.key]).map(row => <em key={row.key}><Check size={12} strokeWidth={3}/>{row.label}</em>)}</span>}
              {report?.summary && <span className="ch-summary">“{report.summary}”</span>}
              {item.customerRating
                ? <span className="ch-rating" aria-label={`ให้คะแนน ${item.customerRating} ดาว`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < item.customerRating! ? 'currentColor' : 'none'}/>)}</span>
                : <span className="ch-rate">ยังไม่ได้ให้คะแนนช่าง</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true"/>
          </button>
          {item.paymentStatus === 'Paid' && <button type="button" className="ch-receipt" onClick={() => setReceiptFor(item.id)}><FileText size={14}/> ใบเสร็จ</button>}
        </li>;
      })}</ol>
    </section>)}
    {receiptFor != null && <ReceiptSheet bookingId={receiptFor} canIssue companyFirst={done.find(item => item.id === receiptFor)?.placeId != null} onClose={() => setReceiptFor(null)}/>}
  </div>;
}
