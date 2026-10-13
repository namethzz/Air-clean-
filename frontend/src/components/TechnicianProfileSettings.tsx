import { useEffect, useState, type FormEvent } from 'react';
import { fetchMyTechnicianProfile, updateMyTechnicianProfile, type TechnicianProfilePayload } from '../lib/api';
const fields = { title: 'ชื่อบริการ / ความเชี่ยวชาญ', area: 'พื้นที่ให้บริการ', basePrice: 'ราคาเริ่มต้นต่อเครื่อง (บาท)', availableText: 'ช่วงเวลาที่รับงาน', skills: 'บริการที่รับ (คั่นด้วยเครื่องหมาย ,)' };
export default function TechnicianProfileSettings() {
  const [form, setForm] = useState<TechnicianProfilePayload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    fetchMyTechnicianProfile().then(p => {
      if (active) setForm({ title: p.title, area: p.area, basePrice: p.basePrice, availableText: p.availableText, skills: p.skills.join(', ') });
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'); });
    return () => { active = false; };
  }, [attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    setSaving(true); setSaved(false); setError('');
    try {
      const p = await updateMyTechnicianProfile(form);
      setForm({ title: p.title, area: p.area, basePrice: p.basePrice, availableText: p.availableText, skills: p.skills.join(', ') });
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return <section className="panel profile-form-panel">
    <div className="panel-heading"><div><h2>โปรไฟล์บริการของช่าง</h2><p>ข้อมูลสำหรับลูกค้าและการคำนวณข้อเสนอใหม่ ราคาข้อเสนอที่ส่งแล้วจะคงเดิม</p></div></div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {!form ? error ? <button className="primary-button" onClick={() => setAttempt(n => n + 1)}>ลองโหลดอีกครั้ง</button> : <p role="status">กำลังโหลด...</p> :
    <form className="profile-form" onSubmit={submit}>
      {(Object.keys(fields) as (keyof TechnicianProfilePayload)[]).map(key => <label className="form-field" key={key}><span>{fields[key]}</span><input required disabled={saving} type={key === 'basePrice' ? 'number' : 'text'} min={1} max={100000} step="0.01" maxLength={key === 'skills' ? 500 : key === 'area' ? 200 : 120} value={form[key]} onChange={e => { setSaved(false); setForm({ ...form, [key]: key === 'basePrice' ? Number(e.target.value) : e.target.value }); }}/></label>)}
      <p className="page-subtitle">งานใกล้ฉันค้นหาจาก GPS และระยะค้นหา สถานะยืนยันช่างจัดการโดยผู้ดูแลระบบ</p>
      {saved && <p className="profile-saved" role="status">บันทึกข้อมูลบริการเรียบร้อยแล้ว</p>}
      <button className="primary-button" disabled={saving || !form.title.trim() || !form.area.trim() || !form.skills.trim() || !form.availableText.trim()}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลบริการ'}</button>
    </form>}
  </section>;
}
