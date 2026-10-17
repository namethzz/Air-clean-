import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { fetchPriceGuide, isApiConfigured, updateMyTechnicianProfile } from '../lib/api';
import { numberText } from '../lib/numberText';
import { acKinds, referenceSheet } from '../lib/pricing';
import type { AcKind, PriceGuide, TechnicianApplication } from '../types';
import { othersOf, priceProblems, PriceSheetEditor, serviceProblem, ServicesPicker, sheetOf, skillsOf, toPriceText, type PriceKey, type PriceText, type Services } from './TechnicianServices';
import TechnicianSetup from '../pages/TechnicianSetup';

/** Where the technician's application stands with the admin. */
export function VerificationBanner({ profile }: { profile: TechnicianApplication }) {
  if (profile.verificationStatus === 'Approved') return <div className="ui-alert is-done" role="status"><CheckCircle2 size={18}/><span><strong>ผ่านการตรวจสอบแล้ว</strong>คุณดูงานใกล้ตัวและส่งข้อเสนอได้</span></div>;
  if (profile.verificationStatus === 'Rejected') return <div className="ui-alert is-problem" role="alert"><XCircle size={18}/><span><strong>ยังไม่ผ่านการตรวจสอบ</strong>เหตุผล: {profile.verificationNote || 'กรุณาตรวจข้อมูลอีกครั้ง'} — แก้ไขข้อมูลด้านล่างแล้วกดบันทึก ระบบจะส่งให้ผู้ดูแลตรวจอีกครั้ง</span></div>;
  return <div className="ui-alert is-wait" role="status"><Clock3 size={18}/><span><strong>รอผู้ดูแลระบบตรวจสอบ</strong>ผู้ดูแลอาจโทรยืนยันตามเบอร์ที่ให้ไว้ เมื่ออนุมัติแล้วจะเห็นงานใกล้ตัวทันที</span></div>;
}

/** Numbers stay text while editing, so a box can be emptied and retyped without a stray 0. */
interface ServiceForm { title: string; area: string; services: Services; prices: PriceText; experienceYears: string; availableText: string; phone: string }
type FieldKey = 'title' | 'area' | 'experienceYears' | 'availableText' | 'phone' | 'services' | PriceKey;

const toForm = (p: TechnicianApplication): ServiceForm => ({
  title: p.title, area: p.area, experienceYears: String(p.experienceYears ?? 0), availableText: p.availableText, phone: p.phone,
  services: { kinds: (p.kinds?.length ? p.kinds : [...acKinds]) as AcKind[], deep: p.offersDeep ?? true, others: othersOf(p.skills) },
  prices: toPriceText(p.prices ?? { ...referenceSheet, wall: p.basePrice || referenceSheet.wall }),
});
const sameForm = (a: ServiceForm, b: ServiceForm) => JSON.stringify(a) === JSON.stringify(b);

function problemsOf(form: ServiceForm): Partial<Record<FieldKey, string>> {
  const years = Number(form.experienceYears || 0), phoneDigits = form.phone.replace(/\D/g, '').length;
  const problems: Partial<Record<FieldKey, string>> = { ...priceProblems(form.prices, form.services) };
  if (!form.title.trim()) problems.title = 'บอกลูกค้าว่าคุณเชี่ยวชาญงานแบบไหน';
  const service = serviceProblem(form.services);
  if (service) problems.services = service;
  if (years > 60) problems.experienceYears = 'ไม่เกิน 60 ปี';
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
  // Until the first setup is sent, this page is that setup.
  if (profile.needsSetup) return <TechnicianSetup profile={profile} onDone={onSaved}/>;
  return <ServiceEditor profile={profile} onSaved={onSaved}/>;
}

function ServiceEditor({ profile, onSaved }: { profile: TechnicianApplication; onSaved: (profile: TechnicianApplication) => void }) {
  const [base, setBase] = useState(() => toForm(profile));
  const [form, setForm] = useState(base);
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

  const dirty = !sameForm(form, base);
  const problems = showProblems ? problemsOf(form) : {};
  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => { setForm(previous => ({ ...previous, [key]: value })); setSavedNote(''); setError(''); };
  const described = (key: FieldKey, hint = false) => problems[key] ? `pf-${key}-problem` : hint ? `pf-${key}-hint` : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = problemsOf(form);
    if (Object.keys(found).length) {
      setShowProblems(true);
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('.pf-field.invalid input, [aria-invalid="true"], .ui-problem')?.focus?.());
      return;
    }
    setSaving(true); setError('');
    try {
      const wasRejected = profile.verificationStatus === 'Rejected';
      const prices = sheetOf(form.prices, form.services, guide);
      const saved = await updateMyTechnicianProfile({
        title: form.title.trim(), area: form.area.trim(), basePrice: prices.wall, prices, availableText: form.availableText.trim(),
        kinds: acKinds.filter(kind => form.services.kinds.includes(kind)), offersDeep: form.services.deep,
        skills: skillsOf(form.services).join(', '), phone: form.phone.trim(), experienceYears: Number(form.experienceYears || 0),
      });
      setShowProblems(false);
      setSavedNote(wasRejected ? 'บันทึกแล้ว ส่งให้ผู้ดูแลตรวจอีกครั้ง' : 'บันทึกข้อมูลบริการแล้ว');
      onSaved(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSaving(false); }
  }

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

      <Field id="pf-area" label="พื้นที่ให้บริการ" hint="ย่านหรือเขตที่สะดวกเดินทางไป งานใกล้ฉันยังค้นจาก GPS และระยะที่ตั้งไว้" problem={problems.area}>
        <input id="pf-area" value={form.area} maxLength={200} placeholder="เช่น ลาดพร้าว · จตุจักร · บางซื่อ" aria-invalid={!!problems.area} aria-describedby={described('area', true)}
          onChange={event => set('area', event.target.value)}/>
      </Field>
      <Field id="pf-hours" label="วันและเวลาที่รับงาน" problem={problems.availableText}>
        <input id="pf-hours" value={form.availableText} maxLength={120} placeholder="เช่น ทุกวัน 08:00–18:00" aria-invalid={!!problems.availableText} aria-describedby={described('availableText')}
          onChange={event => set('availableText', event.target.value)}/>
      </Field>
    </section>

    <section className="pf-card" aria-labelledby="pf-services-title">
      <header className="pf-card-head"><h2 id="pf-services-title">งานที่รับ</h2><p>คุณเห็นเฉพาะงานที่มีแอร์แบบที่เลือก ถ้าไม่รับล้างใหญ่ จะไม่เห็นงานที่ลูกค้าขอล้างใหญ่</p></header>
      <ServicesPicker value={form.services} onChange={value => set('services', value)} problem={problems.services} idPrefix="pf"/>
    </section>

    <section className="pf-card" aria-labelledby="pf-prices-title">
      <header className="pf-card-head"><h2 id="pf-prices-title">ใบราคาของคุณ</h2><p>ราคาต่อเครื่อง ระบบคิดราคาเสนอของแต่ละงานจากใบนี้ให้อัตโนมัติ และแสดงให้ลูกค้าเห็นทีละรายการ ถ้าหน้างานไม่ตรงกับที่ลูกค้าแจ้ง ราคาใหม่ก็คิดจากใบนี้</p></header>
      <PriceSheetEditor services={form.services} value={form.prices} onChange={value => set('prices', value)} guide={guide} problems={problems} idPrefix="pf"/>
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
