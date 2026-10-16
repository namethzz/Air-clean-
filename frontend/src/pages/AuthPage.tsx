import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Home, Loader2, LockKeyhole, ReceiptText, ShieldCheck, Timer, Wrench } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import type { UserProfile } from '../types';
import { ApiError, externalLogin, forgotPassword, isApiConfigured, login, register, resetPassword, setKeepSignedIn } from '../lib/api';
import { appleEnabled, googleEnabled, renderGoogleButton, signInWithApple, type SocialProvider } from '../lib/socialAuth';
import { cn } from '../lib/utils';
import { GlassInputWrapper, PasswordInput, SignInPage, type Testimonial } from '../components/ui/sign-in';
import { AirCleaningPhoto } from '../components/ui/hero-financial-utils/assets-index';

type Mode='login'|'register'|'forgot'|'reset';
/** A Google/Apple sign-in that found no AirClean account yet; the person picks a role to finish. */
interface PendingSocial { provider:SocialProvider; idToken:string; email?:string; }
const providerLabel:Record<SocialProvider,string>={google:'Google',apple:'Apple'};
type SignupRole='customer'|'technician'|'manager';
const roleOptions:{key:SignupRole;title:string;text:string;icon:typeof Home}[]=[
  {key:'customer',title:'ลูกค้า',text:'ล้างแอร์ที่บ้านหรือคอนโด',icon:Home},
  {key:'technician',title:'ช่างแอร์',text:'รับงานล้างแอร์ใกล้ตัว',icon:Wrench},
  {key:'manager',title:'เจ้าของ / ผู้ดูแลอาคาร',text:'ล้างแอร์ทั้งอาคาร หลายห้องพร้อมกัน',icon:Building2},
];
/** Facts about the service shown over the photo. They describe how AirClean works; they are not customer reviews. */
const highlights:Testimonial[]=[
  {icon:<ShieldCheck size={20}/>,name:'ช่างผ่านการตรวจสอบ',handle:'ก่อนเริ่มรับงาน',text:'ผู้ดูแลระบบตรวจข้อมูลช่างทุกคน ก่อนเปิดให้เห็นงานและเสนอราคา'},
  {icon:<Timer size={20}/>,name:'เลือกช่างได้เอง',handle:'มีเวลาตัดสินใจ 1 ชั่วโมง',text:'ช่างที่สนใจส่งข้อเสนอเข้ามา เทียบราคาแล้วเลือกคนที่ใช่'},
  {icon:<ReceiptText size={20}/>,name:'ใบเสร็จและประวัติล้างแอร์',handle:'เก็บไว้ครบทุกเครื่อง',text:'ดูย้อนหลังได้ว่าแอร์เครื่องไหนล้างไปเมื่อไร'},
];
interface Props { onAuthenticated:(user:UserProfile)=>void; initialError?:string; initialMode?:'login'|'register'; initialRole?:'customer'|'technician'|'manager'; onBack?:()=>void; resetToken?:string; onResetFinished?:(message?:string)=>void; initialInfo?:string; }
const headings:Record<Mode,[string,string]>={
  login:['ยินดีต้อนรับกลับมา','เข้าสู่ระบบเพื่อดูการจองและติดตามบริการของคุณ'],
  register:['สร้างบัญชี','สมัครบัญชีเพื่อเริ่มจองบริการและเก็บประวัติงาน'],
  forgot:['ลืมรหัสผ่าน','กรอกอีเมลของบัญชี เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้'],
  reset:['ตั้งรหัสผ่านใหม่','ตั้งรหัสผ่านใหม่ แล้วเข้าสู่ระบบอีกครั้ง อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้จะถูกออกจากระบบ'],
};
const inputClass='w-full bg-transparent px-4 py-3.5 rounded-2xl focus:outline-none';
const appear='animate-in fade-in-0 slide-in-from-top-1 duration-300 motion-reduce:animate-none';

function Field({label,className,children}:{label:string;className?:string;children:ReactNode}) {
  return <label className={cn('block',className)}>
    <span className="mb-1.5 block text-sm font-medium text-foreground/80">{label}</span>
    <GlassInputWrapper>{children}</GlassInputWrapper>
  </label>;
}

export default function AuthPage({onAuthenticated,initialError='',initialMode='login',initialRole='customer',onBack,resetToken,onResetFinished,initialInfo=''}:Props) {
  const [mode,setMode] = useState<Mode>(resetToken?'reset':initialMode);
  const [info,setInfo] = useState(initialInfo);
  const [phone,setPhone] = useState('');
  const [serviceArea,setServiceArea] = useState('');
  const [experienceYears,setExperienceYears] = useState(0);
  const [fullName,setFullName] = useState('');
  const [role,setRole] = useState<SignupRole>(initialRole);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [remember,setRemember] = useState(true);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState(initialError);
  const [social,setSocial] = useState<PendingSocial|null>(null);
  const configured = isApiConfigured();
  async function socialSignIn(provider:SocialProvider, idToken:string, nameFromProvider?:string) {
    setError(''); setInfo(''); setLoading(true);
    setKeepSignedIn(mode==='login' ? remember : true);
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
    setKeepSignedIn(mode==='login' ? remember : true);
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
  const submitLabel = mode==='login'?'เข้าสู่ระบบ':mode==='register'?(social?`สร้างบัญชีด้วย ${providerLabel[social.provider]}`:'สร้างบัญชี'):mode==='forgot'?'ส่งลิงก์ตั้งรหัสผ่าน':'บันทึกรหัสผ่านใหม่';

  const header = <div className="flex items-center justify-between gap-3">
    <span className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-[-0.01em]">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><BrandMark className="w-[82%] h-auto"/></span>AirClean
    </span>
    {onBack && <button type="button" onClick={onBack} className="ac-signin-link inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={16}/>กลับหน้าหลัก</button>}
  </div>;

  const footer = <div className="flex flex-col gap-2.5 border-t border-border pt-5 text-[0.8rem] leading-relaxed text-muted-foreground">
    <p className="flex items-start gap-2 text-pretty"><LockKeyhole size={14} className="mt-[3px] shrink-0"/>ข้อมูลบัญชีจะถูกตรวจสอบกับระบบจริง ไม่มีบัญชีตัวอย่างให้เลือก</p>
    <p><a className="ac-signin-link text-muted-foreground" href="/privacy.html">นโยบายความเป็นส่วนตัว</a> · <a className="ac-signin-link text-muted-foreground" href="/terms.html">ข้อกำหนดการใช้งาน</a> · © 2026 AirClean</p>
  </div>;

  return <SignInPage title={headings[mode][0]} description={headings[mode][1]} heroImageSrc={AirCleaningPhoto.src} testimonials={highlights} header={header} footer={footer}>
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {mode==='register' && social && <div className={cn(appear,'flex flex-col gap-1 rounded-2xl border border-border bg-secondary px-4 py-3.5 text-sm')}>
        <span className="text-muted-foreground">สมัครด้วยบัญชี {providerLabel[social.provider]}</span>
        <strong className="font-semibold break-all">{social.email}</strong>
        <button type="button" className="ac-signin-link self-start font-medium text-primary" onClick={()=>{setSocial(null);setInfo('');}}>ใช้อีเมลและรหัสผ่านแทน</button>
      </div>}

      {mode==='register' && <>
        <fieldset className="animate-element animate-delay-300 m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-medium text-foreground/80">สมัครใช้งานเป็น</legend>
          <div className="grid gap-2">
            {roleOptions.map(option=>{const Icon=option.icon; const active=role===option.key; return <label key={option.key}
              className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                active?'border-primary bg-primary/[0.06]':'border-border hover:bg-secondary')}>
              <input type="radio" name="signup-role" value={option.key} checked={active} onChange={()=>setRole(option.key)} className="sr-only"/>
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors',active?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground')}><Icon size={20}/></span>
              <span className="min-w-0 flex-1">
                <strong className="block font-display font-semibold">{option.title}</strong>
                <small className="block text-sm text-muted-foreground">{option.text}</small>
              </span>
              <span aria-hidden="true" className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors',active?'border-primary':'border-muted-foreground/50')}>
                <span className={cn('h-2.5 w-2.5 rounded-full bg-primary transition-transform',active?'scale-100':'scale-0')}/>
              </span>
            </label>;})}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">เลือกได้ตอนสมัครเท่านั้น หลังสร้างบัญชีแล้วเปลี่ยนเองไม่ได้</p>
        </fieldset>
        <Field label="ชื่อที่ใช้ติดต่อ" className="animate-element animate-delay-400"><input className={inputClass} autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="ชื่อและนามสกุล" minLength={2} maxLength={120} required/></Field>
        {role==='technician' && <div className={cn(appear,'flex flex-col gap-4')}>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="เบอร์โทรศัพท์"><input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="เช่น 081-234-5678" maxLength={30} required/></Field>
            <Field label="ประสบการณ์ (ปี)"><input className={inputClass} type="number" inputMode="numeric" min={0} max={60} value={experienceYears} onChange={e=>setExperienceYears(Math.max(0,Math.min(60,Number(e.target.value)||0)))} required/></Field>
          </div>
          <Field label="พื้นที่ให้บริการ"><input className={inputClass} value={serviceArea} onChange={e=>setServiceArea(e.target.value)} placeholder="เช่น ลาดพร้าว · จตุจักร" minLength={2} maxLength={200} required/></Field>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">ผู้ดูแลระบบจะตรวจสอบข้อมูลและอาจโทรยืนยันก่อน เมื่ออนุมัติแล้วคุณจึงเห็นงานใกล้ตัวและส่งข้อเสนอได้</p>
        </div>}
        {role==='manager' && <p className={cn(appear,'text-sm leading-relaxed text-muted-foreground')}>ใช้งานได้ทันที เพิ่มอาคารของคุณ แล้วขอช่างล้างแอร์ได้ครั้งละหลายสิบเครื่อง</p>}
      </>}

      {needsEmail && <Field label="อีเมล" className="animate-element animate-delay-300"><input className={inputClass} type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required/></Field>}
      {needsPassword && <Field label={mode==='reset'?'รหัสผ่านใหม่':'รหัสผ่าน'} className="animate-element animate-delay-400">
        <PasswordInput className="py-3.5" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='login'?'กรอกรหัสผ่าน':'อย่างน้อย 8 ตัวอักษร'} minLength={8} maxLength={128} required/>
      </Field>}
      {needsConfirm && <Field label="ยืนยันรหัสผ่าน" className="animate-element animate-delay-500">
        <PasswordInput className="py-3.5" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" minLength={8} maxLength={128} required/>
      </Field>}

      {mode==='login' && <div className="animate-element animate-delay-500 flex items-center justify-between gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" className="custom-checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>
          <span className="text-foreground/90">จดจำการเข้าสู่ระบบ</span>
        </label>
        <button type="button" className="ac-signin-link font-medium text-primary" onClick={()=>switchMode('forgot')}>ลืมรหัสผ่าน?</button>
      </div>}

      {error && <div className={cn(appear,'flex items-start gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm leading-relaxed text-destructive')} role="alert"><AlertCircle size={17} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
      {info && <div className={cn(appear,'flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm leading-relaxed')} role="status"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary"/><span>{info}</span></div>}
      {!configured && <div className="rounded-2xl border border-[#9a5b00]/25 bg-[#9a5b00]/[0.07] px-4 py-3 text-sm leading-relaxed text-[#7a4800]">ยังไม่ได้เชื่อมต่อระบบข้อมูล ผู้ใช้จะยังสมัครหรือเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า API</div>}

      <button type="submit" disabled={loading||!configured}
        className="animate-element animate-delay-600 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-semibold text-primary-foreground shadow-[0_12px_24px_-14px_rgb(36_104_216/0.9)] transition-[background-color,transform] hover:bg-[#1a4fb0] active:translate-y-px">
        {loading?<><Loader2 size={18} className="animate-spin"/>กำลังตรวจสอบ...</>:<>{submitLabel}<ArrowRight size={18}/></>}
      </button>

      {(mode==='forgot'||mode==='reset') && <button type="button" className="ac-signin-link inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary" onClick={()=>{ if(mode==='reset')onResetFinished?.(); switchMode('login'); }}><ArrowLeft size={15}/>กลับไปเข้าสู่ระบบ</button>}
      {mode==='forgot' && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">ไม่ได้รับอีเมล? ตรวจโฟลเดอร์สแปม หรือติดต่อผู้ดูแลระบบให้สร้างลิงก์ตั้งรหัสผ่านใหม่ให้</p>}
    </form>

    {showSocial && <SocialButtons mode={mode} disabled={loading} onToken={socialSignIn} onError={message=>{setInfo('');setError(message);}}/>}

    {(mode==='login'||mode==='register') && <p className="animate-element animate-delay-900 text-center text-sm text-muted-foreground">
      {mode==='login'
        ? <>ยังไม่มีบัญชี? <button type="button" className="ac-signin-link font-semibold text-primary" onClick={()=>switchMode('register')}>สมัครสมาชิก</button></>
        : <>มีบัญชีแล้ว? <button type="button" className="ac-signin-link font-semibold text-primary" onClick={()=>switchMode('login')}>เข้าสู่ระบบ</button></>}
    </p>}
    {mode==='register' && <p className="-mt-3 text-center text-xs text-muted-foreground">บัญชีผู้ดูแลระบบ (Admin) สร้างผ่านหลังบ้านเท่านั้น</p>}
  </SignInPage>;
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
  return <div className="animate-element animate-delay-700 flex flex-col gap-3" aria-busy={disabled}>
    <div className="flex items-center gap-4 text-sm text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border"/>หรือดำเนินการต่อด้วย<span className="h-px flex-1 bg-border"/>
    </div>
    {googleEnabled && <div className="flex min-h-11 justify-center [color-scheme:light]" ref={googleSlot}/>}
    {appleEnabled && <button type="button" onClick={()=>void apple()} disabled={disabled||appleBusy}
      className="mx-auto flex h-11 w-full max-w-[400px] items-center justify-center gap-2 rounded-full bg-black text-[0.95rem] font-medium text-white transition-colors hover:bg-[#1d1d1f]">
      <svg viewBox="0 0 814 1000" width="16" height="19" aria-hidden="true" focusable="false"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
      {mode==='register'?'สมัครด้วย Apple':'ลงชื่อเข้าใช้ด้วย Apple'}
    </button>}
  </div>;
}
