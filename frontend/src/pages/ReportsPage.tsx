import { useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, ClipboardCheck, ExternalLink } from 'lucide-react';
import type { Booking, ServiceReportRecord } from '../types';
import { webLink } from '../lib/links';
import { EmptyState, PageHead } from '../components/kit';
import StatusBadge from '../components/StatusBadge';
import './Jobs.css';
import './Admin.css';

/**
 * Service reports for the admin (App sends every other role to their own jobs page, where reports are written and
 * read). The count band, then the reports beside the chosen one: what the technician wrote, what they checked, photos.
 */
interface Props { bookings: Booking[]; reports: ServiceReportRecord[]; }

const checklist = [
  { key: 'cleanedFilter', label: 'ทำความสะอาดแผ่นกรอง' },
  { key: 'cleanedCoil', label: 'ทำความสะอาดคอยล์' },
  { key: 'checkedDrain', label: 'ตรวจท่อน้ำทิ้ง' },
  { key: 'checkedCooling', label: 'ตรวจการทำงานของเครื่อง' },
] as const;
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}
const checkedCount = (report: ServiceReportRecord) => checklist.filter(item => report[item.key]).length;
const hasPhotos = (report: ServiceReportRecord) => Boolean(webLink(report.beforePhotoUrl) || webLink(report.afterPhotoUrl));

export default function ReportsPage({ bookings, reports }: Props) {
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const detail = useRef<HTMLElement>(null);
  const selected = reports.find(item => item.id === selectedId) ?? reports[0];
  const head = <PageHead title="รายงานบริการ">สรุปงานที่ช่างบันทึกหลังล้างและรายการที่ตรวจ ใช้ดูคุณภาพงาน หรือตอบเมื่อมีเรื่องถูกแจ้ง</PageHead>;

  if (!selected) return <div className="ui-page ad">
    {head}
    <EmptyState icon={ClipboardCheck} title="ยังไม่มีรายงานบริการ">เมื่อช่างบันทึกรายงานหลังล้างเสร็จ รายการจะแสดงที่นี่</EmptyState>
  </div>;

  const job = bookings.find(item => item.id === selected.bookingId);
  const before = webLink(selected.beforePhotoUrl), after = webLink(selected.afterPhotoUrl);
  function choose(id: number) {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1023px)').matches) window.requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return <div className="ui-page ad">
    {head}
    <dl className="jb-summary">
      <div><dt>รายงานทั้งหมด</dt><dd className="ui-num">{reports.length}</dd></div>
      <div><dt>ตรวจครบ {checklist.length} ข้อ</dt><dd className="ui-num">{reports.filter(item => checkedCount(item) === checklist.length).length}</dd></div>
      <div><dt>เดือนนี้</dt><dd className="ui-num">{reports.filter(item => item.createdAt.slice(0, 7) === new Date().toISOString().slice(0, 7)).length}</dd></div>
    </dl>
    <div className="tk">
      <section className="ui-card tk-job" ref={detail} tabIndex={-1} aria-labelledby="rp-title">
        <div className="ui-card-head tk-job-head">
          <div><h2 id="rp-title">{selected.bookingCode} · {job?.service ?? 'รายงานบริการ'}</h2><p>บันทึกเมื่อ {dateLabel(selected.createdAt)}{job?.technician ? ` · ${job.technician}` : ''}</p></div>
          {job && <StatusBadge status={job.status}/>}
        </div>
        <p className="jb-report">{selected.summary}</p>
        <div className="ui-section">
          <h3 className="ad-sub">รายการที่ตรวจ <span className="ui-num">{checkedCount(selected)}/{checklist.length}</span></h3>
          <ul className="ad-checks">{checklist.map(item => <li key={item.key} className={selected[item.key] ? 'is-done' : undefined}>
            {selected[item.key] ? <CheckCircle2 size={18} aria-hidden="true"/> : <Circle size={18} aria-hidden="true"/>}
            <span>{item.label}</span><small>{selected[item.key] ? 'ทำแล้ว' : 'ไม่ได้ระบุ'}</small>
          </li>)}</ul>
        </div>
        {(before || after) && <div className="ui-section">
          <h3 className="ad-sub">รูปงาน</h3>
          <div className="ad-links">
            {before ? <a className="ui-btn is-sm" href={before} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> รูปก่อนล้าง</a> : <span>ไม่มีรูปก่อนล้าง</span>}
            {after ? <a className="ui-btn is-sm" href={after} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> รูปหลังล้าง</a> : <span>ไม่มีรูปหลังล้าง</span>}
          </div>
        </div>}
      </section>

      <section className="ui-card tk-list" aria-labelledby="rp-list-title">
        <div className="ui-card-head"><div><h2 id="rp-list-title">รายงานทั้งหมด</h2><p>ใหม่สุดอยู่บน เลือกเพื่อดูรายละเอียด</p></div></div>
        <ul className="jb-rows">{reports.map(report => <li key={report.id}>
          <button type="button" className={'jb-row' + (report.id === selected.id ? ' is-active' : '')} aria-current={report.id === selected.id ? 'true' : undefined} onClick={() => choose(report.id)}>
            <span className="jb-date"><ClipboardCheck size={22} aria-hidden="true"/></span>
            <span className="jb-row-text"><strong>{report.bookingCode}</strong><span className="ad-clamp">{report.summary}</span><small>{dateLabel(report.createdAt)} · ตรวจ {checkedCount(report)}/{checklist.length} ข้อ{hasPhotos(report) ? ' · มีรูป' : ''}</small></span>
            <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
          </button>
        </li>)}</ul>
      </section>
    </div>
  </div>;
}
