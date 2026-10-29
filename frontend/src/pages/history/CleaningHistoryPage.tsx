import { useState } from 'react';
import { CalendarClock, Check, ChevronRight, FileText, History, Plus, Star } from 'lucide-react';
import ReceiptSheet from '../../components/job/ReceiptSheet';
import { EmptyState } from '../../components/kit';
import type { Booking, ServiceReportRecord } from '../../types';
import { nextCleaning } from '../../lib/cleaning';
import '../../components/job/Jobs.css';
import './History.css';

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
  const due = nextCleaning(bookings);
  const last = done[0];
  const next = due?.next ?? null;
  const overdue = due?.overdue ?? false;
  const units = done.reduce((total, item) => total + (item.unitCount || 1), 0);
  const spent = done.reduce((total, item) => total + item.price, 0);
  const years = [...new Set(done.map(item => item.date.slice(0, 4)))];
  const [receiptFor, setReceiptFor] = useState<number | null>(null);

  if (!done.length) {
    return <div className="ui-page hs">
      <EmptyState icon={History} title="ยังไม่มีประวัติการล้างแอร์"
        action={<button type="button" className="ui-btn is-primary is-lg" onClick={onNewBooking}><Plus size={20}/> ขอช่างล้างแอร์</button>}>
        ทุกครั้งที่ช่างล้างเสร็จและปิดงาน วันที่ ช่าง ค่าบริการ และรายการที่ทำจะถูกเก็บไว้ที่นี่ให้อัตโนมัติ
      </EmptyState>
    </div>;
  }

  return <div className="ui-page hs">
    <section className={'hs-next' + (overdue ? ' is-due' : '')} aria-labelledby="hs-next-title">
      <div className="hs-next-body">
        <span className="hs-next-label"><CalendarClock size={18} aria-hidden="true"/> {overdue ? 'รอบล้างแอร์' : 'ล้างครั้งถัดไป'}</span>
        <h2 id="hs-next-title">{overdue ? 'ถึงรอบล้างแอร์แล้ว' : next!.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h2>
        <p>ล้างล่าสุด {longDate(last.date)} · แนะนำล้างทุก 6 เดือน</p>
      </div>
      <button type="button" className={'ui-btn is-lg' + (overdue ? ' is-turn' : '')} onClick={onNewBooking}><Plus size={19}/> ขอช่างล้างแอร์</button>
    </section>

    <dl className="hs-stats">
      <div><dt>ล้างไปแล้ว</dt><dd><span className="ui-num">{done.length}</span> ครั้ง</dd></div>
      <div><dt>รวม</dt><dd><span className="ui-num">{units}</span> เครื่อง</dd></div>
      <div><dt>ค่าบริการรวม</dt><dd className="ui-num">฿{spent.toLocaleString()}</dd></div>
    </dl>

    {years.map(year => <section key={year} className="ui-section" aria-labelledby={'hs-' + year}>
      <div className="ui-section-head"><h2 id={'hs-' + year} className="ui-num">{Number(year) + 543}</h2></div>
      <ol className="hs-list">{done.filter(item => item.date.startsWith(year)).map(item => {
        const report = reports.find(row => row.bookingId === item.id);
        return <li key={item.id} className="hs-item">
          <button type="button" className="hs-open" onClick={() => onOpenJob(item.id)} aria-label={`${item.service} ${longDate(item.date)} เปิดดูงาน`}>
            <span className="jb-date"><strong>{day(item.date).getDate()}</strong><small>{day(item.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
            <span className="hs-main">
              <strong>{item.service} · {item.unitCount || 1} เครื่อง</strong>
              {(item.unitLabel || item.propertyType) && <span>{item.unitLabel || item.propertyType}</span>}
              <small>ช่าง {item.technician} · <span className="ui-num">฿{item.price.toLocaleString()}</span> {item.paymentMethod === 'PromptPay' ? '(โอน)' : '(เงินสด)'}</small>
              {report && <span className="hs-checks">{checklist.filter(row => report[row.key]).map(row => <em key={row.key}><Check size={13} strokeWidth={3} aria-hidden="true"/>{row.label}</em>)}</span>}
              {report?.summary && <q className="hs-summary">{report.summary}</q>}
            </span>
            <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
          </button>
          <div className="hs-item-foot">
            {item.customerRating
              ? <span className="hs-rating" role="img" aria-label={`ให้คะแนน ${item.customerRating} ดาว`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={16} fill={index < item.customerRating! ? 'currentColor' : 'none'} aria-hidden="true"/>)}</span>
              : <span className="hs-unrated">ยังไม่ได้ให้คะแนนช่าง</span>}
            {item.paymentStatus === 'Paid' && <button type="button" className="ui-btn is-ghost is-sm" onClick={() => setReceiptFor(item.id)}><FileText size={16}/> ใบเสร็จ</button>}
          </div>
        </li>;
      })}</ol>
    </section>)}
    {receiptFor != null && <ReceiptSheet bookingId={receiptFor} canIssue companyFirst={done.find(item => item.id === receiptFor)?.placeId != null} onClose={() => setReceiptFor(null)}/>}
  </div>;
}
