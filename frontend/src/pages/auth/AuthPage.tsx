import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Home, Info, Loader2, LockKeyhole, Wrench } from 'lucide-react';
import BrandMark from '../../components/BrandMark';
import { Problem } from '../../components/kit';
import type { UserProfile } from '../../types';
import { ApiError, externalLogin, forgotPassword, isApiConfigured, login, register, resetPassword, setKeepSignedIn } from '../../lib/api';
import { googleEnabled, renderGoogleButton, type SocialProvider } from '../../lib/socialAuth';
import { numberText } from '../../lib/numberText';
import cleaningPhoto from '../../assets/air-cleaning.webp';
import './Auth.css';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
/** A Google sign-in that found no AirClean account yet; the person picks a role to finish. */
interface PendingSocial { provider: SocialProvider; idToken: string; email?: string; }
const providerLabel: Record<SocialProvider, string> = { google: 'Google' };
type SignupRole = 'customer' | 'technician' | 'manager';
const roleOptions: { key: SignupRole; title: string; text: string; icon: typeof Home }[] = [
  { key: 'customer', title: 'ลูกค้า', text: 'ล้างแอร์ที่บ้านหรือคอนโด', icon: Home },
  { key: 'technician', title: 'ช่างแอร์', text: 'รับงานล้างแอร์ใกล้ตัว', icon: Wrench },
  { key: 'manager', title: 'เจ้าของ / ผู้ดูแลอาคาร', text: 'ล้างแอร์ทั้งอาคาร หลายห้องพร้อมกัน', icon: Building2 },
];
/**
 * How AirClean works, on the blue side of wide screens. They describe the service as built; they are not reviews.
 * Technicians signing up read what matters to them instead.
 */
const facts: Record<'customer' | 'technician', { title: ReactNode; headline: string; items: [string, string][] }> = {
  customer: {
    title: <>ช่างล้างแอร์ใกล้บ้าน<br/>เสนอราคาให้คุณเลือก</>,
    headline: 'ส่งคำขอครั้งเดียว เทียบราคาแล้วเลือกช่างเอง',
    items: [
      ['ช่างผ่านการตรวจสอบ', 'ผู้ดูแลระบบตรวจข้อมูลช่างทุกคน ก่อนเปิดให้เห็นงานและเสนอราคา'],
      ['ราคาตกลงแล้วไม่เปลี่ยนเอง', 'ถ้าหน้างานต้องปรับ ช่างขอในแอป และคุณกดอนุมัติก่อนทุกครั้ง'],
      ['จ่ายเมื่อล้างเสร็จ', 'จ่ายช่างโดยตรง ไม่ต้องจ่ายล่วงหน้า พร้อมใบเสร็จและประวัติทุกเครื่อง'],
    ],
  },
  technician: {
    title: <>รับงานล้างแอร์ใกล้ตัว<br/>ในราคาของคุณเอง</>,
    headline: 'สมัครครั้งเดียว ผู้ดูแลตรวจแล้วเริ่มเสนองานได้',
    items: [
      ['ตั้งราคาเอง เห็นค่าจ้างก่อนเสนอ', 'เลือกแอร์ที่รับล้างและตั้งราคาต่อเครื่อง ระบบคิดราคาแต่ละงานจากราคาของคุณ'],
      ['ลูกค้าเลือกแล้วงานจึงเป็นของคุณ', 'ไม่ต้องแย่งกันรับ ลูกค้าเทียบข้อเสนอแล้วเลือกเอง'],
      ['รับเงินจากลูกค้าโดยตรง', 'AirClean ไม่หักค่าคอมจากงาน ใช้ฟรีช่วงทดลองหลังอนุมัติ จากนั้นจ่ายค่าสมาชิกรายเดือน'],
    ],
  },
};
interface Props { onAuthenticated: (user: UserProfile) => void; initialError?: string; initialMode?: 'login' | 'register'; initialRole?: SignupRole; onBack?: () => void; resetToken?: string; onResetFinished?: (message?: string) => void; initialInfo?: string; }
const headings: Record<Mode, [string, string]> = {
  login: ['ยินดีต้อนรับกลับมา', 'เข้าสู่ระบบเพื่อดูงานและติดตามช่างของคุณ'],
  register: ['สร้างบัญชี', 'เลือกบทบาท แล้วกรอกข้อมูลไม่กี่ช่อง'],
  forgot: ['ลืมรหัสผ่าน', 'กรอกอีเมลของบัญชี เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้'],
  reset: ['ตั้งรหัสผ่านใหม่', 'ตั้งรหัสผ่านใหม่ แล้วเข้าสู่ระบบอีกครั้ง อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้จะถูกออกจากระบบ'],
};
/** A check that failed before sending, shown under the field it is about. */
type FieldProblem = { at: 'confirm' | 'experience'; text: string } | null;

/** A password field with a show/hide button. */
function PasswordField({ id, label, value, onChange, autoComplete, placeholder, invalid, describedBy }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; placeholder: string; invalid?: boolean; describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="ui-field">
    <label htmlFor={id}>{label}</label>
    <div className="au-pass">
      <input id={id} className="ui-input" type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)}
        placeholder={placeholder} minLength={8} maxLength={128} required aria-invalid={invalid || undefined} aria-describedby={describedBy}/>
      <button type="button" className="au-pass-toggle" onClick={() => setVisible(shown => !shown)} aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible} aria-controls={id}>
        {visible ? <EyeOff size={20}/> : <Eye size={20}/>}
      </button>
    </div>
  </div>;
}

export default function AuthPage({ onAuthenticated, initialError = '', initialMode = 'login', initialRole = 'customer', onBack, resetToken, onResetFinished, initialInfo = '' }: Props) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : initialMode);
  const [info, setInfo] = useState(initialInfo);
  const [phone, setPhone] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<SignupRole>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [problem, setProblem] = useState<FieldProblem>(null);
  const [social, setSocial] = useState<PendingSocial | null>(null);
  const configured = isApiConfigured();

  // A problem found before sending moves focus to its field, so it is read out and fixed in place.
  useEffect(() => { if (problem) document.getElementById(problem.at === 'confirm' ? 'au-confirm' : 'au-years')?.focus(); }, [problem]);

  async function socialSignIn(provider: SocialProvider, idToken: string, nameFromProvider?: string) {
    setError(''); setInfo(''); setLoading(true);
    setKeepSignedIn(mode === 'login' ? remember : true);
    try { onAuthenticated(await externalLogin(provider, idToken)); }
    catch (reason) {
      if (reason instanceof ApiError && reason.code === 'signup_required') {
        const email = typeof reason.data?.email === 'string' ? reason.data.email : undefined;
        const suggested = nameFromProvider || (typeof reason.data?.fullName === 'string' ? reason.data.fullName : '');
        setSocial({ provider, idToken, email }); setMode('register');
        if (suggested) setFullName(suggested);
        setInfo(`ยังไม่มีบัญชี AirClean สำหรับ ${email ?? providerLabel[provider]} เลือกบทบาทแล้วกด “สร้างบัญชีด้วย ${providerLabel[provider]}”`);
      } else setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally { setLoading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setProblem(null);
    if (!configured) { setError('ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ API จึงไม่สามารถเข้าสู่ระบบหรือบันทึกข้อมูลได้'); return; }
    if (mode === 'register' && role === 'technician' && Number(experienceYears || 0) > 60) { setProblem({ at: 'experience', text: 'ประสบการณ์ไม่เกิน 60 ปี' }); return; }
    if ((mode === 'reset' || (mode === 'register' && !social)) && password !== confirmPassword) { setProblem({ at: 'confirm', text: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน พิมพ์ช่องนี้ใหม่ให้เหมือนช่องบน' }); return; }
    setLoading(true); setInfo('');
    setKeepSignedIn(mode === 'login' ? remember : true);
    try {
      if (mode === 'forgot') { setInfo(await forgotPassword(email)); return; }
      if (mode === 'reset') {
        const message = await resetPassword(resetToken ?? '', password);
        setPassword(''); setConfirmPassword(''); onResetFinished?.(message); return;
      }
      if (mode === 'register' && social) {
        try { onAuthenticated(await externalLogin(social.provider, social.idToken, { role, fullName, phone, serviceArea, experienceYears: Number(experienceYears || 0) })); }
        catch (reason) {
          // The provider's token is short-lived; an expired one means signing in with the provider again.
          if (reason instanceof ApiError && reason.status === 401) { setSocial(null); setInfo(''); }
          throw reason;
        }
        return;
      }
      const user = mode === 'login' ? await login(email, password) : await register(fullName, email, password, role, { phone, serviceArea, experienceYears: Number(experienceYears || 0) });
      onAuthenticated(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  }
  function switchMode(next: Mode) { setMode(next); setError(''); setInfo(''); setProblem(null); setSocial(null); }

  const needsEmail = mode !== 'reset' && !(mode === 'register' && social);
  const needsPassword = mode !== 'forgot' && !(mode === 'register' && social);
  const needsConfirm = (mode === 'register' && !social) || mode === 'reset';
  const showTabs = (mode === 'login' || mode === 'register') && !social;
  const showSocial = (mode === 'login' || mode === 'register') && !social && configured && googleEnabled;
  const submitLabel = mode === 'login' ? 'เข้าสู่ระบบ' : mode === 'register' ? (social ? `สร้างบัญชีด้วย ${providerLabel[social.provider]}` : 'สร้างบัญชี') : mode === 'forgot' ? 'ส่งลิงก์ตั้งรหัสผ่าน' : 'บันทึกรหัสผ่านใหม่';
  const side = facts[mode === 'register' && role === 'technician' ? 'technician' : 'customer'];
  const brand = <span className="au-brand"><span className="au-brand-mark"><BrandMark className="w-[82%] h-auto"/></span>AirClean</span>;
  const tab = (key: 'login' | 'register', label: string) =>
    <button type="button" role="tab" id={`au-tab-${key}`} aria-selected={mode === key} aria-controls="au-form" tabIndex={mode === key ? 0 : -1} onClick={() => mode !== key && switchMode(key)}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const other = key === 'login' ? 'register' : 'login'; switchMode(other); document.getElementById(`au-tab-${other}`)?.focus(); } }}>{label}</button>;

  return <div className="au" data-mode={mode}>
    <aside className="au-side" aria-label="AirClean ทำงานอย่างไร">
      {brand}
      <div className="au-side-body">
        <h2>{side.title}</h2>
        <p>{side.headline}</p>
        <ol className="au-facts">
          {side.items.map(([title, text], index) => <li key={title}>
            <span className="au-fact-num ui-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span><strong>{title}</strong>{text}</span>
          </li>)}
        </ol>
      </div>
      <img className="au-side-photo" src={cleaningPhoto} alt="" aria-hidden="true"/>
    </aside>

    <main className="au-main">
      <header className="au-band">
        <div className="au-band-top">
          {brand}
          {onBack && <button type="button" className="au-back" onClick={onBack}><ArrowLeft size={18}/>กลับหน้าหลัก</button>}
        </div>
        <h1>{headings[mode][0]}</h1>
        <p>{headings[mode][1]}</p>
      </header>

      <div className="au-card">
        {showTabs && <div className="ui-tabs au-tabs" role="tablist" aria-label="เข้าสู่ระบบหรือสมัครสมาชิก">
          {tab('login', 'เข้าสู่ระบบ')}{tab('register', 'สมัครสมาชิก')}
        </div>}

        <form id="au-form" className="au-form" onSubmit={submit} noValidate={false} {...(showTabs ? { role: 'tabpanel', 'aria-labelledby': `au-tab-${mode}` } : {})}>
          {mode === 'register' && social && <div className="au-social-note">
            <span>สมัครด้วยบัญชี {providerLabel[social.provider]}</span>
            <strong>{social.email}</strong>
            <button type="button" className="ui-link" onClick={() => { setSocial(null); setInfo(''); }}>ใช้อีเมลและรหัสผ่านแทน</button>
          </div>}

          {mode === 'register' && <>
            <fieldset className="au-roles">
              <legend>สมัครใช้งานเป็น</legend>
              {roleOptions.map(option => { const Icon = option.icon; return <label key={option.key} className="ui-option au-role">
                <input type="radio" name="signup-role" value={option.key} checked={role === option.key} onChange={() => setRole(option.key)}/>
                <span className="ui-option-text"><strong>{option.title}</strong><small>{option.text}</small></span>
                <span className="au-role-icon" aria-hidden="true"><Icon size={22}/></span>
              </label>; })}
              <small>เลือกได้ตอนสมัครเท่านั้น หลังสร้างบัญชีแล้วเปลี่ยนเองไม่ได้</small>
            </fieldset>
            <Field id="au-name" label="ชื่อที่ใช้ติดต่อ">
              <input id="au-name" className="ui-input" autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="ชื่อและนามสกุล" minLength={2} maxLength={120} required/>
            </Field>
            {role === 'technician' && <div className="au-group">
              <div className="au-pair">
                <Field id="au-phone" label="เบอร์โทรศัพท์">
                  <input id="au-phone" className="ui-input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="เช่น 081-234-5678" maxLength={30} required/>
                </Field>
                <Field id="au-years" label="ประสบการณ์ (ปี)">
                  <input id="au-years" className="ui-input" inputMode="numeric" autoComplete="off" value={experienceYears} placeholder="0" onChange={event => setExperienceYears(numberText(event.target.value, { maxLength: 2 }))}
                    aria-invalid={problem?.at === 'experience' || undefined} aria-describedby={problem?.at === 'experience' ? 'au-problem' : undefined}/>
                </Field>
              </div>
              {problem?.at === 'experience' && <Problem id="au-problem">{problem.text}</Problem>}
              <Field id="au-area" label="พื้นที่ให้บริการ">
                <input id="au-area" className="ui-input" value={serviceArea} onChange={event => setServiceArea(event.target.value)} placeholder="เช่น ลาดพร้าว · จตุจักร" minLength={2} maxLength={200} required/>
              </Field>
              <p className="ui-alert is-info"><Info size={18}/><span>ขั้นถัดไป: เลือกงานที่รับ ตั้งราคาของคุณเอง และส่งรูปบัตรประชาชน ผู้ดูแลจะตรวจและอาจโทรยืนยัน เมื่ออนุมัติแล้วคุณจึงเห็นงานใกล้ตัว</span></p>
            </div>}
            {role === 'manager' && <p className="ui-alert is-info"><Info size={18}/><span>ใช้งานได้ทันที เพิ่มอาคารของคุณ แล้วขอช่างล้างแอร์ได้ครั้งละหลายสิบเครื่อง</span></p>}
          </>}

          {needsEmail && <Field id="au-email" label="อีเมล">
            <input id="au-email" className="ui-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" maxLength={254} required/>
          </Field>}
          {needsPassword && <PasswordField id="au-password" label={mode === 'reset' ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'} value={password} onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'กรอกรหัสผ่าน' : 'อย่างน้อย 8 ตัวอักษร'}/>}
          {needsConfirm && <div className="au-group">
            <PasswordField id="au-confirm" label="ยืนยันรหัสผ่าน" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="กรอกรหัสผ่านอีกครั้ง"
              invalid={problem?.at === 'confirm'} describedBy={problem?.at === 'confirm' ? 'au-problem' : undefined}/>
            {problem?.at === 'confirm' && <Problem id="au-problem">{problem.text}</Problem>}
          </div>}

          {mode === 'login' && <div className="au-row">
            <label className="ui-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/><span>จดจำการเข้าสู่ระบบ</span></label>
            <button type="button" className="ui-link" onClick={() => switchMode('forgot')}>ลืมรหัสผ่าน?</button>
          </div>}

          {error && <div className="ui-alert is-problem" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
          {info && <div className="ui-alert is-done" role="status"><CheckCircle2 size={18}/><span>{info}</span></div>}
          {!configured && <div className="ui-alert is-wait">ยังไม่ได้เชื่อมต่อระบบข้อมูล ผู้ใช้จะยังสมัครหรือเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า API</div>}

          <button type="submit" className="ui-btn is-primary is-lg is-block" disabled={loading || !configured} aria-busy={loading}>
            {loading ? <><Loader2 size={20} className="ui-spin" aria-hidden="true"/>กำลังตรวจสอบ…</> : <>{submitLabel}<ArrowRight size={20}/></>}
          </button>

          {(mode === 'forgot' || mode === 'reset') && <button type="button" className="ui-btn is-ghost is-block" onClick={() => { if (mode === 'reset') onResetFinished?.(); switchMode('login'); }}><ArrowLeft size={18}/>กลับไปเข้าสู่ระบบ</button>}
          {mode === 'forgot' && <p className="au-hint">ไม่ได้รับอีเมล? ตรวจโฟลเดอร์สแปม หรือติดต่อผู้ดูแลระบบให้สร้างลิงก์ตั้งรหัสผ่านใหม่ให้</p>}
          {mode === 'register' && <p className="au-hint">บัญชีผู้ดูแลระบบ (Admin) สร้างผ่านหลังบ้านเท่านั้น</p>}
        </form>

        {showSocial && <SocialButtons mode={mode as 'login' | 'register'} disabled={loading} onToken={socialSignIn} onError={message => { setInfo(''); setError(message); }}/>}
      </div>

      <footer className="au-foot">
        <p><LockKeyhole size={15} aria-hidden="true"/>ข้อมูลบัญชีตรวจกับระบบจริง ไม่มีบัญชีตัวอย่างให้เลือก</p>
        <p><a className="ui-link" href="/privacy.html">นโยบายความเป็นส่วนตัว</a><a className="ui-link" href="/terms.html">ข้อกำหนดการใช้งาน</a><span>© 2026 AirClean</span></p>
      </footer>
    </main>
  </div>;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="ui-field"><label htmlFor={id}>{label}</label>{children}</div>;
}

/** Google's own rendered button (Google's branding rules ask for theirs, not a look-alike). */
function SocialButtons({ mode, disabled, onToken, onError }: { mode: 'login' | 'register'; disabled: boolean; onToken: (provider: SocialProvider, idToken: string, name?: string) => void; onError: (message: string) => void }) {
  const googleSlot = useRef<HTMLDivElement>(null);
  const tokenHandler = useRef(onToken);
  tokenHandler.current = onToken;
  useEffect(() => {
    if (!googleEnabled || !googleSlot.current) return;
    renderGoogleButton(googleSlot.current, token => tokenHandler.current('google', token), mode === 'register' ? 'signup_with' : 'signin_with')
      .catch(reason => onError(reason instanceof Error ? reason.message : 'โหลดปุ่ม Google ไม่สำเร็จ'));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="au-social" aria-busy={disabled}>
    <div className="au-or" role="separator">หรือ</div>
    <div className="au-google" ref={googleSlot}/>
  </div>;
}
