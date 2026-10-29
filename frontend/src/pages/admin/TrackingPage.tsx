import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import type { Booking } from '../../types';
import { timeLabel } from '../../lib/time';
import StatusBadge from '../../components/job/StatusBadge';
import LocationMap, { type Coordinates } from '../../components/job/LocationMap';
import { EmptyState, PageHead } from '../../components/kit';
import '../../components/job/Jobs.css';
import './Admin.css';

/**
 * The admin's map of jobs (App sends every other role to their own jobs page). A list on one side, narrowed by a
 * chip; the chosen job on the other with the place, the technician's last position while on the road, and the facts.
 */
interface Props { bookings: Booking[]; focus?: { id: number; token: number } | null; onRefresh: () => void; }

const FALLBACK_DESTINATION: Coordinates = { latitude: 13.806, longitude: 100.572 };
const ON_THE_ROAD = ['กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ'];
const day = (value: string) => new Date(`${value}T00:00:00`);

function liveLine(job: Booking, hasPosition: boolean, stale: boolean): string {
  if (job.status === 'กำลังเดินทาง') return !hasPosition ? 'กำลังรอช่างส่งตำแหน่ง' : stale ? 'พิกัดขาดการอัปเดต · แสดงตำแหน่งล่าสุด' : 'กำลังติดตามตำแหน่งช่าง';
  if (job.status === 'ถึงหน้างาน') return 'ช่างถึงหน้างานแล้ว · หยุดแชร์ตำแหน่ง';
  return 'ตำแหน่งช่างแสดงเมื่อช่างกด “เริ่มเดินทาง” และอนุญาต GPS';
}
function updatedLine(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `อัปเดตล่าสุด ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
}

export default function TrackingPage({ bookings, focus, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const detail = useRef<HTMLElement>(null);
  // Narrowed by a chip: on the road now (the default when any are), today, open, or all.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const scopes = {
    moving: (item: Booking) => ON_THE_ROAD.includes(item.status),
    today: (item: Booking) => item.date === today,
    open: (item: Booking) => !['เสร็จสิ้น', 'ยกเลิก', 'หมดเวลาเลือกช่าง'].includes(item.status),
    all: () => true,
  } as const;
  const scopeNames: Record<keyof typeof scopes, string> = { moving: 'กำลังเดินทาง / อยู่หน้างาน', today: 'นัดวันนี้', open: 'ยังไม่ปิด', all: 'ทั้งหมด' };
  const [scope, setScope] = useState<keyof typeof scopes>(() => bookings.some(scopes.moving) ? 'moving' : 'open');
  const rows = useMemo(() => bookings.filter(scopes[scope]), [bookings, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = rows.find(item => item.id === selectedId) ?? rows.find(item => ON_THE_ROAD.includes(item.status)) ?? rows[0];

  // Opened for one job (from the bookings table or the overview): show it, whatever chip it falls under.
  useEffect(() => {
    if (!focus || !bookings.some(item => item.id === focus.id)) return;
    setScope('all'); setSelectedId(focus.id);
  }, [focus?.token, bookings.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setInterval(onRefresh, 10000); return () => window.clearInterval(timer); }, [onRefresh]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  const chips = <div className="ad-chips" role="group" aria-label="แสดงงาน">
    {(Object.keys(scopes) as (keyof typeof scopes)[]).map(key => <button type="button" key={key} className="ui-chip" aria-pressed={scope === key} onClick={() => { setScope(key); setSelectedId(null); }}>{scopeNames[key]} <b className="ui-num">{bookings.filter(scopes[key]).length}</b></button>)}
  </div>;
  const head = <PageHead title="ติดตามงาน" actions={<button type="button" className="ui-btn" onClick={onRefresh}><RefreshCw size={18}/> โหลดใหม่</button>}>
    ดูว่างานไหนอยู่ตรงไหน และช่างที่กำลังเดินทางอยู่ห่างแค่ไหน หน้านี้โหลดใหม่เองทุก 10 วินาที
  </PageHead>;

  if (!selected) return <div className="ui-page ad">
    {head}{chips}
    <EmptyState icon={MapPin} title={bookings.length ? `ไม่มีงานในหมวด “${scopeNames[scope]}”` : 'ยังไม่มีงานให้แสดง'}>
      {bookings.length ? 'เลือกหมวดอื่นด้านบน' : 'เมื่อมีการจอง สถานที่และการเดินทางของช่างจะแสดงที่นี่'}
    </EmptyState>
  </div>;

  const hasPlace = selected.latitude != null && selected.longitude != null;
  const place = hasPlace ? { latitude: selected.latitude!, longitude: selected.longitude! } : FALLBACK_DESTINATION;
  const tech = selected.technicianLatitude != null && selected.technicianLongitude != null ? { latitude: selected.technicianLatitude, longitude: selected.technicianLongitude } : null;
  const center = tech && hasPlace ? { latitude: (tech.latitude + place.latitude) / 2, longitude: (tech.longitude + place.longitude) / 2 } : tech ?? place;
  const updatedAt = selected.locationUpdatedAt ? Date.parse(selected.locationUpdatedAt) : NaN;
  const stale = !Number.isFinite(updatedAt) || now - updatedAt > 30000;
  const live = selected.status === 'กำลังเดินทาง' && Boolean(tech) && !stale;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${hasPlace ? `${place.latitude},${place.longitude}` : encodeURIComponent(selected.address)}&travelmode=driving`;
  const payment = selected.paymentMethod === 'PromptPay' ? 'โอนให้ช่าง' : selected.paymentMethod === 'Cash' ? 'เงินสด' : 'ยังไม่เลือก';

  function choose(id: number) {
    setSelectedId(id);
    // On a phone the job sits above the list: bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) window.requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return <div className="ui-page ad">
    {head}{chips}
    <div className="tk">
      <section className="ui-card tk-job" ref={detail} aria-labelledby="tk-title" tabIndex={-1}>
        <div className="ui-card-head tk-job-head">
          <div><h2 id="tk-title">{selected.code} · {selected.service}</h2><p>{selected.technician || 'ยังไม่มีช่าง'} · {selected.customer || 'ลูกค้า'}</p></div>
          <StatusBadge status={selected.status}/>
        </div>
        <p className={'tk-live' + (live ? ' is-live' : '')} role="status"><i aria-hidden="true"/><span>{liveLine(selected, Boolean(tech), stale)}{tech && <small>{updatedLine(selected.locationUpdatedAt)}</small>}</span></p>
        <LocationMap key={selected.id} center={center} destination={hasPlace ? { ...place, label: 'สถานที่ให้บริการ', kind: 'destination' } : undefined}
          technician={tech ? { ...tech, label: selected.technician, kind: 'technician' } : undefined} accuracy={selected.locationAccuracy ?? undefined} height={340} zoom={tech && hasPlace ? 13 : 14}/>
        <p className="tk-legend"><span><i className="tk-pin"/> สถานที่ให้บริการ</span>{tech && <span><i className="tk-pin is-tech"/> ตำแหน่งช่างล่าสุด</span>}{!hasPlace && <span>งานนี้ยังไม่มีพิกัด แผนที่แสดงพื้นที่โดยประมาณ</span>}</p>
        {selected.status === 'กำลังเดินทาง' && tech && stale && <p className="ui-alert is-wait">ตำแหน่งนี้อาจไม่ใช่ตำแหน่งปัจจุบัน ช่างอาจล็อกหน้าจอ สลับแอป หรือขาดการเชื่อมต่อ</p>}
        <dl className="jb-facts">
          <div><dt>สถานที่</dt><dd>{selected.address}{selected.unitLabel && <><br/>{selected.unitLabel}</>}</dd></div>
          <div><dt>วันและเวลา</dt><dd>{day(selected.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} · {timeLabel(selected)}</dd></div>
          <div><dt>ราคาที่ตกลง</dt><dd><span className="ui-num">฿{selected.price.toLocaleString()}</span> · จ่ายช่างหน้างาน ({payment})</dd></div>
          {['รอชำระเงิน', 'มีปัญหาการชำระเงิน', 'เสร็จสิ้น'].includes(selected.status) && <div><dt>ยืนยันการชำระ</dt><dd>
            {selected.technicianConfirmedPayment ? 'ช่างยืนยันว่าได้รับเงินแล้ว' : 'รอช่างยืนยันว่าได้รับเงิน'}<br/>
            {selected.customerConfirmedPayment ? 'ลูกค้ายืนยันว่าจ่ายแล้ว' : 'รอลูกค้ายืนยันว่าจ่ายแล้ว'}
          </dd></div>}
        </dl>
        <a className="ui-btn is-primary is-block" href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={18}/> เปิดสถานที่ใน Google Maps</a>
      </section>

      <section className="ui-card tk-list" aria-labelledby="tk-list-title">
        <div className="ui-card-head"><div><h2 id="tk-list-title">งานในหมวดนี้ <span className="ui-num">{rows.length}</span></h2><p>เลือกงานเพื่อดูบนแผนที่</p></div></div>
        <ul className="jb-rows">{rows.map(item => <li key={item.id}>
          <button type="button" className={'jb-row' + (item.id === selected.id ? ' is-active' : '')} aria-current={item.id === selected.id ? 'true' : undefined} onClick={() => choose(item.id)}>
            <span className="jb-date"><strong>{day(item.date).getDate()}</strong><small>{day(item.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
            <span className="jb-row-text"><strong>{item.code} · {item.service}</strong><span>{timeLabel(item)} · {item.technician || 'ยังไม่มีช่าง'}</span><small>{item.address}</small><StatusBadge status={item.status}/></span>
            <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
          </button>
        </li>)}</ul>
      </section>
    </div>
  </div>;
}
