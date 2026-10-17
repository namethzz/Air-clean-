import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, IdCard, Loader2, MapPin, Send, Tags, Wrench } from 'lucide-react';
import type { AcKind, PriceGuide, TechnicianApplication, TechnicianDocument } from '../types';
import { fetchPriceGuide, isApiConfigured, submitTechnicianProfile, updateMyTechnicianProfile } from '../lib/api';
import { acKinds, baht, kindNames, referenceSheet } from '../lib/pricing';
import { numberText } from '../lib/numberText';
import { PageHead, Problem } from '../components/kit';
import TechnicianDocuments from '../components/TechnicianDocuments';
import { othersOf, priceProblems, PriceSheetEditor, serviceProblem, ServicesPicker, sheetOf, skillsOf, toPriceText, type PriceText, type Services } from '../components/TechnicianServices';

/**
 * A new technician's first screen: what they clean, their prices, where and when they work, and their ID card, one
 * step at a time, then "send for review". The admin hears about them only once it is sent. A draft is kept on this
 * device, so a closed tab does not lose the answers.
 */

export const DAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
const HOURS = Array.from({ length: 17 }, (_, index) => `${String(index + 6).padStart(2, '0')}:00`);
/** "จ.–ศ. 08:00–18:00", "ทุกวัน …", or the days listed. */
export function hoursText(days: number[], from: string, to: string): string {
  const sorted = [...days].sort((a, b) => a - b);
  const run = sorted.length > 2 && sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  const label = sorted.length === 7 ? 'ทุกวัน' : run ? `${DAYS[sorted[0]]}–${DAYS[sorted[sorted.length - 1]]}` : sorted.map(day => DAYS[day]).join(' ');
  return `${label} ${from}–${to}`;
}

interface Draft { services: Services; prices: PriceText; area: string; days: number[]; from: string; to: string; years: string; phone: string; title: string; }
const steps = [
  { title: 'งานที่รับ', icon: Wrench },
  { title: 'ราคา', icon: Tags },
  { title: 'พื้นที่และเวลา', icon: MapPin },
  { title: 'บัตรประชาชน', icon: IdCard },
  { title: 'ส่งตรวจ', icon: Send },
];
const UNSET_AREA = 'ยังไม่ระบุพื้นที่ให้บริการ';
const draftKey = (id: number) => `airclean.techSetup.${id}`;

function startFrom(profile: TechnicianApplication): Draft {
  return {
    services: { kinds: (profile.kinds ?? []) as AcKind[], deep: profile.offersDeep ?? true, others: othersOf(profile.skills) },
    prices: profile.pricesSet && profile.prices ? toPriceText(profile.prices) : { ...toPriceText(referenceSheet), wall: '', wallDeep: '', hanging: '', hangingDeep: '', cassette: '', cassetteDeep: '' },
    area: profile.area === UNSET_AREA ? '' : profile.area, days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '18:00',
    years: String(profile.experienceYears || ''), phone: profile.phone, title: profile.title === 'ช่างแอร์' ? '' : profile.title,
  };
}

export default function TechnicianSetup({ profile, onDone }: { profile: TechnicianApplication; onDone: (profile: TechnicianApplication) => void }) {
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = localStorage.getItem(draftKey(profile.id)); if (saved) return { ...startFrom(profile), ...JSON.parse(saved) as Draft }; } catch { /* private mode */ }
    return startFrom(profile);
  });
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [guide, setGuide] = useState<PriceGuide | null>(null);
  const [idCard, setIdCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (isApiConfigured()) fetchPriceGuide().then(setGuide).catch(() => undefined); }, []);
  useEffect(() => { try { localStorage.setItem(draftKey(profile.id), JSON.stringify(draft)); } catch { /* private mode */ } }, [draft, profile.id]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(previous => ({ ...previous, [key]: value })); setError(''); };

  const problems = useMemo(() => {
    const phoneDigits = draft.phone.replace(/\D/g, '').length;
    return {
      services: serviceProblem(draft.services),
      prices: priceProblems(draft.prices, draft.services),
      area: draft.area.trim().length < 2 ? 'บอกย่านหรือเขตที่คุณรับงาน เช่น ลาดพร้าว · จตุจักร' : undefined,
      days: draft.days.length ? undefined : 'เลือกวันที่รับงานอย่างน้อย 1 วัน',
      hours: draft.from >= draft.to ? 'เวลาเลิกต้องหลังเวลาเริ่ม' : undefined,
      years: Number(draft.years || 0) > 60 ? 'ไม่เกิน 60 ปี' : undefined,
      phone: phoneDigits < 9 || phoneDigits > 15 ? 'เบอร์โทรศัพท์ 9–15 หลัก' : undefined,
      idCard: idCard ? undefined : 'ถ่ายหรือเลือกรูปบัตรประชาชนก่อน',
    };
  }, [draft, idCard]);
  const stepProblems = [
    problems.services ? [problems.services] : [],
    Object.values(problems.prices),
    [problems.area, problems.days, problems.hours, problems.years, problems.phone].filter(Boolean),
    problems.idCard ? [problems.idCard] : [],
    [],
  ];
  const show = tried ? problems : { prices: {} } as Partial<typeof problems>;

  function go(next: number) {
    setTried(false); setError(''); setStep(next);
    window.requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  function next() {
    if (stepProblems[step].length) {
      setTried(true);
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.ts [aria-invalid="true"], .ts .ui-problem')?.focus?.());
      window.requestAnimationFrame(() => document.querySelector('.ts .ui-problem, .ts .is-problem')?.scrollIntoView({ block: 'center' }));
      return;
    }
    go(step + 1);
  }
  async function send() {
    const first = stepProblems.findIndex(list => list.length);
    if (first >= 0 && first < 4) { go(first); setTried(true); return; }
    setBusy(true); setError('');
    try {
      const sheet = sheetOf(draft.prices, draft.services, guide);
      const kinds = acKinds.filter(kind => draft.services.kinds.includes(kind));
      await updateMyTechnicianProfile({
        title: draft.title.trim() || `ช่างล้างแอร์${kinds.map(kind => kindNames[kind]).join(' ')}`,
        area: draft.area.trim(), basePrice: sheet.wall, prices: sheet, kinds, offersDeep: draft.services.deep,
        availableText: hoursText(draft.days, draft.from, draft.to), skills: skillsOf(draft.services).join(', '),
        phone: draft.phone.trim(), experienceYears: Number(draft.years || 0),
      });
      const sent = await submitTechnicianProfile();
      try { localStorage.removeItem(draftKey(profile.id)); } catch { /* private mode */ }
      onDone(sent);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ส่งไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setBusy(false); }
  }

  const kinds = acKinds.filter(kind => draft.services.kinds.includes(kind));
  const summary = sheetOf(draft.prices, draft.services, guide);
  const toggleDay = (day: number) => set('days', draft.days.includes(day) ? draft.days.filter(item => item !== day) : [...draft.days, day]);

  return <div className="ui-page is-narrow ts" ref={top}>
    <PageHead title="ตั้งค่างานและราคาของคุณ">บอกว่ารับงานแบบไหน คิดราคาเท่าไร และรับงานที่ไหน ใช้เวลาประมาณ 3 นาที ผู้ดูแลจะตรวจหลังคุณกดส่ง</PageHead>

    <ol className="ts-steps" aria-label="ขั้นตอน">
      {steps.map((item, index) => {
        const done = index < step, now = index === step;
        return <li key={item.title} className={now ? 'is-now' : done ? 'is-done' : undefined} aria-current={now ? 'step' : undefined}>
          {done ? <button type="button" onClick={() => go(index)} aria-label={`กลับไปแก้${item.title}`}><span className="ts-step-num"><Check size={16}/></span><span className="ts-step-label">{item.title}</span></button>
            : <span className="ts-step-static"><span className="ts-step-num ui-num">{index + 1}</span><span className="ts-step-label">{item.title}</span></span>}
        </li>;
      })}
    </ol>

    <section className="ui-card ts-card" aria-labelledby="ts-step-title">
      <header className="ts-card-head">
        <span className="ts-card-step ui-num">ขั้นที่ {step + 1} จาก {steps.length}</span>
        <h2 id="ts-step-title">{['คุณรับงานแบบไหนบ้าง', 'ตั้งราคาของคุณ', 'รับงานที่ไหน เมื่อไร', 'ยืนยันตัวตน', 'ตรวจแล้วส่งให้ผู้ดูแล'][step]}</h2>
        <p>{[
          'เลือกแอร์ที่คุณล้างได้ ระบบจะส่งเฉพาะงานที่ตรงกับคุณ',
          'ราคาต่อเครื่อง ระบบคิดราคาเสนอแต่ละงานจากตรงนี้ ลูกค้าเห็นทีละรายการ และราคาที่ตกลงแล้วเปลี่ยนเองไม่ได้',
          'ลูกค้าเห็นพื้นที่และเวลาที่คุณสะดวก ผู้ดูแลอาจโทรยืนยันตามเบอร์นี้',
          'รูปบัตรใช้ตรวจตัวตนก่อนอนุมัติเท่านั้น ผู้ดูแลเห็นได้คนเดียว ลูกค้าไม่เห็น',
          'ผู้ดูแลจะตรวจและอาจโทรหาคุณ เมื่ออนุมัติแล้วคุณจะเห็นงานใกล้ตัวทันที',
        ][step]}</p>
      </header>

      {step === 0 && <ServicesPicker value={draft.services} onChange={value => set('services', value)} problem={show.services} idPrefix="ts"/>}
      {step === 1 && <PriceSheetEditor services={draft.services} value={draft.prices} onChange={value => set('prices', value)} guide={guide} problems={show.prices} idPrefix="ts"/>}
      {step === 2 && <div className="ts-where">
        <div className="ui-field">
          <label htmlFor="ts-area">พื้นที่ที่รับงาน</label>
          <input id="ts-area" className="ui-input" value={draft.area} maxLength={200} placeholder="เช่น ลาดพร้าว · จตุจักร · บางซื่อ" aria-invalid={show.area ? true : undefined} onChange={event => set('area', event.target.value)}/>
          {show.area ? <Problem>{show.area}</Problem> : <small>งานใกล้ฉันค้นจาก GPS ของคุณด้วย พื้นที่นี้ช่วยให้ลูกค้ารู้ว่าคุณสะดวกที่ไหน</small>}
        </div>
        <fieldset className="ts-group">
          <legend>วันที่รับงาน</legend>
          <div className="ts-days">
            {DAYS.map((day, index) => <button type="button" key={day} className="ui-chip" aria-pressed={draft.days.includes(index)} onClick={() => toggleDay(index)}>{day}</button>)}
          </div>
          {show.days && <Problem>{show.days}</Problem>}
        </fieldset>
        <div className="ts-hours">
          <div className="ui-field"><label htmlFor="ts-from">ตั้งแต่</label><select id="ts-from" className="ui-select" value={draft.from} onChange={event => set('from', event.target.value)}>{HOURS.map(hour => <option key={hour}>{hour}</option>)}</select></div>
          <div className="ui-field"><label htmlFor="ts-to">ถึง</label><select id="ts-to" className="ui-select" value={draft.to} aria-invalid={show.hours ? true : undefined} onChange={event => set('to', event.target.value)}>{HOURS.map(hour => <option key={hour}>{hour}</option>)}</select></div>
        </div>
        {show.hours && <Problem>{show.hours}</Problem>}
        <div className="ts-pair">
          <div className="ui-field">
            <label htmlFor="ts-phone">เบอร์โทรศัพท์</label>
            <input id="ts-phone" className="ui-input" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} maxLength={30} placeholder="08x-xxx-xxxx" aria-invalid={show.phone ? true : undefined} onChange={event => set('phone', event.target.value)}/>
            {show.phone && <Problem>{show.phone}</Problem>}
          </div>
          <div className="ui-field">
            <label htmlFor="ts-years">ประสบการณ์ (ปี)</label>
            <input id="ts-years" className="ui-input" inputMode="numeric" autoComplete="off" value={draft.years} placeholder="เช่น 5" aria-invalid={show.years ? true : undefined} onChange={event => set('years', numberText(event.target.value, { maxLength: 2 }))}/>
            {show.years && <Problem>{show.years}</Problem>}
          </div>
        </div>
        <div className="ui-field">
          <label htmlFor="ts-title">ชื่อร้านหรือคำอธิบายสั้น ๆ <em>ไม่บังคับ</em></label>
          <input id="ts-title" className="ui-input" value={draft.title} maxLength={120} placeholder="เช่น ช่างล้างแอร์บ้านและคอนโด" onChange={event => set('title', event.target.value)}/>
        </div>
      </div>}
      {step === 3 && <div className="ts-id">
        <TechnicianDocuments onChange={(documents: TechnicianDocument[]) => setIdCard(documents.some(item => item.kind === 'idcard'))}/>
        {show.idCard && <Problem>{show.idCard}</Problem>}
      </div>}
      {step === 4 && <dl className="ts-review">
        <Review title="งานที่รับ" onEdit={() => go(0)}>
          {kinds.map(kind => 'แอร์' + kindNames[kind]).join(' · ')}{draft.services.deep ? ' · รับล้างใหญ่' : ' · ล้างธรรมดาเท่านั้น'}
          {draft.services.others.length > 0 && <><br/><span className="ts-muted">งานอื่น: {draft.services.others.join(', ')}</span></>}
        </Review>
        <Review title="ราคาต่อเครื่อง" onEdit={() => go(1)}>
          {kinds.map(kind => <span key={kind} className="ts-review-price">แอร์{kindNames[kind]} <b className="ui-num">{baht(summary[kind])}</b>{draft.services.deep && <> · ล้างใหญ่ <b className="ui-num">{baht(summary[kind === 'wall' ? 'wallDeep' : kind === 'hanging' ? 'hangingDeep' : 'cassetteDeep'])}</b></>}</span>)}
          <span className="ts-muted">คิดเพิ่ม: แอร์ใหญ่ {baht(summary.large)} · เข้าถึงยาก {baht(summary.hardAccess)}</span>
        </Review>
        <Review title="พื้นที่และเวลา" onEdit={() => go(2)}>{draft.area} · {hoursText(draft.days, draft.from, draft.to)}<br/><span className="ts-muted">โทร {draft.phone}{draft.years ? ` · ประสบการณ์ ${draft.years} ปี` : ''}</span></Review>
        <Review title="บัตรประชาชน" onEdit={() => go(3)}>{idCard ? <span className="ts-ok"><CheckCircle2 size={16}/> ส่งรูปแล้ว</span> : 'ยังไม่ได้ส่ง'}</Review>
      </dl>}

      {error && <div className="ui-alert is-problem" role="alert"><span>{error}</span></div>}
    </section>

    <div className="ts-foot">
      {step > 0 && <button type="button" className="ui-btn is-lg ts-back" onClick={() => go(step - 1)} disabled={busy}><ArrowLeft size={22} aria-hidden="true"/><span className="ts-back-text">ย้อนกลับ</span></button>}
      {step < 4
        ? <button type="button" className="ui-btn is-primary is-lg ts-next" onClick={next}>
            <span className="ts-next-text"><small>ถัดไป</small><span>{steps[step + 1].title}</span></span><ArrowRight size={22} aria-hidden="true"/></button>
        : <button type="button" className="ui-btn is-primary is-lg ts-next" onClick={() => void send()} disabled={busy} aria-busy={busy}>
            <span className="ts-next-text"><small>ขั้นสุดท้าย</small><span>{busy ? 'กำลังส่ง…' : 'ส่งให้ผู้ดูแลตรวจ'}</span></span>
            {busy ? <Loader2 size={22} className="animate-spin" aria-hidden="true"/> : <Send size={22} aria-hidden="true"/>}</button>}
    </div>
  </div>;
}

function Review({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return <div className="ts-review-row">
    <dt>{title}</dt>
    <dd>{children}</dd>
    <button type="button" className="ui-btn is-ghost is-sm" onClick={onEdit} aria-label={`แก้${title}`}>แก้</button>
  </div>;
}
