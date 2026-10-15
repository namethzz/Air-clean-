import { useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, MapPin, Phone, UserRound, Wind } from 'lucide-react';
import type { UserProfile } from '../types';
import { forgotPassword, isApiConfigured, login, register, resetPassword } from '../lib/api';
import { AirCleaningPhoto } from '../components/ui/hero-financial-utils/assets-index';

type Mode='login'|'register'|'forgot'|'reset';
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
  const configured = isApiConfigured();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!configured) { setError('ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ API จึงไม่สามารถเข้าสู่ระบบหรือบันทึกข้อมูลได้'); return; }
    if ((mode === 'register' || mode === 'reset') && password !== confirmPassword) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setLoading(true); setInfo('');
    try {
      if (mode === 'forgot') { setInfo(await forgotPassword(email)); return; }
      if (mode === 'reset') {
        const message = await resetPassword(resetToken ?? '', password);
        setPassword(''); setConfirmPassword(''); onResetFinished?.(message); return;
      }
      const user = mode === 'login' ? await login(email,password) : await register(fullName,email,password,role,{ phone, serviceArea, experienceYears });
      onAuthenticated(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  }
  function switchMode(next:Mode){ setMode(next); setError(''); setInfo(''); }
  const needsPassword = mode !== 'forgot';
  const needsConfirm = mode === 'register' || mode === 'reset';
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
        <form className="auth-form" onSubmit={submit}>
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
          {mode!=='reset' && <label className="auth-field"><span>อีเมล</span><div className="auth-input-wrap"><Mail size={17}/><input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required/></div></label>}
          {needsPassword && <label className="auth-field"><span>{mode==='reset'?'รหัสผ่านใหม่':'รหัสผ่าน'}</span><div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='login'?'กรอกรหัสผ่าน':'อย่างน้อย 8 ตัวอักษร'} minLength={8} maxLength={128} required/><button type="button" className="auth-password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>}
          {mode==='login' && <button type="button" className="auth-link-button" onClick={()=>switchMode('forgot')}>ลืมรหัสผ่าน?</button>}
          {needsConfirm && <label className="auth-field"><span>ยืนยันรหัสผ่าน</span><div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" minLength={8} maxLength={128} required/></div></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {info && <div className="auth-info" role="status"><CheckCircle2 size={17}/><span>{info}</span></div>}
          {!configured && <div className="auth-config-notice">ยังไม่ได้เชื่อมต่อระบบข้อมูล ผู้ใช้จะยังสมัครหรือเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า API</div>}
          <button type="submit" className="auth-submit" disabled={loading||!configured}>{loading?'กำลังตรวจสอบ...':mode==='login'?'เข้าสู่ระบบ':mode==='register'?'สร้างบัญชี':mode==='forgot'?'ส่งลิงก์ตั้งรหัสผ่าน':'บันทึกรหัสผ่านใหม่'} {!loading&&<ArrowRight size={17}/>}</button>
          {(mode==='forgot'||mode==='reset') && <button type="button" className="auth-link-button" onClick={()=>{ if(mode==='reset')onResetFinished?.(); switchMode('login'); }}>← กลับไปเข้าสู่ระบบ</button>}
          {mode==='forgot' && <p className="auth-registration-note">ไม่ได้รับอีเมล? ตรวจโฟลเดอร์สแปม หรือติดต่อผู้ดูแลระบบให้สร้างลิงก์ตั้งรหัสผ่านใหม่ให้</p>}
        </form>
        {mode==='register' && <p className="auth-registration-note">สามารถสมัครเป็นลูกค้า ช่างแอร์ หรือผู้ดูแลอาคารได้ แต่บัญชีผู้ดูแลระบบ (Admin) สร้างหรือกำหนดสิทธิ์ผ่านหลังบ้านเท่านั้น</p>}
        <div className="auth-security-note"><LockKeyhole size={15}/><span>ข้อมูลบัญชีจะถูกตรวจสอบกับระบบจริง ไม่มีบัญชีตัวอย่างให้เลือก</span></div>
        <p className="auth-copyright">© 2026 AirClean</p>
      </div>
    </section>
  </main>;
}
