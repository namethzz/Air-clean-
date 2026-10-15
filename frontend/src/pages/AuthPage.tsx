import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, MapPin, Phone, UserRound, Wind } from 'lucide-react';
import type { UserProfile } from '../types';
import { ApiError, externalLogin, forgotPassword, isApiConfigured, login, register, resetPassword } from '../lib/api';
import { appleEnabled, googleEnabled, renderGoogleButton, signInWithApple, type SocialProvider } from '../lib/socialAuth';
import { AirCleaningPhoto } from '../components/ui/hero-financial-utils/assets-index';

type Mode='login'|'register'|'forgot'|'reset';
/** A Google/Apple sign-in that found no AirClean account yet; the person picks a role to finish. */
interface PendingSocial { provider:SocialProvider; idToken:string; email?:string; }
const providerLabel:Record<SocialProvider,string>={google:'Google',apple:'Apple'};
interface Props { onAuthenticated:(user:UserProfile)=>void; initialError?:string; initialMode?:'login'|'register'; initialRole?:'customer'|'technician'|'manager'; onBack?:()=>void; resetToken?:string; onResetFinished?:(message?:string)=>void; initialInfo?:string; }
const headings:Record<Mode,[string,string]>={
  login:['เข้าสู่ระบบ','เข้าสู่ระบบเพื่อดูการจองและติดตามบริการของคุณ'],
  register:['สร้างบัญชี','สมัครบัญชีเพื่อเริ่มจองบริการและเก็บประวัติงาน'],
  forgot:['ลืมรหัสผ่าน','กรอกอีเมลของบัญชี เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้'],
  reset:['ตั้งรหัสผ่านใหม่','ตั้งรหัสผ่านใหม่ แล้วเข้าสู่ระบบอีกครั้ง อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้จะถูกออกจากระบบ'],
};
export default function AuthPage({onAuthenticated,initialError='',initialMode='login',initialRole='customer',onBack,resetToken,onResetFinished,initialInfo=''}:Props) {
  const [mode,setMode] = useState<Mode>(resetToken?'reset':initialMode);
  const [info,setInfo] = useState(initialInfo);
  const [phone,setPhone] = useState('');
  const [serviceArea,setServiceArea] = useState('');
  const [experienceYears,setExperienceYears] = useState(0);
  const [fullName,setFullName] = useState('');
  const [role,setRole] = useState<'customer'|'technician'|'manager'>(initialRole);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [showPassword,setShowPassword] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState(initialError);
  const [social,setSocial] = useState<PendingSocial|null>(null);
  const configured = isApiConfigured();
  async function socialSignIn(provider:SocialProvider, idToken:string, nameFromProvider?:string) {
    setError(''); setInfo(''); setLoading(true);
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
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!configured) { setError('ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ API จึงไม่สามารถเข้าสู่ระบบหรือบันทึกข้อมูลได้'); return; }
    if ((mode === 'reset' || (mode === 'register' && !social)) && password !== confirmPassword) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setLoading(true); setInfo('');
    try {
      if (mode === 'forgot') { setInfo(await forgotPassword(email)); return; }
      if (mode === 'reset') {
        const message = await resetPassword(resetToken ?? '', password);
        setPassword(''); setConfirmPassword(''); onResetFinished?.(message); return;
      }
      if (mode === 'register' && social) {
        try { onAuthenticated(await externalLogin(social.provider, social.idToken, { role, fullName, phone, serviceArea, experienceYears })); }
        catch (reason) {
          // The provider's token is short-lived; an expired one means signing in with the provider again.
          if (reason instanceof ApiError && reason.status === 401) { setSocial(null); setInfo(''); }
          throw reason;
        }
        return;
      }
      const user = mode === 'login' ? await login(email,password) : await register(fullName,email,password,role,{ phone, serviceArea, experienceYears });
      onAuthenticated(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  }
  function switchMode(next:Mode){ setMode(next); setError(''); setInfo(''); setSocial(null); }
  const needsEmail = mode !== 'reset' && !(mode === 'register' && social);
  const needsPassword = mode !== 'forgot' && !(mode === 'register' && social);
  const needsConfirm = (mode === 'register' && !social) || mode === 'reset';
  const showSocial = (mode === 'login' || mode === 'register') && !social && configured && (googleEnabled || appleEnabled);
  return <main className="auth-screen">
    <section className="auth-visual" aria-label="AirClean">
      <img className="auth-photo" src={AirCleaningPhoto.src} alt="" aria-hidden="true"/>
      <div className="auth-brand"><span className="auth-brand-icon"><Wind size={24}/></span><span>AirClean</span></div>
      <div className="auth-visual-copy">
        <h1>ทุกการนัดหมาย<br/>เป็นระเบียบในที่เดียว</h1>
        <p>จองบริการ ติดตามงาน และเก็บประวัติการดูแลเครื่องปรับอากาศ โดยไม่ต้องสลับหลายช่องทาง</p>
        <div className="auth-benefit"><CheckCircle2 size={17}/><span>เห็นสถานะงานและรายละเอียดนัดหมายชัดเจน</span></div>
        <div className="auth-benefit"><CheckCircle2 size={17}/><span>ใช้ได้บนมือถือ แท็บเล็ต และคอมพิวเตอร์</span></div>
      </div>
    </section>
    <section className="auth-panel-wrap">
      <div className="auth-panel">
        <div className="auth-mobile-brand"><span className="auth-brand-icon"><Wind size={22}/></span><span>AirClean</span></div>
        <button className="auth-back-button" type="button" onClick={onBack}>← กลับหน้าหลัก</button>
        <div className="auth-heading">
          <h2>{headings[mode][0]}</h2>
          <p>{headings[mode][1]}</p>
        </div>
        {(mode==='login'||mode==='register') && <div className="auth-mode-switch" role="tablist" aria-label="ประเภทการเข้าใช้งาน">
          <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>เข้าสู่ระบบ</button>
          <button type="button" role="tab" aria-selected={mode==='register'} className={mode==='register'?'active':''} onClick={()=>switchMode('register')}>สมัครสมาชิก</button>
        </div>}
        {showSocial && <SocialButtons mode={mode} disabled={loading} onToken={socialSignIn} onError={message=>{setInfo('');setError(message);}}/>}
        <form className="auth-form" onSubmit={submit}>
          {mode==='register' && social && <div className="auth-social-pending"><span>สมัครด้วยบัญชี {providerLabel[social.provider]}</span><strong>{social.email}</strong><button type="button" className="auth-link-button" onClick={()=>{setSocial(null);setInfo('');}}>ใช้อีเมลและรหัสผ่านแทน</button></div>}
          {mode==='register' && <>
            <label className="auth-field"><span>ชื่อที่ใช้ติดต่อ</span><div className="auth-input-wrap"><UserRound size={17}/><input autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="ชื่อและนามสกุล" minLength={2} maxLength={120} required/></div></label>
            <label className="auth-field"><span>เลือกบทบาทตอนสร้างบัญชี</span><select className="auth-role-select" value={role} onChange={e=>setRole(e.target.value as 'customer'|'technician'|'manager')}><option value="customer">ลูกค้า — จองและติดตามงาน</option><option value="technician">ช่างแอร์ — รับงานและบันทึกรายงาน</option><option value="manager">ผู้ดูแลอาคาร — จัดการงานหลายเครื่อง</option></select><small className="auth-role-lock-note">เลือกได้ตอนสมัครเท่านั้น หลังสร้างบัญชีแล้วจะเปลี่ยนบทบาทเองไม่ได้</small></label>
            {role==='technician' && <>
              <label className="auth-field"><span>เบอร์โทรศัพท์</span><div className="auth-input-wrap"><Phone size={17}/><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="เช่น 081-234-5678" maxLength={30} required/></div></label>
              <label className="auth-field"><span>พื้นที่ให้บริการ</span><div className="auth-input-wrap"><MapPin size={17}/><input value={serviceArea} onChange={e=>setServiceArea(e.target.value)} placeholder="เช่น ลาดพร้าว · จตุจักร" minLength={2} maxLength={200} required/></div></label>
              <label className="auth-field"><span>ประสบการณ์ล้างแอร์ (ปี)</span><div className="auth-input-wrap"><BriefcaseBusiness size={17}/><input type="number" min={0} max={60} value={experienceYears} onChange={e=>setExperienceYears(Math.max(0,Math.min(60,Number(e.target.value)||0)))} required/></div></label>
              <p className="auth-registration-note">ผู้ดูแลระบบจะตรวจสอบข้อมูลและอาจโทรยืนยันก่อน เมื่ออนุมัติแล้วคุณจึงเห็นงานใกล้ตัวและส่งข้อเสนอได้</p>
            </>}
            {role==='manager' && <p className="auth-registration-note">บัญชีผู้ดูแลอาคารจะใช้งานบางส่วนได้หลังผู้ดูแลตั้งค่าข้อมูลและสิทธิ์ที่เกี่ยวข้องแล้ว</p>}
          </>}
          {needsEmail && <label className="auth-field"><span>อีเมล</span><div className="auth-input-wrap"><Mail size={17}/><input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required/></div></label>}
          {needsPassword && <label className="auth-field"><span>{mode==='reset'?'รหัสผ่านใหม่':'รหัสผ่าน'}</span><div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='login'?'กรอกรหัสผ่าน':'อย่างน้อย 8 ตัวอักษร'} minLength={8} maxLength={128} required/><button type="button" className="auth-password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>}
          {mode==='login' && <button type="button" className="auth-link-button" onClick={()=>switchMode('forgot')}>ลืมรหัสผ่าน?</button>}
          {needsConfirm && <label className="auth-field"><span>ยืนยันรหัสผ่าน</span><div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" minLength={8} maxLength={128} required/></div></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {info && <div className="auth-info" role="status"><CheckCircle2 size={17}/><span>{info}</span></div>}
          {!configured && <div className="auth-config-notice">ยังไม่ได้เชื่อมต่อระบบข้อมูล ผู้ใช้จะยังสมัครหรือเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า API</div>}
          <button type="submit" className="auth-submit" disabled={loading||!configured}>{loading?'กำลังตรวจสอบ...':mode==='login'?'เข้าสู่ระบบ':mode==='register'?(social?`สร้างบัญชีด้วย ${providerLabel[social.provider]}`:'สร้างบัญชี'):mode==='forgot'?'ส่งลิงก์ตั้งรหัสผ่าน':'บันทึกรหัสผ่านใหม่'} {!loading&&<ArrowRight size={17}/>}</button>
          {(mode==='forgot'||mode==='reset') && <button type="button" className="auth-link-button" onClick={()=>{ if(mode==='reset')onResetFinished?.(); switchMode('login'); }}>← กลับไปเข้าสู่ระบบ</button>}
          {mode==='forgot' && <p className="auth-registration-note">ไม่ได้รับอีเมล? ตรวจโฟลเดอร์สแปม หรือติดต่อผู้ดูแลระบบให้สร้างลิงก์ตั้งรหัสผ่านใหม่ให้</p>}
        </form>
        {mode==='register' && <p className="auth-registration-note">สามารถสมัครเป็นลูกค้า ช่างแอร์ หรือผู้ดูแลอาคารได้ แต่บัญชีผู้ดูแลระบบ (Admin) สร้างหรือกำหนดสิทธิ์ผ่านหลังบ้านเท่านั้น</p>}
        <div className="auth-security-note"><LockKeyhole size={15}/><span>ข้อมูลบัญชีจะถูกตรวจสอบกับระบบจริง ไม่มีบัญชีตัวอย่างให้เลือก</span></div>
        <p className="auth-copyright"><a href="/privacy.html">นโยบายความเป็นส่วนตัว</a> · <a href="/terms.html">ข้อกำหนดการใช้งาน</a> · © 2026 AirClean</p>
      </div>
    </section>
  </main>;
}

/** Google's own rendered button plus an Apple button drawn to Apple's sign-in guidelines. */
function SocialButtons({mode,disabled,onToken,onError}:{mode:'login'|'register';disabled:boolean;onToken:(provider:SocialProvider,idToken:string,name?:string)=>void;onError:(message:string)=>void}) {
  const googleSlot = useRef<HTMLDivElement>(null);
  const tokenHandler = useRef(onToken);
  tokenHandler.current = onToken;
  const [appleBusy,setAppleBusy] = useState(false);
  useEffect(()=>{
    if (!googleEnabled || !googleSlot.current) return;
    renderGoogleButton(googleSlot.current, token=>tokenHandler.current('google',token), mode==='register'?'signup_with':'signin_with')
      .catch(reason=>onError(reason instanceof Error?reason.message:'โหลดปุ่ม Google ไม่สำเร็จ'));
  },[mode]); // eslint-disable-line react-hooks/exhaustive-deps
  async function apple() {
    setAppleBusy(true);
    try { const result = await signInWithApple(); tokenHandler.current('apple', result.idToken, result.fullName); }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบด้วย Apple ไม่สำเร็จ'); }
    finally { setAppleBusy(false); }
  }
  return <div className="auth-social" aria-busy={disabled}>
    {googleEnabled && <div className="auth-google-slot" ref={googleSlot}/>}
    {appleEnabled && <button type="button" className="auth-apple-button" onClick={()=>void apple()} disabled={disabled||appleBusy}>
      <svg viewBox="0 0 814 1000" width="16" height="19" aria-hidden="true" focusable="false"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
      {mode==='register'?'สมัครด้วย Apple':'ลงชื่อเข้าใช้ด้วย Apple'}
    </button>}
    <div className="auth-social-divider" role="separator"><span>หรือใช้อีเมล</span></div>
  </div>;
}
