import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import qrcode from 'qrcode-generator';
import { ShieldCheck, AlertCircle, BadgeCheck, CalendarClock, Check, CheckCircle2, Clock3, Copy, Gift, Loader2, Paperclip, RefreshCw, Save, Send, Wallet, XCircle } from 'lucide-react';
import type { AdminMembership, MemberRow, Membership, MembershipPayment, MembershipSettings, MembershipState } from '../types';
import { fetchAdminMembership, fetchMyMembership, grantMembershipDays, payMembership, reviewMembershipPayment, saveMembershipSettings } from '../lib/api';
import { promptPayPayload } from '../lib/promptpay';
import { resizeForUpload } from '../lib/image';
import { formatPhone } from '../components/Reschedule';
import PrivateImage, { ImageViewer } from '../components/PrivateImage';
import { numberText } from '../lib/numberText';
import './CustomerJobs.css';
import './Membership.css';

const thaiDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const thaiDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const baht = (value: number) => '฿' + value.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const errorText = (reason: unknown, fallback: string) => reason instanceof Error && reason.message ? reason.message : fallback;
const stateLabel: Record<MembershipState, string> = { Trial: 'ทดลองใช้ฟรี', Active: 'สมาชิก', Expired: 'หมดอายุ', NotApproved: 'รออนุมัติบัญชี' };
const paymentLabel = { Pending: 'รอตรวจ', Approved: 'ผ่านแล้ว', Rejected: 'ไม่ผ่าน' } as const;
const plans = [1, 3, 6, 12];

/** Technicians see their own membership; admins see slips to check, the price settings and every member. */
export default function MembershipPage({ admin, onNotice }: { admin: boolean; onNotice: (message: string) => void }) {
  return admin ? <AdminMembershipView onNotice={onNotice}/> : <TechnicianMembership onNotice={onNotice}/>;
}

/* ───────────── Technician ───────────── */

function TechnicianMembership({ onNotice }: { onNotice: (message: string) => void }) {
  const [data, setData] = useState<Membership | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); fetchMyMembership().then(setData).catch(reason => setError(errorText(reason, 'โหลดข้อมูลสมาชิกไม่สำเร็จ'))); }, []);
  useEffect(load, [load]);

  if (error) return <div className="ms-page"><div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" className="outline-button" onClick={load}><RefreshCw size={15}/> ลองใหม่</button></div></div>;
  if (!data) return <div className="ms-page"><p className="td-loading"><Loader2 size={18} className="ui-spin"/> กำลังโหลด…</p></div>;

  const expired = data.state === 'Expired';
  const soon = !expired && data.state !== 'NotApproved' && data.daysLeft <= 7;
  return <div className="ms-page">
    <h1 className="ms-title">สมาชิก AirClean</h1>
    <section className={'ms-status ' + (expired ? 'expired' : soon ? 'soon' : 'ok')}>
      <span className="ms-status-icon">{expired ? <XCircle size={26}/> : data.state === 'Trial' ? <Gift size={26}/> : <BadgeCheck size={26}/>}</span>
      <div>
        <span className="ms-state">{stateLabel[data.state]}</span>
        <strong>{data.state === 'NotApproved' ? 'เริ่มทดลองใช้ฟรีหลังผู้ดูแลอนุมัติบัญชี'
          : expired ? 'ส่งข้อเสนองานใหม่ไม่ได้จนกว่าจะต่ออายุ'
          : `ใช้ได้ถึง ${thaiDate(data.memberUntil)}`}</strong>
        <small>{data.state === 'NotApproved' ? `ทดลองใช้ฟรี ${data.trialDays} วัน จากนั้น ${baht(data.monthlyFee)} ต่อเดือน`
          : expired ? `หมดเมื่อ ${thaiDate(data.memberUntil)} · งานที่รับไว้แล้วยังทำต่อได้ตามปกติ`
          : `เหลืออีก ${data.daysLeft} วัน · สมาชิกส่งข้อเสนองานใกล้ตัวได้ไม่จำกัด`}</small>
      </div>
    </section>

    {data.state !== 'NotApproved' && (data.pending
      ? <PendingSlip payment={data.pending} auto={Boolean(data.autoCheck && data.pending.checkError)}/>
      : <Renew data={data} onSent={payment => {
        if (payment.status === 'Approved') { onNotice(`ตรวจสลิปผ่าน ต่ออายุถึง ${thaiDate(payment.coveredUntil)} แล้ว`); load(); return; }
        setData({ ...data, pending: payment, history: [payment, ...data.history] });
        onNotice(data.autoCheck ? 'ได้รับสลิปแล้ว ระบบจะตรวจกับธนาคารอีกครั้งอัตโนมัติ' : 'ส่งสลิปแล้ว ผู้ดูแลจะตรวจและต่ออายุให้');
      }}/>)}

    {data.history.length > 0 && <section className="ms-card">
      <h2>ประวัติการชำระ</h2>
      <ul className="ms-history">{data.history.map(item => <li key={item.id}>
        <div><strong>{item.months} เดือน · {baht(item.amount)}</strong><span>ส่งเมื่อ {thaiDateTime(item.createdAt)}{item.coveredUntil ? ` · ต่อถึง ${thaiDate(item.coveredUntil)}` : ''}{item.checkedBy === 'auto' ? ' · ตรวจอัตโนมัติ' : item.checkedBy === 'admin' ? ' · ผู้ดูแลตรวจ' : ''}</span>{item.status === 'Rejected' && item.note && <span className="ms-reason">เหตุผล: {item.note}</span>}</div>
        <em className={'ms-pill ' + item.status.toLowerCase()}>{paymentLabel[item.status]}</em>
      </li>)}</ul>
    </section>}
  </div>;
}

function PendingSlip({ payment, auto }: { payment: MembershipPayment; auto: boolean }) {
  const [viewing, setViewing] = useState<string | null>(null);
  return <section className="ms-card ms-pending">
    <Clock3 size={22}/>
    <div>
      <h2>{auto ? 'รอธนาคารยืนยันรายการ' : 'รอผู้ดูแลตรวจสลิป'}</h2>
      <p>{payment.months} เดือน · {baht(payment.amount)} · ส่งเมื่อ {thaiDateTime(payment.createdAt)}<br/>{auto ? 'ระบบจะตรวจอีกครั้งอัตโนมัติทุกไม่กี่นาที ถ้ายังไม่ได้ ผู้ดูแลจะตรวจให้ ' : ''}เมื่อผ่านแล้วระบบจะต่ออายุและแจ้งเตือนให้ทันที</p>
    </div>
    <PrivateImage path={`/membership/payments/${payment.id}/slip`} alt="สลิปที่ส่ง" onOpen={setViewing}/>
    {viewing && <ImageViewer url={viewing} alt="สลิปที่ส่ง" onClose={() => setViewing(null)}/>}
  </section>;
}

/** Pick months, scan the QR (the amount is filled in), attach the slip, send. */
function Renew({ data, onSent }: { data: Membership; onSent: (payment: MembershipPayment) => void }) {
  const [turnedDown, setTurnedDown] = useState('');
  const [months, setMonths] = useState(1);
  const [slip, setSlip] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const amount = data.monthlyFee * months;
  const qr = useMemo(() => {
    if (!data.promptPayId || amount <= 0) return '';
    const code = qrcode(0, 'M');
    code.addData(promptPayPayload(data.promptPayId, amount));
    code.make();
    return code.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [data.promptPayId, amount]);

  async function pick(chosen?: File) {
    if (!chosen) return;
    setError('');
    try { setSlip(await resizeForUpload(chosen, 1400)); } catch (reason) { setError(errorText(reason, 'เปิดรูปสลิปไม่ได้')); }
  }
  async function send() {
    setBusy(true); setError(''); setTurnedDown('');
    try {
      const result = await payMembership(months, slip);
      // A slip the bank check turned down stays on this form with the reason, ready for another slip.
      if (result.status === 'Rejected') { setTurnedDown(result.note || 'สลิปนี้ใช้ต่ออายุไม่ได้'); setSlip(''); if (file.current) file.current.value = ''; setBusy(false); return; }
      setBusy(false); setSlip(''); if (file.current) file.current.value = '';
      onSent(result);
    }
    catch (reason) { setError(errorText(reason, 'ส่งสลิปไม่สำเร็จ')); setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(data.promptPayId); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* Clipboard blocked; the number is on screen. */ }
  }

  return <section className="ms-card ms-renew">
    <h2>{data.state === 'Expired' ? 'ต่ออายุสมาชิก' : 'ต่ออายุล่วงหน้า'}</h2>
    <p className="ms-lead">ต่อจากวันหมดอายุเดิม ไม่เสียวันที่เหลืออยู่</p>
    <div className="ms-plans" role="radiogroup" aria-label="จำนวนเดือน">{plans.map(count => <button key={count} type="button" role="radio" aria-checked={months === count} className={months === count ? 'active' : ''} onClick={() => setMonths(count)}>
      <strong>{count} เดือน</strong><span>{baht(data.monthlyFee * count)}</span>
    </button>)}</div>

    {!data.promptPayId ? <p className="ms-warn"><AlertCircle size={16}/> ผู้ดูแลยังไม่ได้ตั้งบัญชีรับเงิน กรุณาติดต่อผู้ดูแลระบบ</p> : <>
      <ol className="ms-steps">
        <li>
          <span className="ms-step-no">1</span>
          <div className="ms-step-body">
            <strong>สแกนจ่ายด้วยแอปธนาคาร</strong>
            <div className="ms-pay">
              <div className="ms-qr" role="img" aria-label={`QR พร้อมเพย์ ${baht(amount)}`} dangerouslySetInnerHTML={{ __html: qr }}/>
              <dl>
                <div><dt>ยอดโอน</dt><dd className="ms-amount">{baht(amount)}</dd></div>
                <div><dt>พร้อมเพย์</dt><dd>{data.promptPayId.length === 10 ? formatPhone(data.promptPayId) : data.promptPayId} <button type="button" className="cj-link" onClick={() => void copy()}><Copy size={13}/> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button></dd></div>
                {data.payeeName && <div><dt>ชื่อบัญชี</dt><dd>{data.payeeName}</dd></div>}
              </dl>
            </div>
          </div>
        </li>
        <li>
          <span className="ms-step-no">2</span>
          <div className="ms-step-body">
            <strong>แนบสลิปการโอน</strong>
            <label className={'ms-slip' + (slip ? ' has' : '')}>
              <input ref={file} type="file" accept="image/*" onChange={event => void pick(event.target.files?.[0])}/>
              {slip ? <img src={slip} alt="สลิปที่เลือก"/> : <Paperclip size={20}/>}
              <span>{slip ? 'เปลี่ยนรูปสลิป' : 'เลือกรูปสลิปจากเครื่อง'}</span>
            </label>
          </div>
        </li>
      </ol>
      {turnedDown && <div className="ms-turned-down" role="alert"><XCircle size={18}/><div><strong>สลิปไม่ผ่านการตรวจ</strong><span>{turnedDown}</span></div></div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button type="button" className="cj-primary full" disabled={!slip || busy} onClick={() => void send()}>{busy ? <><Loader2 size={17} className="ui-spin"/> {data.autoCheck ? 'กำลังตรวจกับธนาคาร…' : 'กำลังส่ง…'}</> : <><Send size={17}/> {data.autoCheck ? 'ตรวจสลิปและต่ออายุ' : 'ส่งสลิป'} {baht(amount)}</>}</button>
      <p className="ms-fine">{data.autoCheck ? <><ShieldCheck size={13}/> ระบบตรวจสลิปกับธนาคารทันที ถ้าเงินเข้าบัญชี AirClean ครบ ต่ออายุให้เลย สลิปปลอมหรือสลิปที่เคยใช้แล้วจะไม่ผ่าน</> : 'ผู้ดูแลตรวจยอดเงินเข้าแล้วต่ออายุให้ ส่วนใหญ่ภายในวันเดียวกัน'}</p>
    </>}
  </section>;
}

/* ───────────── Admin ───────────── */

function AdminMembershipView({ onNotice }: { onNotice: (message: string) => void }) {
  const [data, setData] = useState<AdminMembership | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); fetchAdminMembership().then(setData).catch(reason => setError(errorText(reason, 'โหลดข้อมูลไม่สำเร็จ'))); }, []);
  useEffect(load, [load]);
  if (error) return <div className="ms-page"><div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" className="outline-button" onClick={load}><RefreshCw size={15}/> ลองใหม่</button></div></div>;
  if (!data) return <div className="ms-page"><p className="td-loading"><Loader2 size={18} className="ui-spin"/> กำลังโหลด…</p></div>;
  const pending = data.payments.filter(item => item.status === 'Pending');
  const done = data.payments.filter(item => item.status !== 'Pending');
  const expired = data.members.filter(item => item.state === 'Expired').length;

  return <div className="ms-page ms-admin">
    <div className="ms-admin-head">
      <h1 className="ms-title">ค่าสมาชิกช่าง</h1>
      <button type="button" className="outline-button" onClick={load}><RefreshCw size={15}/> โหลดใหม่</button>
    </div>
    <p className="ms-summary">{pending.length ? `${pending.length} สลิปรอตรวจ` : 'ไม่มีสลิปรอตรวจ'} · ช่าง {data.members.length} คน{expired ? ` · หมดอายุ ${expired} คน` : ''}</p>
    <p className={'ms-auto' + (data.autoCheck ? ' on' : '')}>{data.autoCheck
      ? <><ShieldCheck size={16}/> ตรวจสลิปอัตโนมัติเปิดอยู่: สลิปจริงที่ยอดและบัญชีผู้รับถูกต้องจะต่ออายุทันที ที่นี่จะเหลือเฉพาะสลิปที่ระบบตัดสินไม่ได้</>
      : <><AlertCircle size={16}/> ยังไม่ได้เปิดตรวจสลิปอัตโนมัติ (ตั้งค่า SLIP2GO_API_SECRET บนเซิร์ฟเวอร์) ทุกสลิปจึงรอคุณตรวจ</>}</p>

    {pending.length > 0 && <section aria-label="สลิปรอตรวจ" className="ms-slips">{pending.map(item => <SlipReview key={item.id} payment={item} onDone={() => { onNotice('บันทึกผลแล้ว'); load(); }}/>)}</section>}

    <div className="ms-admin-grid">
      <MembersTable members={data.members} onGranted={load} onNotice={onNotice}/>
      <SettingsForm settings={data.settings} onSaved={settings => { setData({ ...data, settings }); onNotice('บันทึกการตั้งค่าแล้ว'); }}/>
    </div>

    {done.length > 0 && <section className="ms-card">
      <h2>ตรวจแล้วล่าสุด</h2>
      <ul className="ms-history">{done.slice(0, 20).map(item => <li key={item.id}>
        <div><strong>{item.technicianName} · {item.months} เดือน · {baht(item.amount)}</strong><span>{thaiDateTime(item.reviewedAt)} · {item.checkedBy === 'auto' ? 'ตรวจอัตโนมัติ' : 'ผู้ดูแลตรวจ'}{item.coveredUntil ? ` · ต่อถึง ${thaiDate(item.coveredUntil)}` : ''}{item.note ? ` · ${item.note}` : ''}</span></div>
        <em className={'ms-pill ' + item.status.toLowerCase()}>{paymentLabel[item.status]}</em>
      </li>)}</ul>
    </section>}
  </div>;
}

function SlipReview({ payment, onDone }: { payment: MembershipPayment; onDone: () => void }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(approve: boolean) {
    setBusy(true); setError('');
    try { await reviewMembershipPayment(payment.id, approve, approve ? undefined : note.trim()); onDone(); }
    catch (reason) { setError(errorText(reason, 'บันทึกไม่สำเร็จ')); setBusy(false); }
  }
  return <article className="ms-card ms-slip-card">
    <PrivateImage path={`/membership/payments/${payment.id}/slip`} alt={`สลิปของ ${payment.technicianName}`} onOpen={setViewing}/>
    <div className="ms-slip-info">
      <strong>{payment.technicianName}</strong>
      <span className="ms-amount">{baht(payment.amount)}</span>
      <span>{payment.months} เดือน · ส่งเมื่อ {thaiDateTime(payment.createdAt)}</span>
      {payment.checkError && <small className="ms-check-error">ตรวจอัตโนมัติไม่ได้: {payment.checkError}</small>}
      <small>ตรวจว่ายอดเงินเข้าบัญชีพร้อมเพย์ตรงกับสลิปก่อนกดยืนยัน</small>
      {rejecting
        ? <div className="ms-reject">
          <label className="form-field"><span>เหตุผล (ช่างจะเห็นข้อความนี้)</span><input value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="เช่น ยอดเงินไม่ตรง / ไม่พบยอดเข้า"/></label>
          <div><button type="button" className="cj-danger" disabled={busy || !note.trim()} onClick={() => void decide(false)}>ยืนยันไม่ผ่าน</button><button type="button" className="cj-ghost" disabled={busy} onClick={() => setRejecting(false)}>ยกเลิก</button></div>
        </div>
        : <div className="ms-actions">
          <button type="button" className="cj-primary" disabled={busy} onClick={() => void decide(true)}><Check size={17}/> เงินเข้าแล้ว ต่ออายุ</button>
          <button type="button" className="cj-ghost" disabled={busy} onClick={() => setRejecting(true)}><XCircle size={16}/> ไม่ผ่าน</button>
        </div>}
      {error && <p className="jp-error" role="alert">{error}</p>}
    </div>
    {viewing && <ImageViewer url={viewing} alt="สลิป" onClose={() => setViewing(null)}/>}
  </article>;
}

function MembersTable({ members, onGranted, onNotice }: { members: MemberRow[]; onGranted: () => void; onNotice: (message: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  async function grant(row: MemberRow) {
    setBusy(row.technicianId);
    try { await grantMembershipDays(row.technicianId, 30); onNotice(`เพิ่ม 30 วันให้ ${row.name} แล้ว`); onGranted(); }
    catch (reason) { onNotice(errorText(reason, 'เพิ่มวันไม่สำเร็จ')); }
    finally { setBusy(null); }
  }
  return <section className="ms-card">
    <h2>ช่างทั้งหมด</h2>
    {!members.length ? <p className="ms-lead">ยังไม่มีช่างที่อนุมัติแล้ว</p> :
    <ul className="ms-members">{members.map(row => <li key={row.technicianId}>
      <div><strong>{row.name}</strong><span>{row.phone ? formatPhone(row.phone) : '—'}</span></div>
      <div className="ms-member-state">
        <em className={'ms-pill ' + row.state.toLowerCase()}>{stateLabel[row.state]}</em>
        <span>{row.memberUntil ? (row.daysLeft > 0 ? `ถึง ${thaiDate(row.memberUntil)} · ${row.daysLeft} วัน` : `หมด ${thaiDate(row.memberUntil)}`) : 'เริ่มเมื่อเปิดหน้าแรก'}</span>
      </div>
      <button type="button" className="cj-link" disabled={busy === row.technicianId} onClick={() => void grant(row)} title="ให้ฟรี 30 วัน เช่น โปรโมชันหรือชดเชย"><CalendarClock size={14}/> +30 วัน</button>
    </li>)}</ul>}
  </section>;
}

function SettingsForm({ settings, onSaved }: { settings: MembershipSettings; onSaved: (settings: MembershipSettings) => void }) {
  const [form, setForm] = useState(settings);
  // The two numbers stay text while typing, so a box can be emptied without a 0 popping back in.
  const [fee, setFee] = useState(String(settings.monthlyFee));
  const [trial, setTrial] = useState(String(settings.trialDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onSaved(await saveMembershipSettings({ ...form, monthlyFee: Number(fee || 0), trialDays: Number(trial || 0) })); }
    catch (reason) { setError(errorText(reason, 'บันทึกไม่สำเร็จ')); }
    finally { setBusy(false); }
  }
  return <form className="ms-card ms-settings" onSubmit={submit}>
    <h2><Wallet size={18}/> ราคาและบัญชีรับเงิน</h2>
    <label className="form-field"><span>ค่าสมาชิกต่อเดือน (บาท)</span><input inputMode="decimal" value={fee} placeholder="0" onChange={event => setFee(numberText(event.target.value, { decimals: 2, maxLength: 8 }))}/></label>
    <label className="form-field"><span>ทดลองใช้ฟรีหลังอนุมัติ (วัน)</span><input inputMode="numeric" value={trial} placeholder="0" onChange={event => setTrial(numberText(event.target.value, { maxLength: 3 }))}/></label>
    <label className="form-field"><span>พร้อมเพย์ (เบอร์มือถือหรือเลขประจำตัว 13 หลัก)</span><input inputMode="numeric" value={form.promptPayId} maxLength={20} onChange={event => setForm({ ...form, promptPayId: event.target.value })} placeholder="08x-xxx-xxxx"/></label>
    <label className="form-field"><span>ชื่อบัญชีที่ช่างจะเห็น</span><input value={form.payeeName} maxLength={120} onChange={event => setForm({ ...form, payeeName: event.target.value })} placeholder="เช่น บจก. แอร์คลีน"/></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <p className="ms-fine">ราคาใหม่ใช้กับสลิปที่ส่งหลังจากนี้ ช่างที่ทดลองใช้อยู่ไม่ถูกเปลี่ยนวัน</p>
    <button type="submit" className="cj-primary" disabled={busy}><Save size={16}/> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
  </form>;
}

/** A one-line membership status for the technician's other pages; opens the membership page. */
export function MembershipStrip({ data, onOpen, always = false }: { data: Membership; onOpen: () => void; always?: boolean }) {
  if (data.state === 'NotApproved') return null;
  const expired = data.state === 'Expired';
  const soon = !expired && data.daysLeft <= 7;
  if (!always && !expired && !soon && data.state === 'Active') return null;
  return <div className={'ms-strip ' + (expired ? 'expired' : soon ? 'soon' : 'trial')} role={expired ? 'alert' : 'status'}>
    {expired ? <XCircle size={18}/> : data.pending ? <Clock3 size={18}/> : data.state === 'Trial' ? <Gift size={18}/> : <CheckCircle2 size={18}/>}
    <span>{expired ? (data.pending ? 'สมาชิกหมดอายุ · สลิปรอผู้ดูแลตรวจ' : 'สมาชิกหมดอายุ ส่งข้อเสนองานใหม่ไม่ได้')
      : data.state === 'Trial' ? `ทดลองใช้ฟรี เหลือ ${data.daysLeft} วัน` : soon ? `สมาชิกเหลือ ${data.daysLeft} วัน` : `สมาชิกใช้ได้ถึง ${thaiDate(data.memberUntil)}`}</span>
    <button type="button" className="cj-link" onClick={onOpen}>{expired ? 'ต่ออายุ' : 'ดูรายละเอียด'}</button>
  </div>;
}
