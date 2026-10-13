import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, UserRound, Wind } from 'lucide-react';
import type { UserProfile } from '../types';
import { isApiConfigured, login, register } from '../lib/api';

interface Props { onAuthenticated:(user:UserProfile)=>void; initialError?:string; }
export default function AuthPage({onAuthenticated,initialError=''}:Props) {
  const [mode,setMode] = useState<'login'|'register'>('login');
  const [fullName,setFullName] = useState('');
  const [role,setRole] = useState<'customer'|'technician'|'manager'>('customer');
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
    if (mode === 'register' && password !== confirmPassword) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setLoading(true);
    try {
      const user = mode === 'login' ? await login(email,password) : await register(fullName,email,password,role);
      onAuthenticated(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  }
  return <main className="auth-screen">
    <section className="auth-visual" aria-label="AirClean">
      <div className="auth-brand"><span className="auth-brand-icon"><Wind size={24}/></span><span>AirClean</span></div>
      <div className="auth-visual-copy">
        <span className="auth-overline">ดูแลแอร์ เป็นเรื่องง่าย</span>
        <h1>ทุกการนัดหมาย<br/>เป็นระเบียบในที่เดียว</h1>
        <p>จองบริการ ติดตามงาน และเก็บประวัติการดูแลเครื่องปรับอากาศ โดยไม่ต้องสลับหลายช่องทาง</p>
        <div className="auth-benefit"><CheckCircle2 size={17}/><span>เห็นสถานะงานและรายละเอียดนัดหมายชัดเจน</span></div>
        <div className="auth-benefit"><CheckCircle2 size={17}/><span>ใช้ได้บนมือถือ แท็บเล็ต และคอมพิวเตอร์</span></div>
      </div>
      <div className="auth-visual-footer">AIRCLEAN · HOME SERVICE WORKSPACE</div>
    </section>
    <section className="auth-panel-wrap">
      <div className="auth-panel">
        <div className="auth-mobile-brand"><span className="auth-brand-icon"><Wind size={22}/></span><span>AirClean</span></div>
        <div className="auth-heading">
          <span className="auth-eyebrow">{mode==='login'?'ยินดีต้อนรับกลับ':'เริ่มใช้งาน AirClean'}</span>
          <h2>{mode==='login'?'เข้าสู่ระบบ':'สร้างบัญชี'}</h2>
          <p>{mode==='login'?'เข้าสู่ระบบเพื่อดูการจองและติดตามบริการของคุณ':'สมัครบัญชีเพื่อเริ่มจองบริการและเก็บประวัติงาน'}</p>
        </div>
        <div className="auth-mode-switch" role="tablist" aria-label="ประเภทการเข้าใช้งาน">
          <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'active':''} onClick={()=>{setMode('login');setError('');}}>เข้าสู่ระบบ</button>
          <button type="button" role="tab" aria-selected={mode==='register'} className={mode==='register'?'active':''} onClick={()=>{setMode('register');setError('');}}>สมัครสมาชิก</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode==='register' && <>
            <label className="auth-field"><span>ชื่อที่ใช้ติดต่อ</span><div className="auth-input-wrap"><UserRound size={17}/><input autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="ชื่อและนามสกุล" minLength={2} maxLength={120} required/></div></label>
            <label className="auth-field"><span>เลือกบทบาทตอนสร้างบัญชี</span><select className="auth-role-select" value={role} onChange={e=>setRole(e.target.value as 'customer'|'technician'|'manager')}><option value="customer">ลูกค้า — จองและติดตามงาน</option><option value="technician">ช่างแอร์ — รับงานและบันทึกรายงาน</option><option value="manager">ผู้ดูแลอาคาร — จัดการงานหลายเครื่อง</option></select><small className="auth-role-lock-note">เลือกได้ตอนสมัครเท่านั้น หลังสร้างบัญชีแล้วจะเปลี่ยนบทบาทเองไม่ได้</small></label>
            {role!=='customer' && <p className="auth-registration-note">บัญชี{role==='technician'?'ช่างแอร์':'ผู้ดูแลอาคาร'}จะใช้งานบางส่วนได้หลังผู้ดูแลตั้งค่าข้อมูลและสิทธิ์ที่เกี่ยวข้องแล้ว</p>}
          </>}
          <label className="auth-field"><span>อีเมล</span><div className="auth-input-wrap"><Mail size={17}/><input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required/></div></label>
          <label className="auth-field"><span>รหัสผ่าน</span><div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='login'?'กรอกรหัสผ่าน':'อย่างน้อย 8 ตัวอักษร'} minLength={8} maxLength={128} required/><button type="button" className="auth-password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
          {mode==='register' && <label className="auth-field"><span>ยืนยันรหัสผ่าน</span><div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" minLength={8} maxLength={128} required/></div></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {!configured && <div className="auth-config-notice">ยังไม่ได้เชื่อมต่อระบบข้อมูล ผู้ใช้จะยังสมัครหรือเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า API</div>}
          <button type="submit" className="auth-submit" disabled={loading||!configured}>{loading?'กำลังตรวจสอบ...':mode==='login'?'เข้าสู่ระบบ':'สร้างบัญชี'} {!loading&&<ArrowRight size={17}/>}</button>
        </form>
        {mode==='register' && <p className="auth-registration-note">สามารถสมัครเป็นลูกค้า ช่างแอร์ หรือผู้ดูแลอาคารได้ แต่บัญชีผู้ดูแลระบบ (Admin) สร้างหรือกำหนดสิทธิ์ผ่านหลังบ้านเท่านั้น</p>}
        <div className="auth-security-note"><LockKeyhole size={15}/><span>ข้อมูลบัญชีจะถูกตรวจสอบกับระบบจริง ไม่มีบัญชีตัวอย่างให้เลือก</span></div>
        <p className="auth-copyright">© 2026 AirClean</p>
      </div>
    </section>
  </main>;
}
