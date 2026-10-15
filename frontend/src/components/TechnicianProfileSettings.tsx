import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { fetchMyTechnicianProfile, updateMyTechnicianProfile, type TechnicianProfilePayload } from '../lib/api';
import type { TechnicianApplication } from '../types';
const fields: Record<keyof TechnicianProfilePayload, string> = {
  title: 'ชื่อบริการ / ความเชี่ยวชาญ', area: 'พื้นที่ให้บริการ', basePrice: 'ราคาเริ่มต้นต่อเครื่อง (บาท)', availableText: 'ช่วงเวลาที่รับงาน',
  skills: 'บริการที่รับ (คั่นด้วยเครื่องหมาย ,)', phone: 'เบอร์โทรศัพท์ (ผู้ดูแลระบบใช้ติดต่อ ไม่แสดงต่อลูกค้า)', experienceYears: 'ประสบการณ์ล้างแอร์ (ปี)',
};
const numeric: (keyof TechnicianProfilePayload)[] = ['basePrice', 'experienceYears'];
function toForm(p: TechnicianApplication): TechnicianProfilePayload {
  return { title: p.title, area: p.area, basePrice: p.basePrice, availableText: p.availableText, skills: p.skills.join(', '), phone: p.phone, experienceYears: p.experienceYears };
}
/** Where the technician's application stands with the admin. */
export function VerificationBanner({ profile }: { profile: TechnicianApplication }) {
  if (profile.verificationStatus === 'Approved') return <div className="tech-verification approved" role="status"><CheckCircle2 size={18}/><div><strong>ผ่านการตรวจสอบแล้ว</strong><span>คุณดูงานใกล้ตัวและส่งข้อเสนอได้</span></div></div>;
  if (profile.verificationStatus === 'Rejected') return <div className="tech-verification rejected" role="alert"><XCircle size={18}/><div><strong>ยังไม่ผ่านการตรวจสอบ</strong><span>เหตุผล: {profile.verificationNote || 'กรุณาตรวจข้อมูลอีกครั้ง'} — แก้ไขข้อมูลด้านล่างแล้วกดบันทึก ระบบจะส่งให้ผู้ดูแลตรวจอีกครั้ง</span></div></div>;
  return <div className="tech-verification pending" role="status"><Clock3 size={18}/><div><strong>รอผู้ดูแลระบบตรวจสอบ</strong><span>ผู้ดูแลอาจโทรยืนยันตามเบอร์ที่ให้ไว้ เมื่ออนุมัติแล้วจะเห็นงานใกล้ตัวทันที</span></div></div>;
}
export default function TechnicianProfileSettings() {
  const [profile, setProfile] = useState<TechnicianApplication | null>(null);
  const [form, setForm] = useState<TechnicianProfilePayload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    fetchMyTechnicianProfile().then(p => { if (active) { setProfile(p); setForm(toForm(p)); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'); });
    return () => { active = false; };
  }, [attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    setSaving(true); setSaved(false); setError('');
    try { const p = await updateMyTechnicianProfile(form); setProfile(p); setForm(toForm(p)); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return <section className="panel profile-form-panel">
    <div className="panel-heading"><div><h2>โปรไฟล์บริการของช่าง</h2><p>ข้อมูลสำหรับลูกค้าและการคำนวณข้อเสนอใหม่ ราคาข้อเสนอที่ส่งแล้วจะคงเดิม</p></div></div>
    {profile && <VerificationBanner profile={profile}/>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    {!form ? error ? <button className="primary-button" onClick={() => setAttempt(n => n + 1)}>ลองโหลดอีกครั้ง</button> : <p role="status">กำลังโหลด...</p> :
    <form className="profile-form" onSubmit={submit}>
      {(Object.keys(fields) as (keyof TechnicianProfilePayload)[]).map(key => <label className="form-field" key={key}><span>{fields[key]}</span><input required disabled={saving}
        type={numeric.includes(key) ? 'number' : key === 'phone' ? 'tel' : 'text'} min={key === 'experienceYears' ? 0 : 1} max={key === 'experienceYears' ? 60 : 100000} step={key === 'basePrice' ? '0.01' : '1'}
        maxLength={key === 'skills' ? 500 : key === 'area' ? 200 : key === 'phone' ? 30 : 120} value={form[key]}
        onChange={e => { setSaved(false); setForm({ ...form, [key]: numeric.includes(key) ? Number(e.target.value) : e.target.value }); }}/></label>)}
      <p className="page-subtitle">งานใกล้ฉันค้นหาจาก GPS และระยะค้นหา การอนุมัติบัญชีช่างจัดการโดยผู้ดูแลระบบ</p>
      {saved && <p className="profile-saved" role="status">{profile?.verificationStatus === 'Pending' ? 'บันทึกแล้ว ส่งให้ผู้ดูแลตรวจสอบ' : 'บันทึกข้อมูลบริการเรียบร้อยแล้ว'}</p>}
      <button className="primary-button" disabled={saving || !form.title.trim() || !form.area.trim() || !form.skills.trim() || !form.availableText.trim() || !form.phone.trim()}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลบริการ'}</button>
    </form>}
  </section>;
}
