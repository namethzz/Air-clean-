import { useState, type KeyboardEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { AcKind, PriceGuide, PriceSheet } from '../types';
import { AcIcon } from './Pricing';
import { acKinds, baht, kindNames, priceLines, referenceSheet, total } from '../lib/pricing';
import { numberText } from '../lib/numberText';
import './Setup.css';

/**
 * What a technician does and what they charge, as two pieces the sign-up setup and the profile page share: the kinds
 * of unit they clean (jobs with any other kind are not shown to them), deep cleans or not, other work they take,
 * and a price for each of those, with what most technicians charge beside it.
 */

export type PriceKey = keyof PriceSheet;
export type PriceText = Record<PriceKey, string>;
export const priceKeys: PriceKey[] = ['wall', 'wallDeep', 'hanging', 'hangingDeep', 'cassette', 'cassetteDeep', 'large', 'hardAccess'];
const deepKey: Record<AcKind, PriceKey> = { wall: 'wallDeep', hanging: 'hangingDeep', cassette: 'cassetteDeep' };
const kindHints: Record<AcKind, string> = { wall: 'แบบที่บ้านและคอนโดใช้มากที่สุด', hanging: 'ตัวใหญ่ แขวนใต้ฝ้าหรือตั้งพื้น', cassette: 'อยู่ในฝ้า ลมออก 4 ทาง พบในร้านและออฟฟิศ' };

/** Work beyond cleaning: priced on site through the app, so it is a list here, not a price. */
export const OTHER_SERVICES = ['เติมน้ำยาแอร์', 'ซ่อมแอร์ / หาจุดรั่ว', 'เปลี่ยนอะไหล่', 'ติดตั้งแอร์', 'ย้ายแอร์'];
/** The cleaning lines the skills list gets from the kinds; anything else in it is "other work". */
const cleanSkill: Record<AcKind, string> = { wall: 'ล้างแอร์ติดผนัง', hanging: 'ล้างแอร์แขวน / ตั้งพื้น', cassette: 'ล้างแอร์ฝังฝ้า' };
const DEEP_SKILL = 'ล้างใหญ่ (ถอดล้าง)';
const OLD_CLEAN_SKILLS = ['ล้างแอร์มาตรฐาน', 'ล้างแอร์ผนัง', 'ล้างแอร์แบบแขวน', 'ล้างแอร์แบบแขวน (ฝังฝ้า)', 'ล้างแอร์ + ตรวจเช็ก'];

export interface Services { kinds: AcKind[]; deep: boolean; others: string[]; }

/** The skills shown to customers, written from what the technician picked. */
export function skillsOf(services: Services): string[] {
  return [...acKinds.filter(kind => services.kinds.includes(kind)).map(kind => cleanSkill[kind]), ...(services.deep ? [DEEP_SKILL] : []), ...services.others];
}
/** The "other work" part of a saved skills list. */
export function othersOf(skills: string[]): string[] {
  const derived = new Set<string>([...Object.values(cleanSkill), DEEP_SKILL, ...OLD_CLEAN_SKILLS]);
  return skills.filter(skill => !derived.has(skill));
}

export const toPriceText = (sheet: PriceSheet): PriceText => Object.fromEntries(priceKeys.map(key => [key, String(sheet[key])])) as PriceText;
/**
 * The full list the server keeps. Prices for kinds the technician does not take, or deep cleans they do not do, are
 * never quoted (those jobs are not shown to them); they are kept at the typical price so the list stays whole.
 */
export function sheetOf(text: PriceText, services: Services, guide?: PriceGuide | null): PriceSheet {
  const typical = guide?.typical ?? referenceSheet;
  const sheet = Object.fromEntries(priceKeys.map(key => [key, Number(text[key]) || typical[key]])) as unknown as PriceSheet;
  for (const kind of acKinds) {
    if (!services.kinds.includes(kind)) { sheet[kind] = typical[kind]; sheet[deepKey[kind]] = Math.max(typical[deepKey[kind]], typical[kind]); }
    else if (!services.deep) sheet[deepKey[kind]] = Math.max(sheet[kind], typical[deepKey[kind]]);
  }
  return sheet;
}

export function serviceProblem(services: Services): string | undefined {
  if (!services.kinds.length) return 'เลือกแอร์ที่คุณรับล้างอย่างน้อย 1 แบบ';
  if (skillsOf(services).join(', ').length > 500) return 'รายการงานยาวเกินไป ลองเอาบางอย่างออก';
  return undefined;
}
export function priceProblems(text: PriceText, services: Services): Partial<Record<PriceKey, string>> {
  const problems: Partial<Record<PriceKey, string>> = {};
  for (const kind of services.kinds) {
    const normal = Number(text[kind]);
    if (!text[kind] || normal < 50 || normal > 20000) problems[kind] = 'ใส่ราคา 50–20,000 บาท';
    if (services.deep) {
      const deep = Number(text[deepKey[kind]]);
      if (!text[deepKey[kind]] || deep < 50 || deep > 20000) problems[deepKey[kind]] = 'ใส่ราคา 50–20,000 บาท';
      else if (deep < normal) problems[deepKey[kind]] = 'ต้องไม่ต่ำกว่าล้างธรรมดา';
    }
  }
  for (const key of ['large', 'hardAccess'] as PriceKey[]) if (text[key] === '' || Number(text[key]) > 10000) problems[key] = 'ใส่ 0–10,000 บาท (ไม่คิดเพิ่มใส่ 0)';
  return problems;
}

/** The kinds of unit, deep cleans, and other work. */
export function ServicesPicker({ value, onChange, problem, idPrefix = 'sv' }: { value: Services; onChange: (next: Services) => void; problem?: string; idPrefix?: string }) {
  const [draft, setDraft] = useState('');
  const toggleKind = (kind: AcKind) => onChange({ ...value, kinds: value.kinds.includes(kind) ? value.kinds.filter(item => item !== kind) : [...value.kinds, kind] });
  const toggleOther = (skill: string) => onChange({ ...value, others: value.others.includes(skill) ? value.others.filter(item => item !== skill) : [...value.others, skill] });
  const custom = value.others.filter(skill => !OTHER_SERVICES.includes(skill));
  function addDraft() {
    const skill = draft.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (skill && !value.others.includes(skill)) onChange({ ...value, others: [...value.others, skill] });
    setDraft('');
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); addDraft(); } };
  return <div className="ts-services">
    <fieldset className="ts-group" aria-describedby={problem ? `${idPrefix}-kinds-problem` : undefined}>
      <legend>แอร์ที่คุณรับล้าง <em>เลือกได้หลายแบบ</em></legend>
      <p className="ts-note">คุณจะเห็นเฉพาะงานที่มีแอร์แบบที่เลือก</p>
      <div className="ts-kinds">
        {acKinds.map(kind => <label key={kind} className="ui-option ts-kind">
          <input type="checkbox" checked={value.kinds.includes(kind)} onChange={() => toggleKind(kind)}/>
          <span className="ui-option-text"><strong>แอร์{kindNames[kind]}</strong><small>{kindHints[kind]}</small></span>
          <AcIcon kind={kind}/>
        </label>)}
      </div>
      {problem && <p className="ui-problem" id={`${idPrefix}-kinds-problem`} role="alert">{problem}</p>}
    </fieldset>

    <fieldset className="ts-group">
      <legend>รับล้างใหญ่ (ถอดล้าง) ไหม</legend>
      <p className="ts-note">ถอดฝาครอบ ถาดน้ำทิ้ง และพัดลมกรงกระรอกออกมาล้าง ลูกค้าเลือกเมื่อแอร์มีกลิ่นหรือไม่ได้ล้างนาน</p>
      <div className="ts-yesno">
        {[true, false].map(yes => <label key={String(yes)} className="ui-option">
          <input type="radio" name={`${idPrefix}-deep`} checked={value.deep === yes} onChange={() => onChange({ ...value, deep: yes })}/>
          <span className="ui-option-text"><strong>{yes ? 'รับล้างใหญ่ด้วย' : 'ล้างธรรมดาอย่างเดียว'}</strong><small>{yes ? 'ตั้งราคาล้างใหญ่แยกในขั้นถัดไป' : 'ไม่เห็นงานที่ลูกค้าขอล้างใหญ่'}</small></span>
        </label>)}
      </div>
    </fieldset>

    <fieldset className="ts-group">
      <legend>งานอื่นที่ทำได้ <em>ไม่บังคับ</em></legend>
      <p className="ts-note">ลูกค้าเห็นในโปรไฟล์ของคุณ งานพวกนี้ไม่ต้องตั้งราคาไว้ก่อน ถ้าหน้างานต้องทำ คุณขอราคาในแอปและลูกค้ากดอนุมัติก่อน</p>
      <div className="ts-chips">
        {[...OTHER_SERVICES, ...custom].map(skill => {
          const on = value.others.includes(skill);
          return <button type="button" key={skill} className="ui-chip" aria-pressed={on} onClick={() => toggleOther(skill)}>
            {on ? <Check size={16} aria-hidden="true"/> : <Plus size={16} aria-hidden="true"/>}{skill}
            {on && custom.includes(skill) && <X size={14} aria-hidden="true"/>}
          </button>;
        })}
      </div>
      <div className="ts-add">
        <input className="ui-input" value={draft} maxLength={60} placeholder="งานอื่น เช่น ล้างแอร์รถยนต์" aria-label="เพิ่มงานอื่น" onChange={event => setDraft(event.target.value)} onKeyDown={onKey}/>
        <button type="button" className="ui-btn" onClick={addDraft} disabled={!draft.trim()}><Plus size={18}/> เพิ่ม</button>
      </div>
    </fieldset>
  </div>;
}

/** One price box with what most technicians charge for it, and a tap to use that price. */
function PriceBox({ id, label, value, onChange, typical, problem, reference, allowZero }: {
  id: string; label: string; value: string; onChange: (value: string) => void; typical?: number; problem?: string; reference?: boolean; allowZero?: boolean;
}) {
  return <div className="ts-price">
    <label htmlFor={id}>{label}</label>
    <div className={'ts-price-box' + (problem ? ' is-invalid' : '')}>
      <span aria-hidden="true">฿</span>
      <input id={id} className="ui-num" inputMode="numeric" autoComplete="off" value={value} placeholder={allowZero ? '0' : typical ? String(typical) : ''}
        aria-invalid={problem ? true : undefined} aria-describedby={`${id}-note`} onChange={event => onChange(numberText(event.target.value, { maxLength: 5 }))}/>
    </div>
    <small id={`${id}-note`} className={problem ? 'is-problem' : undefined}>
      {problem ?? (typical != null ? <>{reference ? 'ราคาอ้างอิง' : 'ช่างส่วนใหญ่คิด'} {baht(typical)}{String(typical) !== value && <> · <button type="button" className="ui-link" onClick={() => onChange(String(typical))}>ใช้ราคานี้</button></>}</> : null)}
    </small>
  </div>;
}

/** The prices for what the technician picked, then a worked example of a typical job. */
export function PriceSheetEditor({ services, value, onChange, guide, problems = {}, idPrefix = 'pr' }: {
  services: Services; value: PriceText; onChange: (next: PriceText) => void; guide?: PriceGuide | null; problems?: Partial<Record<PriceKey, string>>; idPrefix?: string;
}) {
  const set = (key: PriceKey, text: string) => onChange({ ...value, [key]: text });
  const typical = guide?.typical;
  const kinds = acKinds.filter(kind => services.kinds.includes(kind));
  const sheet = sheetOf(value, services, guide);
  const example = kinds[0] ?? 'wall';
  const standard = total(priceLines(sheet, [{ kind: example, count: 2, large: 0 }], false, 0));
  const deep = total(priceLines(sheet, [{ kind: example, count: 2, large: 0 }], true, 0));
  return <div className="ts-prices">
    {kinds.map(kind => <fieldset key={kind} className="ts-price-row">
      <legend><AcIcon kind={kind}/>แอร์{kindNames[kind]} <em>ราคาต่อเครื่อง</em></legend>
      <div className="ts-price-pair">
        <PriceBox id={`${idPrefix}-${kind}`} label="ล้างธรรมดา" value={value[kind]} onChange={text => set(kind, text)} typical={typical?.[kind]} reference={guide?.reference} problem={problems[kind]}/>
        {services.deep && <PriceBox id={`${idPrefix}-${deepKey[kind]}`} label="ล้างใหญ่ (ถอดล้าง)" value={value[deepKey[kind]]} onChange={text => set(deepKey[kind], text)} typical={typical?.[deepKey[kind]]} reference={guide?.reference} problem={problems[deepKey[kind]]}/>}
      </div>
    </fieldset>)}
    <fieldset className="ts-price-row">
      <legend>คิดเพิ่มต่อเครื่อง <em>ไม่คิดเพิ่มใส่ 0</em></legend>
      <div className="ts-price-pair">
        <PriceBox id={`${idPrefix}-large`} label="แอร์ใหญ่กว่า 24,000 BTU" value={value.large} onChange={text => set('large', text)} typical={typical?.large} reference={guide?.reference} problem={problems.large} allowZero/>
        <PriceBox id={`${idPrefix}-hardAccess`} label="คอยล์ร้อนอยู่ที่สูง / เข้าถึงยาก" value={value.hardAccess} onChange={text => set('hardAccess', text)} typical={typical?.hardAccess} reference={guide?.reference} problem={problems.hardAccess} allowZero/>
      </div>
    </fieldset>
    {kinds.length > 0 && <div className="ts-example" aria-live="polite">
      <span>ลูกค้าจะเห็นราคาของคุณแบบนี้ เช่น แอร์{kindNames[example]} 2 เครื่อง</span>
      <strong className="ui-num">{baht(standard)}</strong><small>ล้างธรรมดา</small>
      {services.deep && <><strong className="ui-num">{baht(deep)}</strong><small>ล้างใหญ่</small></>}
    </div>}
  </div>;
}
