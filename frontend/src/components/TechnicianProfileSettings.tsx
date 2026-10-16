import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Check, CheckCircle2, Clock3, Loader2, Plus, XCircle } from 'lucide-react';
import { fetchPriceGuide, isApiConfigured, updateMyTechnicianProfile } from '../lib/api';
import { numberText } from '../lib/numberText';
import { baht, referenceSheet } from '../lib/pricing';
import type { PriceGuide, PriceSheet, TechnicianApplication } from '../types';

/** Where the technician's application stands with the admin. */
export function VerificationBanner({ profile }: { profile: TechnicianApplication }) {
  if (profile.verificationStatus === 'Approved') return <div className="tech-verification approved" role="status"><CheckCircle2 size={18}/><div><strong>ผ่านการตรวจสอบแล้ว</strong><span>คุณดูงานใกล้ตัวและส่งข้อเสนอได้</span></div></div>;
  if (profile.verificationStatus === 'Rejected') return <div className="tech-verification rejected" role="alert"><XCircle size={18}/><div><strong>ยังไม่ผ่านการตรวจสอบ</strong><span>เหตุผล: {profile.verificationNote || 'กรุณาตรวจข้อมูลอีกครั้ง'} — แก้ไขข้อมูลด้านล่างแล้วกดบันทึก ระบบจะส่งให้ผู้ดูแลตรวจอีกครั้ง</span></div></div>;
  return <div className="tech-verification pending" role="status"><Clock3 size={18}/><div><strong>รอผู้ดูแลระบบตรวจสอบ</strong><span>ผู้ดูแลอาจโทรยืนยันตามเบอร์ที่ให้ไว้ เมื่ออนุมัติแล้วจะเห็นงานใกล้ตัวทันที</span></div></div>;
}

/** Services a technician can tick. The first four are what customers choose when they book. */
export const SKILL_SUGGESTIONS = ['ล้างแอร์มาตรฐาน', 'ล้างแอร์แบบแขวน', 'ล้างแอร์แบบแขวน (ฝังฝ้า)', 'ล้างแอร์ + ตรวจเช็ก', 'ล้างใหญ่ (ถอดล้าง)', 'เติมน้ำยาแอร์', 'ซ่อมแอร์', 'ติดตั้งแอร์'];

/** Numbers stay text while editing, so a box can be emptied and retyped without a stray 0. */
type PriceKey = keyof PriceSheet;
interface ServiceForm { title: string; area: string; prices: Record<PriceKey, string>; experienceYears: string; skills: string[]; availableText: string; phone: string }
type FieldKey = Exclude<keyof ServiceForm, 'skills' | 'prices'> | 'skills' | PriceKey;

/** The price list as customers' jobs need it: a price per unit for each kind of clean, then two per-unit additions. */
const priceRows: { kind: string; normal: PriceKey; deep: PriceKey }[] = [
  { kind: 'แอร์ติดผนัง', normal: 'wall', deep: 'wallDeep' },
  { kind: 'แอร์แขวน / ตั้งพื้น', normal: 'hanging', deep: 'hangingDeep' },
  { kind: 'แอร์ฝังฝ้า', normal: 'cassette', deep: 'cassetteDeep' },
];
const additions: { key: PriceKey; label: string }[] = [
  { key: 'large', label: 'แอร์ใหญ่กว่า 24,000 BTU' },
  { key: 'hardAccess', label: 'คอยล์ร้อนอยู่ที่สูง / เข้าถึงยาก' },
];
const priceKeys: PriceKey[] = ['wall', 'wallDeep', 'hanging', 'hangingDeep', 'cassette', 'cassetteDeep', 'large', 'hardAccess'];

const toForm = (p: TechnicianApplication): ServiceForm => {
  const sheet = p.prices ?? { ...referenceSheet, wall: p.basePrice || referenceSheet.wall };
  return {
    title: p.title, area: p.area, prices: Object.fromEntries(priceKeys.map(key => [key, String(sheet[key])])) as Record<PriceKey, string>,
    experienceYears: String(p.experienceYears ?? 0), skills: p.skills, availableText: p.availableText, phone: p.phone,
  };
};
const sameForm = (a: ServiceForm, b: ServiceForm) => JSON.stringify(a) === JSON.stringify(b);

function problemsOf(form: ServiceForm): Partial<Record<FieldKey, string>> {
  const years = Number(form.experienceYears || 0), phoneDigits = form.phone.replace(/\D/g, '').length;
  const problems: Partial<Record<FieldKey, string>> = {};
  if (!form.title.trim()) problems.title = 'บอกลูกค้าว่าคุณเชี่ยวชาญงานแบบไหน';
  for (const row of priceRows) {
    const normal = Number(form.prices[row.normal]), deep = Number(form.prices[row.deep]);
    if (!form.prices[row.normal] || normal < 50 || normal > 20000) problems[row.normal] = '50–20,000 บาท';
    if (!form.prices[row.deep] || deep < 50 || deep > 20000) problems[row.deep] = '50–20,000 บาท';
    else if (deep < normal) problems[row.deep] = 'ต้องไม่ต่ำกว่าล้างธรรมดา';
  }
  for (const item of additions) if (form.prices[item.key] === '' || Number(form.prices[item.key]) > 10000) problems[item.key] = '0–10,000 บาท';
  if (years > 60) problems.experienceYears = 'ไม่เกิน 60 ปี';
  if (!form.skills.length) problems.skills = 'เลือกบริการที่รับอย่างน้อย 1 อย่าง';
  else if (form.skills.join(', ').length > 500) problems.skills = 'รายการบริการยาวเกินไป ลองเอาบางอย่างออก';
  if (!form.area.trim()) problems.area = 'บอกย่านหรือเขตที่คุณรับงาน';
  if (!form.availableText.trim()) problems.availableText = 'บอกวันและเวลาที่สะดวกรับงาน';
  if (phoneDigits < 9 || phoneDigits > 15) problems.phone = 'เบอร์โทรศัพท์ 9–15 หลัก';
  return problems;
}

function Field({ id, label, hint, problem, children }: { id: string; label: string; hint?: string; problem?: string; children: ReactNode }) {
  return <div className={'pf-field' + (problem ? ' invalid' : '')}>
    <label htmlFor={id}>{label}</label>
    {children}
    {problem ? <small className="pf-field-problem" id={id + '-problem'}>{problem}</small> : hint && <small id={id + '-hint'}>{hint}</small>}
  </div>;
}

/**
 * The technician's public service details: what they do, price, area and hours, plus the phone number the admin
 * calls. A save bar appears once something changes; prices already offered on jobs are not touched.
 */
export default function ServiceProfileForm({ profile, onSaved }: { profile: TechnicianApplication; onSaved: (profile: TechnicianApplication) => void }) {
  const [base, setBase] = useState(() => toForm(profile));
  const [form, setForm] = useState(base);
  const [draft, setDraft] = useState('');
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { const next = toForm(profile); setBase(next); setForm(next); }, [profile]);
  useEffect(() => { if (!savedNote) return; const timer = window.setTimeout(() => setSavedNote(''), 4000); return () => window.clearTimeout(timer); }, [savedNote]);
  // What other technicians charge, next to each price, so the list can be set sensibly.
  const [guide, setGuide] = useState<PriceGuide | null>(null);
  useEffect(() => { if (isApiConfigured()) fetchPriceGuide().then(setGuide).catch(() => undefined); }, []);
  const setPrice = (key: PriceKey, value: string) => set('prices', { ...form.prices, [key]: numberText(value, { maxLength: 5 }) });
  const priceField = (key: PriceKey, label: string) => <Field id={`pf-${key}`} label={label} problem={problems[key]} hint={guide ? `${guide.reference ? 'ราคาอ้างอิง' : 'ช่างส่วนใหญ่'} ${baht(guide.typical[key])}` : undefined}>
    <div className="pf-affix"><span aria-hidden="true">฿</span>
      <input id={`pf-${key}`} inputMode="numeric" autoComplete="off" value={form.prices[key]} aria-invalid={!!problems[key]} aria-describedby={described(key, Boolean(guide))}
        onChange={event => setPrice(key, event.target.value)}/>
    </div>
  </Field>;

  const dirty = !sameForm(form, base);
  const problems = showProblems ? problemsOf(form) : {};
  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => { setForm(previous => ({ ...previous, [key]: value })); setSavedNote(''); setError(''); };
  const toggleSkill = (skill: string) => set('skills', form.skills.includes(skill) ? form.skills.filter(item => item !== skill) : [...form.skills, skill]);
  function addDraft() {
    const skill = draft.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (skill && !form.skills.includes(skill)) set('skills', [...form.skills, skill]);
    setDraft('');
  }
  function draftKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addDraft(); }
  }
  const described = (key: FieldKey, hint = false) => problems[key] ? `pf-${key}-problem` : hint ? `pf-${key}-hint` : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = problemsOf(form);
    if (Object.keys(found).length) {
      setShowProblems(true);
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('.pf-field.invalid input, .pf-field.invalid button')?.focus());
      return;
    }
    setSaving(true); setError('');
    try {
      const wasRejected = profile.verificationStatus === 'Rejected';
      const prices = Object.fromEntries(priceKeys.map(key => [key, Number(form.prices[key])])) as unknown as PriceSheet;
      const saved = await updateMyTechnicianProfile({
        title: form.title.trim(), area: form.area.trim(), basePrice: prices.wall, prices, availableText: form.availableText.trim(),
        skills: form.skills.join(', '), phone: form.phone.trim(), experienceYears: Number(form.experienceYears || 0),
      });
      setShowProblems(false);
      setSavedNote(wasRejected ? 'บันทึกแล้ว ส่งให้ผู้ดูแลตรวจอีกครั้ง' : 'บันทึกข้อมูลบริการแล้ว');
      onSaved(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSaving(false); }
  }

  const custom = form.skills.filter(skill => !SKILL_SUGGESTIONS.includes(skill));
  return <form className="pf-service" onSubmit={submit} ref={formRef} noValidate>
    {profile.verificationStatus !== 'Approved' && <VerificationBanner profile={profile}/>}

    <section className="pf-card" aria-labelledby="pf-public-title">
      <header className="pf-card-head"><h2 id="pf-public-title">ข้อมูลที่ลูกค้าเห็น</h2><p>ใช้แสดงคู่กับข้อเสนอที่คุณส่ง ราคาที่เปลี่ยนใช้กับข้อเสนอใหม่ ข้อเสนอที่ส่งไปแล้วคงเดิม</p></header>

      <Field id="pf-title" label="ชื่อบริการ / ความเชี่ยวชาญ" problem={problems.title}>
        <input id="pf-title" value={form.title} maxLength={120} placeholder="เช่น ช่างล้างแอร์บ้านและคอนโด" aria-invalid={!!problems.title} aria-describedby={described('title')}
          onChange={event => set('title', event.target.value)}/>
      </Field>

      <div className="pf-pair">
        <Field id="pf-years" label="ประสบการณ์" problem={problems.experienceYears}>
          <div className="pf-affix">
            <input id="pf-years" inputMode="numeric" autoComplete="off" value={form.experienceYears} placeholder="0" aria-invalid={!!problems.experienceYears} aria-describedby={described('experienceYears')}
              onChange={event => set('experienceYears', numberText(event.target.value, { maxLength: 2 }))}/>
            <span aria-hidden="true">ปี</span></div>
        </Field>
      </div>

      <div className={'pf-field' + (problems.skills ? ' invalid' : '')} role="group" aria-labelledby="pf-skills-label" aria-describedby={described('skills')}>
        <span className="pf-label" id="pf-skills-label">บริการที่รับ</span>
        <div className="pf-chips">
          {[...SKILL_SUGGESTIONS, ...custom].map(skill => {
            const on = form.skills.includes(skill);
            return <button type="button" key={skill} className={'pf-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggleSkill(skill)}>
              {on ? <Check size={15}/> : <Plus size={15}/>}{skill}
            </button>;
          })}
        </div>
        <div className="pf-chip-add">
          <input value={draft} maxLength={60} placeholder="บริการอื่น เช่น ล้างแอร์รถยนต์" aria-label="เพิ่มบริการอื่น" onChange={event => setDraft(event.target.value)} onKeyDown={draftKey}/>
          <button type="button" onClick={addDraft} disabled={!draft.trim()}><Plus size={16}/>เพิ่ม</button>
        </div>
        {problems.skills && <small className="pf-field-problem" id="pf-skills-problem">{problems.skills}</small>}
      </div>

      <Field id="pf-area" label="พื้นที่ให้บริการ" hint="ย่านหรือเขตที่สะดวกเดินทางไป งานใกล้ฉันยังค้นจาก GPS และระยะที่ตั้งไว้" problem={problems.area}>
        <input id="pf-area" value={form.area} maxLength={200} placeholder="เช่น ลาดพร้าว · จตุจักร · บางซื่อ" aria-invalid={!!problems.area} aria-describedby={described('area', true)}
          onChange={event => set('area', event.target.value)}/>
      </Field>
      <Field id="pf-hours" label="วันและเวลาที่รับงาน" problem={problems.availableText}>
        <input id="pf-hours" value={form.availableText} maxLength={120} placeholder="เช่น ทุกวัน 08:00–18:00" aria-invalid={!!problems.availableText} aria-describedby={described('availableText')}
          onChange={event => set('availableText', event.target.value)}/>
      </Field>
    </section>

    <section className="pf-card" aria-labelledby="pf-prices-title">
      <header className="pf-card-head"><h2 id="pf-prices-title">ใบราคาของคุณ</h2><p>ราคาต่อเครื่อง ระบบคิดราคาเสนอของแต่ละงานจากใบนี้ให้อัตโนมัติ และแสดงให้ลูกค้าเห็นทีละรายการ ถ้าหน้างานไม่ตรงกับที่ลูกค้าแจ้ง ราคาใหม่ก็คิดจากใบนี้</p></header>
      <div className="pf-prices">
        {priceRows.map(row => <fieldset key={row.normal} className="pf-price-row">
          <legend>{row.kind}</legend>
          {priceField(row.normal, 'ล้างธรรมดา')}
          {priceField(row.deep, 'ล้างใหญ่ (ถอดล้าง)')}
        </fieldset>)}
        <fieldset className="pf-price-row">
          <legend>บวกเพิ่มต่อเครื่อง</legend>
          {additions.map(item => <div key={item.key}>{priceField(item.key, item.label)}</div>)}
        </fieldset>
      </div>
      <p className="pf-price-note">ไม่ต้องใส่ราคาเติมน้ำยาหรือซ่อม งานเหล่านี้เสนอราคาที่หน้างานผ่านแอป และลูกค้าต้องกดอนุมัติก่อน</p>
    </section>

    <section className="pf-card" aria-labelledby="pf-contact-title">
      <header className="pf-card-head"><h2 id="pf-contact-title">เบอร์ติดต่อ</h2><p>ผู้ดูแลระบบใช้โทรยืนยันตัวตน ลูกค้าจะเห็นเบอร์นี้ก็ต่อเมื่อเลือกคุณรับงานแล้ว</p></header>
      <Field id="pf-phone" label="เบอร์โทรศัพท์" problem={problems.phone}>
        <input id="pf-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} maxLength={30} placeholder="08x-xxx-xxxx" aria-invalid={!!problems.phone} aria-describedby={described('phone')}
          onChange={event => set('phone', event.target.value)}/>
      </Field>
    </section>

    {error && <div className="pf-alert bad" role="alert"><XCircle size={17}/>{error}</div>}
    {(dirty || saving || savedNote) && <div className={'pf-savebar' + (dirty || saving ? '' : ' done')} role="status">
      {saving ? <Loader2 size={17} className="ui-spin"/> : dirty ? <span className="pf-savebar-dot" aria-hidden="true"/> : <CheckCircle2 size={17}/>}
      <span>{saving ? 'กำลังบันทึก…' : dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : savedNote}</span>
      {dirty && !saving && <button type="button" className="pf-savebar-undo" onClick={() => { setForm(base); setShowProblems(false); setError(''); }}>ยกเลิก</button>}
      {(dirty || saving) && <button type="submit" className="pf-savebar-save" disabled={saving}>บันทึก</button>}
    </div>}
  </form>;
}
