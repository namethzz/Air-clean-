import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BadgeCheck, BellRing, Camera, CheckCircle2, ChevronRight, Eye, EyeOff, IdCard, KeyRound, Loader2, LogOut, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import type { Membership, TechnicianApplication, TechnicianDocument, UserProfile, UserRole } from '../../types';
import ServiceProfileForm from './technician/TechnicianProfileSettings';
import TechnicianDocuments from './technician/TechnicianDocuments';
import PushSettings, { type PushState } from './PushSettings';
import { changePassword, deleteMyAccount, fetchDeletionPreview, fetchMyMembership, fetchMyTechnicianProfile, updateMyProfile, type DeletionJob, type DeletionPreview } from '../../lib/api';
import { Problem, Sheet } from '../../components/kit';
import Avatar from '../../components/Avatar';
import PhotoEditor from './PhotoEditor';
import './Profile.css';

interface Props {
  user: UserProfile;
  onUpdated: (user: UserProfile) => void;
  /** Shown on phones, where the sidebar with its sign-out button is hidden. */
  onLogout?: () => void;
  /** The account is gone: sign this device out and say so. */
  onDeleted?: (message: string) => void;
  onOpenMembership?: () => void;
}
const roleLabels: Record<UserRole, string> = { customer: 'ลูกค้า', technician: 'ช่างแอร์', manager: 'ผู้ดูแลอาคาร', admin: 'ผู้ดูแลระบบ' };
type Tab = 'service' | 'documents' | 'account';
const tabs: { key: Tab; label: string }[] = [
  { key: 'service', label: 'บริการและราคา' },
  { key: 'documents', label: 'เอกสาร' },
  { key: 'account', label: 'บัญชี' },
];
type Tone = 'ok' | 'wait' | 'bad' | 'idle';
const thaiDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/**
 * Profile. Technicians get a status list (verification, documents, membership, notifications) and three tabs:
 * service and price, documents, and account. Other roles see the account settings only.
 */
export default function ProfilePage({ user, onUpdated, onLogout, onDeleted, onOpenMembership }: Props) {
  const technician = user.role === 'technician';
  const [tab, setTab] = useState<Tab>(technician ? 'service' : 'account');
  const [profile, setProfile] = useState<TechnicianApplication | null>(null);
  const [profileError, setProfileError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [documents, setDocuments] = useState<TechnicianDocument[] | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [editingPhoto, setEditingPhoto] = useState(false);

  useEffect(() => {
    if (!technician) return;
    let alive = true;
    setProfileError('');
    fetchMyTechnicianProfile().then(value => { if (alive) setProfile(value); })
      .catch(reason => { if (alive) setProfileError(reason instanceof Error ? reason.message : 'โหลดข้อมูลบริการไม่สำเร็จ'); });
    return () => { alive = false; };
  }, [technician, attempt]);
  useEffect(() => { if (technician) fetchMyMembership().then(setMembership).catch(() => setMembership(null)); }, [technician]);
  // The bell's "เปิดการแจ้งเตือน" link sends people here, to the switch on the account tab.
  useEffect(() => {
    const show = () => { setTab('account'); window.requestAnimationFrame(() => document.getElementById('push-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
    window.addEventListener('airclean:show-push', show);
    return () => window.removeEventListener('airclean:show-push', show);
  }, []);

  function open(next: Tab, anchor?: string) {
    setTab(next);
    window.requestAnimationFrame(() => (anchor ? document.getElementById(anchor) : tabsRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const account = <AccountSettings user={user} onUpdated={onUpdated} onLogout={onLogout} onDeleted={onDeleted} onPush={setPush} onEditPhoto={() => setEditingPhoto(true)}/>;
  return <div className="pf">
    <header className="pf-hero">
      <button type="button" className="pf-avatar" onClick={() => setEditingPhoto(true)} aria-label={user.photoId ? 'เปลี่ยนรูปโปรไฟล์' : 'เพิ่มรูปโปรไฟล์'}>
        <Avatar name={user.fullName} photoId={user.photoId}/>
        <span className="pf-avatar-badge" aria-hidden="true"><Camera size={15}/></span>
      </button>
      <div className="pf-hero-text">
        <h1>{user.fullName}</h1>
        <p><span className="pf-role">{roleLabels[user.role]}</span><span className="pf-email">{user.email}</span></p>
      </div>
    </header>
    {editingPhoto && <PhotoEditor user={user} onClose={() => setEditingPhoto(false)} onSaved={updated => { onUpdated(updated); setEditingPhoto(false); }}/>}

    {!technician ? account : <>
      <StatusList profile={profile} documents={documents} membership={membership} push={push}
        onVerification={() => open('service')} onDocuments={() => open('documents')} onMembership={onOpenMembership} onPush={() => open('account', 'push-settings')}/>

      <div className="pf-tabs" role="tablist" aria-label="ส่วนของโปรไฟล์" ref={tabsRef}>
        {tabs.map(item => <button key={item.key} type="button" role="tab" id={`pf-tab-${item.key}`} aria-controls={`pf-panel-${item.key}`}
          aria-selected={tab === item.key} tabIndex={tab === item.key ? 0 : -1} className={tab === item.key ? 'on' : ''} onClick={() => setTab(item.key)}
          onKeyDown={event => {
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = tabs[(tabs.findIndex(t => t.key === tab) + step + tabs.length) % tabs.length].key;
            setTab(next); document.getElementById(`pf-tab-${next}`)?.focus();
          }}>{item.label}</button>)}
      </div>

      {/* Panels stay mounted so an unsaved edit survives a tab switch, and the status list keeps its data. */}
      <div role="tabpanel" id="pf-panel-service" aria-labelledby="pf-tab-service" hidden={tab !== 'service'}>
        {profile ? <ServiceProfileForm profile={profile} onSaved={setProfile}/>
          : profileError ? <div className="pf-card"><div className="pf-alert bad" role="alert"><XCircle size={17}/><span>{profileError}</span></div>
            <button type="button" className="pf-button" onClick={() => setAttempt(n => n + 1)}>ลองโหลดอีกครั้ง</button></div>
          : <p className="pf-loading" role="status"><Loader2 size={18} className="ui-spin"/> กำลังโหลด…</p>}
      </div>
      <div role="tabpanel" id="pf-panel-documents" aria-labelledby="pf-tab-documents" hidden={tab !== 'documents'}>
        <TechnicianDocuments onChange={setDocuments}/>
      </div>
      <div role="tabpanel" id="pf-panel-account" aria-labelledby="pf-tab-account" hidden={tab !== 'account'}>{account}</div>
    </>}
  </div>;
}

function StatusList({ profile, documents, membership, push, onVerification, onDocuments, onMembership, onPush }: {
  profile: TechnicianApplication | null; documents: TechnicianDocument[] | null; membership: Membership | null; push: PushState | null;
  onVerification: () => void; onDocuments: () => void; onMembership?: () => void; onPush: () => void;
}) {
  const status = profile?.verificationStatus;
  const idSent = documents?.some(item => item.kind === 'idcard');
  const member: [string, Tone] = !membership ? ['ดูรายละเอียด', 'idle']
    : membership.state === 'NotApproved' ? ['เริ่มนับหลังผ่านการตรวจสอบ', 'idle']
    : membership.state === 'Expired' ? [membership.pending ? 'หมดอายุ · สลิปรอตรวจ' : 'หมดอายุ · กดเพื่อต่ออายุ', 'bad']
    : membership.state === 'Trial' ? [`ทดลองใช้ฟรี เหลือ ${membership.daysLeft} วัน`, membership.daysLeft <= 7 ? 'wait' : 'ok']
    : membership.daysLeft <= 7 ? [`เหลือ ${membership.daysLeft} วัน · ต่ออายุได้แล้ว`, 'wait'] : [`ใช้ได้ถึง ${thaiDate(membership.memberUntil)}`, 'ok'];
  const rows: { key: string; icon: ReactNode; label: string; value: string; tone: Tone; onClick?: () => void }[] = [
    { key: 'verify', icon: <ShieldCheck size={19}/>, label: 'การตรวจสอบบัญชี', onClick: onVerification,
      value: !status ? 'กำลังโหลด…' : status === 'Approved' ? 'ผ่านแล้ว รับงานได้' : status === 'Rejected' ? 'ยังไม่ผ่าน · ดูเหตุผล' : 'รอผู้ดูแลตรวจสอบ',
      tone: !status ? 'idle' : status === 'Approved' ? 'ok' : status === 'Rejected' ? 'bad' : 'wait' },
    { key: 'documents', icon: <IdCard size={19}/>, label: 'เอกสารยืนยันตัวตน', onClick: onDocuments,
      value: documents === null ? 'กำลังโหลด…' : idSent ? `ส่งแล้ว ${documents.length} รูป` : 'ยังไม่ได้ส่งบัตรประชาชน',
      tone: documents === null ? 'idle' : idSent ? 'ok' : 'bad' },
    { key: 'membership', icon: <BadgeCheck size={19}/>, label: 'สมาชิก', onClick: onMembership, value: member[0], tone: member[1] },
    { key: 'push', icon: <BellRing size={19}/>, label: 'แจ้งเตือนบนเครื่องนี้', onClick: onPush,
      value: push === null ? 'กำลังตรวจสอบ…' : push === 'on' ? 'เปิดอยู่' : push === 'off' ? 'ยังไม่เปิด · กดเพื่อเปิด' : 'เครื่องนี้ยังใช้ไม่ได้',
      tone: push === 'on' ? 'ok' : push === 'off' ? 'wait' : 'idle' },
  ];
  return <section className="pf-status" aria-label="สถานะบัญชีช่าง">
    <ul>{rows.map(row => <li key={row.key}>
      <button type="button" className={'pf-status-row ' + row.tone} onClick={row.onClick} disabled={!row.onClick}>
        <span className="pf-status-icon" aria-hidden="true">{row.icon}</span>
        <span className="pf-status-text"><span>{row.label}</span><strong>{row.value}</strong></span>
        <ChevronRight size={18} className="pf-status-go" aria-hidden="true"/>
      </button>
    </li>)}</ul>
  </section>;
}

function AccountSettings({ user, onUpdated, onLogout, onDeleted, onPush, onEditPhoto }: { user: UserProfile; onUpdated: (user: UserProfile) => void; onLogout?: () => void; onDeleted?: (message: string) => void; onPush: (state: PushState) => void; onEditPhoto: () => void }) {
  return <div className="pf-stack">
    <PersonalInfo user={user} onUpdated={onUpdated} onEditPhoto={onEditPhoto}/>
    <PushSettings onChange={onPush}/>
    <PasswordSettings user={user} onChanged={onUpdated}/>
    {onLogout && <button type="button" className="pf-logout" onClick={onLogout}><LogOut size={17}/>ออกจากระบบ</button>}
    {onDeleted && user.role !== 'admin' && <DeleteAccount user={user} onDeleted={onDeleted}/>}
  </div>;
}

function PersonalInfo({ user, onUpdated, onEditPhoto }: { user: UserProfile; onUpdated: (user: UserProfile) => void; onEditPhoto: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setFullName(user.fullName); setEmail(user.email); }, [user.fullName, user.email]);
  const changed = fullName.trim() !== user.fullName || email.trim() !== user.email;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSaved(false); setSaving(true);
    try { onUpdated(await updateMyProfile({ fullName, email })); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSaving(false); }
  }
  const providers = (user.providers ?? []).map(item => item === 'apple' ? 'Apple' : 'Google');
  return <form className="pf-card" onSubmit={submit} aria-labelledby="pf-me-title">
    <header className="pf-card-head"><h2 id="pf-me-title">ข้อมูลส่วนตัว</h2><p>{user.role === 'technician' ? 'ลูกค้าเห็นชื่อนี้ในข้อเสนอและงานของคุณ' : user.role === 'admin' ? 'ชื่อและอีเมลของบัญชีผู้ดูแลระบบ' : 'ช่างเห็นชื่อนี้ในงานที่คุณขอ'}</p></header>
    <div className="pf-photo-row">
      <span className="pf-photo-thumb" aria-hidden="true"><Avatar name={user.fullName} photoId={user.photoId}/></span>
      <div className="pf-row-text"><strong>รูปโปรไฟล์</strong><span>{user.photoId ? 'แตะ “เปลี่ยน” เพื่อเลือกรูปใหม่หรือลบรูป' : 'ยังไม่มีรูป ตอนนี้แสดงเป็นตัวอักษรย่อของชื่อ'}</span></div>
      <button type="button" className="pf-button ghost" onClick={onEditPhoto}>{user.photoId ? 'เปลี่ยน' : 'เพิ่มรูป'}</button>
    </div>
    <div className="pf-field"><label htmlFor="pf-name">ชื่อที่ใช้ติดต่อ</label>
      <input id="pf-name" autoComplete="name" value={fullName} onChange={event => { setFullName(event.target.value); setSaved(false); }} minLength={2} maxLength={120} required/></div>
    <div className="pf-field"><label htmlFor="pf-email">อีเมล</label>
      <input id="pf-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setSaved(false); }} maxLength={254} required/>
      {providers.length > 0 && <small>เข้าสู่ระบบด้วยปุ่ม {providers.join(' หรือ ')} ได้ด้วย</small>}</div>
    {error && <div className="pf-alert bad" role="alert"><XCircle size={17}/><span>{error}</span></div>}
    {saved && <div className="pf-alert ok" role="status"><CheckCircle2 size={17}/><span>บันทึกข้อมูลส่วนตัวแล้ว</span></div>}
    <div className="pf-actions">
      <button className="pf-button" type="submit" disabled={saving || !changed || fullName.trim().length < 2 || !email.trim()}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      <span className="pf-fine">บทบาทบัญชี ({roleLabels[user.role]}) เลือกได้ตอนสมัครเท่านั้น ถ้าต้องเปลี่ยนให้ติดต่อผู้ดูแลระบบ</span>
    </div>
  </form>;
}

/** Accounts created with Google or Apple have no password yet; they can set one without a current password. */
function PasswordSettings({ user, onChanged }: { user: UserProfile; onChanged: (user: UserProfile) => void }) {
  const hasPassword = user.hasPassword !== false;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // The "เปลี่ยน" button is replaced by the form while it is open; focus goes back to it when the form closes.
  const toggle = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => { if (wasOpen.current && !open) toggle.current?.focus(); wasOpen.current = open; }, [open]);
  function close() { setOpen(false); setCurrent(''); setNext(''); setConfirm(''); setError(''); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (next.length < 8) { setError('รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร'); return; }
    if (next !== confirm) { setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); return; }
    setSaving(true);
    try { const updated = await changePassword(hasPassword ? current : '', next); close(); setDone(true); onChanged(updated); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  const type = visible ? 'text' : 'password';
  return <section className="pf-card" aria-labelledby="pf-password-title">
    <div className="pf-row">
      <span className="pf-row-icon" aria-hidden="true"><KeyRound size={19}/></span>
      <div className="pf-row-text">
        <strong id="pf-password-title">รหัสผ่าน</strong>
        <span>{hasPassword ? 'เปลี่ยนแล้ว เครื่องอื่นที่เข้าสู่ระบบไว้จะต้องเข้าใหม่' : 'บัญชีนี้ยังไม่มีรหัสผ่าน ตั้งไว้เพื่อเข้าสู่ระบบด้วยอีเมลได้ด้วย'}</span>
      </div>
      {!open && <button ref={toggle} type="button" className="pf-button ghost" aria-expanded={false} aria-controls="pf-password-form" onClick={() => { setOpen(true); setDone(false); }}>{hasPassword ? 'เปลี่ยน' : 'ตั้งรหัสผ่าน'}</button>}
    </div>
    {done && <div className="pf-alert ok" role="status"><CheckCircle2 size={17}/><span>บันทึกรหัสผ่านแล้ว</span></div>}
    {open && <form className="pf-password" id="pf-password-form" onSubmit={submit}>
      {hasPassword && <div className="pf-field"><label htmlFor="pf-pw-current">รหัสผ่านปัจจุบัน</label>
        <input id="pf-pw-current" type={type} autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} maxLength={128} required autoFocus/></div>}
      <div className="pf-field"><label htmlFor="pf-pw-next">รหัสผ่านใหม่</label>
        <div className="pf-affix"><input id="pf-pw-next" type={type} autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)} minLength={8} maxLength={128} placeholder="อย่างน้อย 8 ตัวอักษร" required autoFocus={!hasPassword}/>
          <button type="button" className="pf-eye" onClick={() => setVisible(v => !v)} aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
      <div className="pf-field"><label htmlFor="pf-pw-confirm">พิมพ์รหัสผ่านใหม่อีกครั้ง</label>
        <input id="pf-pw-confirm" type={type} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={8} maxLength={128} required/></div>
      {error && <div className="pf-alert bad" role="alert"><XCircle size={17}/><span>{error}</span></div>}
      <div className="pf-actions">
        <button className="pf-button" type="submit" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่าน'}</button>
        <button className="pf-button ghost" type="button" onClick={close} disabled={saving}>ยกเลิก</button>
      </div>
    </form>}
  </section>;
}

const CONFIRM_WORD = 'ลบบัญชี';
const jobDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

function JobList({ jobs }: { jobs: DeletionJob[] }) {
  return <ul className="pf-del-jobs">{jobs.map(job => <li key={job.id}>
    <strong>{job.service}</strong><span>{job.code} · {jobDate(job.scheduledAt)} · {job.status}</span>
  </li>)}</ul>;
}

/**
 * The last thing on the account tab. The sheet first asks the server what deleting would do: jobs under way hold it
 * back; jobs not started yet are listed as the ones it cancels. The password (or, for Google-only accounts, the word
 * typed out) confirms it.
 */
function DeleteAccount({ user, onDeleted }: { user: UserProfile; onDeleted: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DeletionPreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const technician = user.role === 'technician';

  function start() {
    setOpen(true); setPlan(null); setLoadError(''); setPassword(''); setWord(''); setError('');
    fetchDeletionPreview().then(setPlan).catch(reason => setLoadError(reason instanceof Error ? reason.message : 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่'));
  }
  function close() { if (!busy) setOpen(false); }
  const ready = plan?.allowed && (plan.needsPassword ? password.length > 0 : word.trim() === CONFIRM_WORD);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try { onDeleted(await deleteMyAccount(plan?.needsPassword ? password : '', word.trim())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ลบบัญชีไม่สำเร็จ กรุณาลองใหม่'); setBusy(false); }
  }

  const gone = [
    'ชื่อ อีเมล เบอร์โทร และรูปโปรไฟล์',
    technician ? 'รูปบัตรประชาชนและเอกสารที่แนบไว้' : 'ที่อยู่ที่บันทึกไว้และรายการแอร์ของคุณ',
    technician ? 'โปรไฟล์ช่าง ราคา และวันสมาชิกที่เหลือ ลูกค้าจะไม่เห็นคุณอีก' : null,
    'การแจ้งเตือนทั้งหมด และการเข้าสู่ระบบด้วยรหัสผ่านหรือ Google',
  ].filter(Boolean) as string[];
  const type = visible ? 'text' : 'password';

  return <section className="pf-card pf-delete" aria-labelledby="pf-delete-title">
    <div className="pf-row">
      <span className="pf-row-icon is-problem" aria-hidden="true"><Trash2 size={19}/></span>
      <div className="pf-row-text">
        <strong id="pf-delete-title">ลบบัญชี</strong>
        <span>ลบชื่อ อีเมล และข้อมูลติดต่อของคุณออกจาก AirClean ลบแล้วกู้คืนไม่ได้</span>
      </div>
      <button type="button" className="pf-button ghost danger" onClick={start}>ลบบัญชี</button>
    </div>
    {open && <Sheet title="ลบบัญชี AirClean" sub={user.email} onClose={close}
      footer={plan?.allowed ? <>
        <button type="submit" form="pf-delete-form" className="ui-btn is-destroy is-lg is-block" disabled={!ready || busy}>
          {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true"/>กำลังลบบัญชี…</> : 'ลบบัญชีถาวร'}</button>
        <button type="button" className="ui-btn is-ghost is-block" onClick={close} disabled={busy}>ไม่ลบ กลับไปก่อน</button>
      </> : <button type="button" className="ui-btn is-ghost is-block" onClick={close}>ปิด</button>}>
      {!plan && !loadError && <p className="pf-del-wait" role="status"><Loader2 size={18} className="animate-spin" aria-hidden="true"/>กำลังตรวจงานที่ค้างอยู่…</p>}
      {loadError && <Problem>{loadError}</Problem>}
      {plan && !plan.allowed && <>
        <div className="ui-alert is-problem" role="alert"><XCircle size={18} aria-hidden="true"/><span><strong>ยังลบบัญชีไม่ได้</strong>{plan.reason}</span></div>
        {plan.blocking.length > 0 && <div className="pf-del-group"><h3>งานที่ต้องปิดก่อน</h3><JobList jobs={plan.blocking}/></div>}
      </>}
      {plan?.allowed && <form id="pf-delete-form" className="pf-del-form" onSubmit={submit}>
        <div className="pf-del-group is-gone"><h3>สิ่งที่จะถูกลบ</h3>
          <ul>{gone.map(item => <li key={item}>{item}</li>)}</ul></div>
        {plan.willCancel.length > 0 && <div className="pf-del-group is-cancel"><h3>งานที่จะถูกยกเลิก ({plan.willCancel.length})</h3>
          <JobList jobs={plan.willCancel}/>
          {plan.willCancel.some(job => job.booked) && <p>{technician ? 'ลูกค้าของงานเหล่านี้จะได้รับแจ้งว่าช่างยกเลิก' : 'ช่างที่นัดไว้จะได้รับแจ้งว่าคุณยกเลิก'}</p>}</div>}
        {plan.offersWithdrawn > 0 && <p className="pf-del-note">ข้อเสนอราคา {plan.offersWithdrawn} งานที่ยังรอลูกค้าเลือกจะถูกถอนออก</p>}
        <div className="pf-del-group"><h3>สิ่งที่เก็บไว้</h3>
          <p>ประวัติงาน รายงาน รีวิว ใบเสร็จที่ออกแล้ว และการชำระเงิน เก็บไว้เพื่อแก้ข้อโต้แย้งและตามที่กฎหมายกำหนด โดยแสดงชื่อเป็น “บัญชีที่ลบแล้ว” และไม่มีเบอร์โทร รูป หรือพิกัดของคุณ <a className="ui-link" href="/privacy.html#s4" target="_blank" rel="noreferrer">อ่านนโยบาย</a></p></div>
        {plan.needsPassword
          ? <div className="pf-field"><label htmlFor="pf-del-password">ใส่รหัสผ่านเพื่อยืนยัน</label>
              <div className="pf-affix"><input id="pf-del-password" type={type} autoComplete="current-password" value={password}
                onChange={event => { setPassword(event.target.value); setError(''); }} maxLength={128} aria-invalid={error ? true : undefined} aria-describedby={error ? 'pf-del-error' : undefined}/>
                <button type="button" className="pf-eye" onClick={() => setVisible(v => !v)} aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
              <small>ลืมรหัสผ่าน? ออกจากระบบแล้วใช้ “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ</small></div>
          : <div className="pf-field"><label htmlFor="pf-del-word">พิมพ์คำว่า <q>{CONFIRM_WORD}</q> เพื่อยืนยัน</label>
              <input id="pf-del-word" value={word} onChange={event => { setWord(event.target.value); setError(''); }} maxLength={32}
                autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={CONFIRM_WORD} aria-invalid={error ? true : undefined} aria-describedby={error ? 'pf-del-error' : undefined}/></div>}
        {error && <Problem id="pf-del-error">{error}</Problem>}
      </form>}
    </Sheet>}
  </section>;
}
