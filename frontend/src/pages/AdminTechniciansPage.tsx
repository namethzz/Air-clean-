import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, BriefcaseBusiness, CalendarDays, Camera, CheckCircle2, ChevronRight, Mail, MapPin, Phone, RefreshCw, Search, Star, Users, Wallet, XCircle } from 'lucide-react';
import type { TechnicianApplication, TechnicianDetail, VerificationStatus } from '../types';
import { fetchTechnicianApplications, fetchTechnicianDetail, setTechnicianVerification } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { JobPhotoGallery } from '../components/JobPhotos';

interface Props { onNotice: (message: string) => void; onChanged: () => void; }
type Filter = 'all' | VerificationStatus;
const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' }, { key: 'Approved', label: 'อนุมัติแล้ว' }, { key: 'Pending', label: 'รอตรวจสอบ' }, { key: 'Rejected', label: 'ไม่ผ่าน / ระงับ' },
];
const statusText: Record<VerificationStatus, string> = { Approved: 'อนุมัติแล้ว', Pending: 'รอตรวจสอบ', Rejected: 'ไม่ผ่าน' };
const money = (value: number) => '฿' + value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
function when(value?: string | null, withTime = false) {
  if (!value || value.startsWith('0001')) return '—';
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || 'ช';
const telLink = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');

/** Every technician for admins: search and filter, then everything about one of them. */
export default function AdminTechniciansPage({ onNotice, onChanged }: Props) {
  const [rows, setRows] = useState<TechnicianApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await fetchTechnicianApplications()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'โหลดรายชื่อช่างไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter(row => (filter === 'all' || row.verificationStatus === filter)
      && (!text || [row.name, row.phone, row.email, row.area, row.skills.join(' ')].join(' ').toLowerCase().includes(text)))
      .sort((a, b) => b.jobsCompleted - a.jobsCompleted || a.name.localeCompare(b.name, 'th'));
  }, [rows, filter, query]);
  const count = (key: Filter) => key === 'all' ? rows.length : rows.filter(row => row.verificationStatus === key).length;

  if (selected != null) return <TechnicianProfileView id={selected} onBack={() => setSelected(null)} onNotice={onNotice}
    onSaved={saved => { setRows(previous => previous.map(row => row.id === saved.id ? saved : row)); onChanged(); }}/>;

  return <div className="page-stack">
    <div className="page-heading-row">
      <div><div className="eyebrow">TECHNICIANS</div><h1>ช่างทั้งหมด</h1><p className="page-subtitle">ดูข้อมูล ติดต่อ ผลงาน รายได้ และรีวิวของช่างทุกคน แตะชื่อเพื่อดูรายละเอียด</p></div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> {loading ? 'กำลังโหลด...' : 'โหลดใหม่'}</button>
    </div>
    <label className="at-search"><Search size={18}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อ เบอร์โทร อีเมล หรือพื้นที่" aria-label="ค้นหาช่าง"/></label>
    <div className="approval-tabs" role="tablist" aria-label="สถานะช่าง">
      {filters.map(item => <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label} <span>{count(item.key)}</span></button>)}
    </div>
    {error && <div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={() => void load()}><RefreshCw size={15}/> ลองใหม่</button></div>}
    {!loading && !error && shown.length === 0 && <section className="panel nearby-empty"><Users size={24}/><strong>{query ? 'ไม่พบช่างที่ค้นหา' : 'ยังไม่มีช่างในกลุ่มนี้'}</strong></section>}
    <ul className="at-list">{shown.map(row => <li key={row.id}>
      <button type="button" className="at-row" onClick={() => setSelected(row.id)}>
        <span className="at-avatar">{initials(row.name)}</span>
        <span className="at-main">
          <strong>{row.name}</strong>
          <span>{row.area || 'ไม่ระบุพื้นที่'} · {row.phone || 'ไม่มีเบอร์'}</span>
          <small><Star size={12} fill="currentColor"/> {row.reviewCount ? row.rating.toFixed(1) : '—'} · {row.jobsCompleted} งาน · เริ่ม {money(row.basePrice)}/เครื่อง</small>
        </span>
        <span className={'approval-state ' + row.verificationStatus.toLowerCase()}>{statusText[row.verificationStatus]}</span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
    </li>)}</ul>
  </div>;
}

function TechnicianProfileView({ id, onBack, onNotice, onSaved }: { id: number; onBack: () => void; onNotice: (message: string) => void; onSaved: (row: TechnicianApplication) => void }) {
  const [detail, setDetail] = useState<TechnicianDetail | null>(null);
  const [error, setError] = useState('');
  const [openJob, setOpenJob] = useState<number | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setError(''); fetchTechnicianDetail(id).then(setDetail).catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดข้อมูลช่างไม่สำเร็จ')); }, [id]);
  useEffect(() => { load(); window.scrollTo({ top: 0 }); }, [load]);

  async function decide(verified: boolean) {
    setBusy(true);
    try {
      const saved = await setTechnicianVerification(id, verified, verified ? undefined : note.trim());
      onSaved(saved); setSuspending(false); setNote('');
      setDetail(previous => previous && { ...previous, profile: saved });
      onNotice(verified ? `อนุมัติ ${saved.name} แล้ว` : `ระงับการรับงานของ ${saved.name} แล้ว`);
    } catch (reason) { onNotice(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  if (error) return <div className="page-stack"><button type="button" className="text-button" onClick={onBack}><ArrowLeft size={16}/> ช่างทั้งหมด</button>
    <div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={load}><RefreshCw size={15}/> ลองใหม่</button></div></div>;
  if (!detail) return <div className="page-stack"><button type="button" className="text-button" onClick={onBack}><ArrowLeft size={16}/> ช่างทั้งหมด</button><p className="page-subtitle">กำลังโหลด…</p></div>;

  const { profile, stats } = detail;
  return <div className="page-stack at-detail">
    <button type="button" className="text-button at-back" onClick={onBack}><ArrowLeft size={16}/> ช่างทั้งหมด</button>
    <section className="panel at-head">
      <span className="at-avatar large">{initials(profile.name)}</span>
      <div className="at-head-main">
        <h1>{profile.name}</h1>
        <p>{profile.title} · ประสบการณ์ {profile.experienceYears} ปี</p>
        <span className={'approval-state ' + profile.verificationStatus.toLowerCase()}>{statusText[profile.verificationStatus]}</span>
      </div>
      <div className="at-contact">
        {profile.phone && <a className="primary-button" href={telLink(profile.phone)}><Phone size={16}/> โทร {profile.phone}</a>}
        {profile.email && <a className="outline-button" href={'mailto:' + profile.email}><Mail size={16}/> อีเมล</a>}
      </div>
    </section>

    <dl className="at-stats">
      <div><dt><CheckCircle2 size={15}/> งานเสร็จ</dt><dd>{stats.jobsCompleted}</dd></div>
      <div><dt><BriefcaseBusiness size={15}/> กำลังทำ</dt><dd>{stats.jobsActive}</dd></div>
      <div><dt><Star size={15}/> คะแนน</dt><dd>{stats.reviewCount ? `${stats.rating.toFixed(1)} (${stats.reviewCount})` : '—'}</dd></div>
      <div><dt><Wallet size={15}/> รายได้เดือนนี้</dt><dd>{money(stats.revenueThisMonth)}</dd></div>
      <div><dt><Wallet size={15}/> รายได้รวม</dt><dd>{money(stats.revenueTotal)}</dd></div>
      <div><dt><XCircle size={15}/> ยกเลิก</dt><dd>{stats.jobsCancelled}</dd></div>
      <div><dt>ข้อเสนอรอลูกค้า</dt><dd>{stats.offersWaiting}</dd></div>
      <div className={stats.openIssues ? 'warn' : ''}><dt><AlertCircle size={15}/> เรื่องที่ถูกแจ้ง</dt><dd>{stats.openIssues}</dd></div>
    </dl>

    <div className="at-columns">
      <section className="panel at-section">
        <h2>ข้อมูลช่าง</h2>
        <dl className="at-facts">
          <div><dt><Phone size={14}/> เบอร์โทร</dt><dd>{profile.phone ? <a href={telLink(profile.phone)}>{profile.phone}</a> : '—'}</dd></div>
          <div><dt><Mail size={14}/> อีเมล</dt><dd>{profile.email ? <a href={'mailto:' + profile.email}>{profile.email}</a> : '—'}</dd></div>
          <div><dt><MapPin size={14}/> พื้นที่รับงาน</dt><dd>{profile.area || '—'}</dd></div>
          <div><dt>ราคาเริ่มต้น</dt><dd>{money(profile.basePrice)} / เครื่อง</dd></div>
          <div><dt>บริการ</dt><dd>{profile.skills.join(', ') || '—'}</dd></div>
          <div><dt><CalendarDays size={14}/> เวลาที่รับงาน</dt><dd>{profile.availableText || '—'}</dd></div>
          <div><dt>เข้าสู่ระบบด้วย</dt><dd>{detail.signIn.map(item => item === 'google' ? 'Google' : item === 'apple' ? 'Apple' : item).join(', ') || '—'}</dd></div>
          <div><dt>สมัครบัญชี</dt><dd>{when(detail.accountCreatedAt)}</dd></div>
          <div><dt>ส่งข้อมูลช่าง</dt><dd>{when(profile.appliedAt, true)}</dd></div>
          <div><dt>ตรวจสอบล่าสุด</dt><dd>{when(profile.reviewedAt, true)}</dd></div>
          {profile.verificationNote && <div><dt>เหตุผลล่าสุด</dt><dd>{profile.verificationNote}</dd></div>}
        </dl>
        {suspending
          ? <div className="approval-reject">
            <label className="form-field"><span>เหตุผล (ช่างจะเห็นข้อความนี้)</span><textarea rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="เช่น ลูกค้าร้องเรียนหลายครั้ง รอตรวจสอบ"/></label>
            <div><button type="button" className="primary-button danger" disabled={busy || !note.trim()} onClick={() => void decide(false)}><XCircle size={15}/> ยืนยัน</button><button type="button" className="outline-button" disabled={busy} onClick={() => setSuspending(false)}>ยกเลิก</button></div>
          </div>
          : <div className="at-actions">
            {profile.verificationStatus !== 'Approved' && <button type="button" className="primary-button" disabled={busy || !profile.phone} onClick={() => void decide(true)}><CheckCircle2 size={15}/> อนุมัติ</button>}
            <button type="button" className="outline-button" disabled={busy} onClick={() => setSuspending(true)}><XCircle size={15}/> {profile.verificationStatus === 'Approved' ? 'ระงับการรับงาน' : 'ไม่ผ่าน'}</button>
          </div>}
      </section>

      <section className="panel at-section">
        <h2>รีวิวจากลูกค้า ({detail.reviews.length})</h2>
        {detail.reviews.length === 0 ? <p className="page-subtitle">ยังไม่มีรีวิว</p> : <ul className="at-reviews">{detail.reviews.map((review, index) => <li key={index}>
          <span className="at-stars" aria-label={`${review.rating} ดาว`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < review.rating ? 'currentColor' : 'none'}/>)}</span>
          {review.comment && <p>“{review.comment}”</p>}
          <small>{review.customer || 'ลูกค้า'} · {review.bookingCode} · {when(review.createdAt)}</small>
        </li>)}</ul>}
      </section>
    </div>

    <section className="panel at-section">
      <h2>งานล่าสุด ({detail.jobs.length})</h2>
      {detail.jobs.length === 0 ? <p className="page-subtitle">ยังไม่มีงาน</p> : <ul className="at-jobs">{detail.jobs.map(job => <li key={job.id}>
        <button type="button" className="at-job" aria-expanded={openJob === job.id} onClick={() => setOpenJob(value => value === job.id ? null : job.id)}>
          <span className="at-job-date"><strong>{new Date(job.date + 'T00:00:00').getDate()}</strong><small>{new Date(job.date + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}</small></span>
          <span className="at-main"><strong>{job.code} · {job.service} {job.unitCount} เครื่อง</strong><span>{job.customer} · {job.time} น. · {money(job.price)}</span><small>{job.area}</small></span>
          <span className="at-job-side"><StatusBadge status={job.status}/>{job.photos > 0 && <small><Camera size={12}/> {job.photos}</small>}{job.customerRating ? <small><Star size={12} fill="currentColor"/> {job.customerRating}</small> : null}</span>
        </button>
        {openJob === job.id && <div className="at-job-photos">{job.photos > 0 ? <JobPhotoGallery bookingId={job.id}/> : <p className="page-subtitle">งานนี้ไม่มีรูป</p>}</div>}
      </li>)}</ul>}
    </section>
  </div>;
}
