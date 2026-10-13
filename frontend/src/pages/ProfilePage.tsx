import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import type { UserProfile, UserRole } from '../types';
import { updateMyProfile } from '../lib/api';

interface Props {
  user: UserProfile;
  onUpdated: (user: UserProfile) => void;
}
const roleLabels: Record<UserRole,string> = {
  customer: 'ลูกค้า', technician: 'ช่างแอร์', manager: 'ผู้ดูแลอาคาร', admin: 'ผู้ดูแลระบบ',
};
export default function ProfilePage({ user, onUpdated }: Props) {
  const [fullName,setFullName] = useState(user.fullName);
  const [email,setEmail] = useState(user.email);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [saved,setSaved] = useState(false);

  useEffect(() => { setFullName(user.fullName); setEmail(user.email); },[user.fullName,user.email]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSaved(false); setSaving(true);
    try {
      const updated = await updateMyProfile({ fullName, email });
      onUpdated(updated); setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่');
    } finally { setSaving(false); }
  }

  return <div className="page-stack">
    <div className="page-heading-row">
      <div><div className="eyebrow">ACCOUNT SETTINGS</div><h1>โปรไฟล์ของฉัน</h1><p className="page-subtitle">จัดการชื่อและอีเมลที่ใช้ติดต่อ โดยบทบาทบัญชีไม่สามารถเปลี่ยนจากหน้านี้ได้</p></div>
    </div>
    <div className="profile-layout">
      <section className="panel profile-summary-panel">
        <div className="profile-avatar-large"><UserRound size={32}/></div>
        <h2>{user.fullName}</h2><p>{user.email}</p>
        <span className="profile-role-pill"><ShieldCheck size={15}/>{roleLabels[user.role]}</span>
        <div className="profile-summary-note">บทบาทจะถูกกำหนดเมื่อสร้างบัญชี และไม่สามารถเปลี่ยนเองได้จากหน้าโปรไฟล์ หากจำเป็นต้องแก้ไข ให้ติดต่อผู้ดูแลระบบ</div>
      </section>
      <section className="panel profile-form-panel">
        <div className="panel-heading"><div><h2>ข้อมูลส่วนตัว</h2><p>การเปลี่ยนแปลงจะบันทึกลงฐานข้อมูลของระบบ</p></div></div>
        <form className="profile-form" onSubmit={submit}>
          <label className="form-field"><span>ชื่อที่ใช้ติดต่อ</span><div className="profile-input-wrap"><UserRound size={17}/><input value={fullName} onChange={e=>setFullName(e.target.value)} minLength={2} maxLength={120} required/></div></label>
          <label className="form-field"><span>อีเมล</span><div className="profile-input-wrap"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/></div></label>
          <label className="form-field"><span>บทบาทบัญชี (กำหนดตอนสมัคร)</span><input value={roleLabels[user.role]} readOnly aria-readonly="true"/></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {saved && <div className="profile-saved" role="status"><CheckCircle2 size={17}/>บันทึกโปรไฟล์เรียบร้อยแล้ว</div>}
          <button className="primary-button" type="submit" disabled={saving || !fullName.trim() || !email.trim()}><Save size={16}/>{saving?'กำลังบันทึก...':'บันทึกการเปลี่ยนแปลง'}</button>
        </form>
      </section>
    </div>
  </div>;
}
