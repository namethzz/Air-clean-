import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, BriefcaseBusiness, CheckCircle2, Copy, KeyRound, Mail, MapPin, Phone, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react';
import type { TechnicianApplication, VerificationStatus } from '../types';
import { createPasswordResetLink, fetchTechnicianApplications, sendTestEmail, setTechnicianVerification } from '../lib/api';

interface Props { onNotice: (message: string) => void; onChanged: () => void; }
const tabs: { key: VerificationStatus; label: string }[] = [
  { key: 'Pending', label: 'รอตรวจสอบ' }, { key: 'Rejected', label: 'ไม่ผ่าน' }, { key: 'Approved', label: 'อนุมัติแล้ว' },
];
function when(value?: string | null) {
  return value ? new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}
function errorText(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }

/** Admin queue for technician applications, plus a manual password reset link for users without email access. */
export default function ApprovalsPage({ onNotice, onChanged }: Props) {
  const [rows, setRows] = useState<TechnicianApplication[]>([]);
  const [tab, setTab] = useState<VerificationStatus>('Pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await fetchTechnicianApplications()); }
    catch (reason) { setError(errorText(reason, 'โหลดรายการช่างไม่สำเร็จ')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function replace(saved: TechnicianApplication) { setRows(previous => previous.map(row => row.id === saved.id ? saved : row)); onChanged(); }
  const shown = rows.filter(row => row.verificationStatus === tab);
  const count = (key: VerificationStatus) => rows.filter(row => row.verificationStatus === key).length;

  return <div className="page-stack">
    <div className="page-heading-row">
      <div><div className="eyebrow">TECHNICIAN APPROVAL</div><h1>ตรวจสอบช่าง</h1><p className="page-subtitle">ช่างที่สมัครใหม่จะยังไม่เห็นงานจนกว่าคุณอนุมัติ ตรวจชื่อ เบอร์โทร พื้นที่ และราคา และโทรยืนยันตัวตนก่อนอนุมัติ</p></div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> {loading ? 'กำลังโหลด...' : 'โหลดใหม่'}</button>
    </div>
    <div className="approval-tabs" role="tablist" aria-label="สถานะการตรวจสอบ">
      {tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label} <span>{count(item.key)}</span></button>)}
    </div>
    {error && <div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={() => void load()}><RefreshCw size={15}/> ลองใหม่</button></div>}
    {!loading && !error && shown.length === 0 && <section className="panel nearby-empty"><ShieldCheck size={24}/><strong>{tab === 'Pending' ? 'ไม่มีช่างรอตรวจสอบ' : 'ไม่มีรายการ'}</strong></section>}
    <div className="approval-grid">{shown.map(row => <ApplicationCard key={row.id} row={row} onSaved={replace} onNotice={onNotice}/>)}</div>
    <ResetLinkPanel/>
    <TestEmailPanel/>
  </div>;
}

function ApplicationCard({ row, onSaved, onNotice }: { row: TechnicianApplication; onSaved: (row: TechnicianApplication) => void; onNotice: (message: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function decide(verified: boolean) {
    setBusy(true);
    try {
      const saved = await setTechnicianVerification(row.id, verified, verified ? undefined : note.trim());
      onSaved(saved); setRejecting(false); setNote('');
      onNotice(verified ? `อนุมัติ ${row.name} แล้ว ช่างเห็นงานใกล้ตัวได้ทันที` : `บันทึกผลไม่ผ่านของ ${row.name} แล้ว`);
    } catch (reason) { onNotice(errorText(reason, 'บันทึกผลการตรวจสอบไม่สำเร็จ')); }
    finally { setBusy(false); }
  }
  return <article className="panel approval-card">
    <header><div><h2>{row.name}</h2><p>{row.title}</p></div><span className={'approval-state ' + row.verificationStatus.toLowerCase()}>{tabs.find(item => item.key === row.verificationStatus)?.label}</span></header>
    <dl>
      <div><dt><Phone size={14}/> โทร</dt><dd>{row.phone ? <a href={'tel:' + row.phone.replace(/[^\d+]/g, '')}>{row.phone}</a> : <em>ยังไม่ระบุ</em>}</dd></div>
      <div><dt><Mail size={14}/> อีเมล</dt><dd>{row.email || '—'}</dd></div>
      <div><dt><MapPin size={14}/> พื้นที่</dt><dd>{row.area}</dd></div>
      <div><dt><BriefcaseBusiness size={14}/> ประสบการณ์</dt><dd>{row.experienceYears} ปี · ราคาเริ่มต้น ฿{row.basePrice.toLocaleString()} / เครื่อง</dd></div>
      <div><dt>บริการ</dt><dd>{row.skills.join(', ') || '—'}</dd></div>
      <div><dt>ส่งข้อมูล</dt><dd>{when(row.appliedAt)}{row.reviewedAt ? ` · ตรวจล่าสุด ${when(row.reviewedAt)}` : ''}</dd></div>
      {row.verificationStatus === 'Approved' && <div><dt>ผลงาน</dt><dd>{row.jobsCompleted} งาน · ★ {row.rating.toFixed(1)} ({row.reviewCount} รีวิว)</dd></div>}
      {row.verificationNote && <div><dt>เหตุผล</dt><dd>{row.verificationNote}</dd></div>}
    </dl>
    {rejecting
      ? <div className="approval-reject">
        <label className="form-field"><span>{row.verificationStatus === 'Approved' ? 'เหตุผลที่ระงับ (ช่างจะเห็นข้อความนี้)' : 'เหตุผลที่ไม่ผ่าน (ช่างจะเห็นข้อความนี้)'}</span><textarea rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="เช่น โทรติดต่อไม่ได้ กรุณาตรวจเบอร์โทร"/></label>
        <div><button type="button" className="primary-button danger" disabled={busy || !note.trim()} onClick={() => void decide(false)}><XCircle size={15}/> ยืนยัน</button><button type="button" className="outline-button" disabled={busy} onClick={() => setRejecting(false)}>ยกเลิก</button></div>
      </div>
      : <footer>
        {row.verificationStatus !== 'Approved' && <button type="button" className="primary-button" disabled={busy || !row.phone} onClick={() => void decide(true)}><CheckCircle2 size={15}/> อนุมัติ</button>}
        <button type="button" className="outline-button" disabled={busy} onClick={() => setRejecting(true)}><XCircle size={15}/> {row.verificationStatus === 'Approved' ? 'ระงับการรับงาน' : row.verificationStatus === 'Rejected' ? 'แก้เหตุผล' : 'ไม่ผ่าน'}</button>
      </footer>}
    {!row.phone && row.verificationStatus !== 'Approved' && <p className="page-subtitle">ยังอนุมัติไม่ได้จนกว่าช่างจะเพิ่มเบอร์โทรในโปรไฟล์</p>}
  </article>;
}

function ResetLinkPanel() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ link: string; expiresAt: string; fullName: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null); setCopied(false);
    try { setResult(await createPasswordResetLink(email)); }
    catch (reason) { setError(errorText(reason, 'สร้างลิงก์ไม่สำเร็จ')); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { setCopied(false); }
  }
  return <section className="panel profile-form-panel">
    <div className="panel-heading"><div><h2>ลิงก์ตั้งรหัสผ่านใหม่</h2><p>ใช้เมื่อผู้ใช้ลืมรหัสผ่านและไม่ได้รับอีเมล ยืนยันตัวตนทางโทรศัพท์ก่อนส่งลิงก์ให้ ลิงก์ใช้ได้ครั้งเดียวภายใน 24 ชั่วโมง</p></div></div>
    <form className="profile-form" onSubmit={submit}>
      <label className="form-field"><span>อีเมลของบัญชี</span><div className="profile-input-wrap"><Mail size={17}/><input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required/></div></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {result && <div className="reset-link-result" role="status"><span>ลิงก์สำหรับ {result.fullName} (หมดอายุ {when(result.expiresAt)})</span><code>{result.link}</code><button type="button" className="outline-button" onClick={() => void copy()}><Copy size={15}/> {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button></div>}
      <button type="submit" className="primary-button" disabled={busy}><KeyRound size={16}/> {busy ? 'กำลังสร้าง...' : 'สร้างลิงก์'}</button>
    </form>
  </section>;
}

/** Sends one email now and shows the mail service's answer, so delivery problems don't need the server logs. */
function TestEmailPanel() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setResult(null);
    try { setResult({ ok: true, message: await sendTestEmail(email) }); }
    catch (reason) { setResult({ ok: false, message: errorText(reason, 'ส่งอีเมลทดสอบไม่สำเร็จ') }); }
    finally { setBusy(false); }
  }
  return <section className="panel profile-form-panel">
    <div className="panel-heading"><div><h2>ทดสอบการส่งอีเมล</h2><p>ส่งอีเมลทดสอบหนึ่งฉบับเพื่อตรวจว่าระบบลืมรหัสผ่านส่งอีเมลออกได้ ถ้าไม่สำเร็จจะแสดงสาเหตุจากผู้ให้บริการอีเมล</p></div></div>
    <form className="profile-form" onSubmit={submit}>
      <label className="form-field"><span>ส่งไปที่อีเมล</span><div className="profile-input-wrap"><Mail size={17}/><input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required/></div></label>
      {result && (result.ok
        ? <div className="profile-saved" role="status"><CheckCircle2 size={17}/>{result.message}</div>
        : <div className="auth-error" role="alert">{result.message}</div>)}
      <button type="submit" className="primary-button" disabled={busy}><Send size={16}/> {busy ? 'กำลังส่ง...' : 'ส่งอีเมลทดสอบ'}</button>
    </form>
  </section>;
}
