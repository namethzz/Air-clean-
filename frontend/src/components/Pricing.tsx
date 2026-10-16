import { Check, Minus, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { AcKind, JobItem, PriceLine, PriceSheet } from '../types';
import { baht, included, kindNames, notIncluded, perUnit } from '../lib/pricing';
import './Pricing.css';

/**
 * Pieces for describing a job and reading its price: the units by kind, standard or deep clean, and a price line by
 * line. Customers use them to ask for a technician; technicians use the same pieces to correct a job on site.
 */

export type UnitSize = 'normal' | 'large' | 'unknown';
/** One row of the editor: a kind, how many, and their size (large is over 24,000 BTU). */
export interface UnitRow { id: number; kind: AcKind; count: number; size: UnitSize; }

const kindHints: Record<AcKind, string> = { wall: 'แบบที่พบบ่อยที่สุด', hanging: 'ตัวใหญ่ ลมออกด้านหน้า', cassette: 'อยู่ในฝ้า ลมออก 4 ด้าน' };

export function AcIcon({ kind }: { kind: AcKind }) {
  // Simple drawings so people can match what is on their wall or ceiling.
  return <svg className="rq-type-icon" viewBox="0 0 64 40" aria-hidden="true">
    {kind === 'wall' && <><rect x="6" y="10" width="52" height="18" rx="5"/><path d="M12 23h40"/></>}
    {kind === 'hanging' && <><path d="M4 6h56"/><rect x="8" y="9" width="48" height="20" rx="4"/><path d="M14 24h36M14 19h36"/></>}
    {kind === 'cassette' && <><path d="M4 8h56"/><rect x="14" y="8" width="36" height="20" rx="2"/><rect x="22" y="13" width="20" height="10" rx="1"/></>}
  </svg>;
}

export const rowsToItems = (rows: UnitRow[]): JobItem[] => rows.map(row => ({ kind: row.kind, count: row.count, large: row.size === 'large' ? row.count : 0 }));
let nextRowId = 1;
export const newRow = (kind: AcKind = 'wall', count = 1, size: UnitSize = 'unknown'): UnitRow => ({ id: nextRowId++, kind, count, size });
/** Rows for the editor from a job's items (a technician correcting what the customer described). */
export function itemsToRows(items: JobItem[]): UnitRow[] {
  return items.flatMap(item => {
    const large = Math.min(item.large, item.count);
    const rows: UnitRow[] = [];
    if (item.count - large > 0) rows.push(newRow(item.kind, item.count - large, 'normal'));
    if (large > 0) rows.push(newRow(item.kind, large, 'large'));
    return rows;
  });
}

function Stepper({ value, min, max, label, onChange, readOnly }: { value: number; min: number; max: number; label: string; onChange: (value: number) => void; readOnly?: boolean }) {
  return <div className="rq-stepper is-sm" role="group" aria-label={label}>
    <button type="button" aria-label="ลดจำนวน" disabled={readOnly || value <= min} onClick={() => onChange(value - 1)}><Minus size={20}/></button>
    <input className="ui-num" inputMode="numeric" pattern="[0-9]*" aria-label={label} value={value} readOnly={readOnly}
      onChange={event => { const typed = Number.parseInt(event.target.value.replace(/[^0-9]/g, ''), 10); if (Number.isFinite(typed)) onChange(Math.max(min, Math.min(max, typed))); }}
      onFocus={event => event.currentTarget.select()}/>
    <button type="button" aria-label="เพิ่มจำนวน" disabled={readOnly || value >= max} onClick={() => onChange(value + 1)}><Plus size={20}/></button>
    <span className="rq-stepper-unit">เครื่อง</span>
  </div>;
}

/**
 * The units, one row per kind (and size): a drawing to match, how many, and how big. "Add another kind" covers homes
 * with a wall unit and a ceiling unit. When `fixedTotal` is set (rooms picked in a building), the first row takes
 * whatever the other rows leave.
 */
export function UnitRows({ rows, onChange, maxUnits, fixedTotal, sheet, idPrefix = 'ur' }: {
  rows: UnitRow[]; onChange: (rows: UnitRow[]) => void; maxUnits: number; fixedTotal?: number; sheet?: PriceSheet; idPrefix?: string;
}) {
  const others = (id: number) => rows.filter(row => row.id !== id).reduce((sum, row) => sum + row.count, 0);
  const update = (id: number, patch: Partial<UnitRow>) => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const canAdd = rows.length < 6 && rows.reduce((sum, row) => sum + row.count, 0) < (fixedTotal ?? maxUnits);
  return <div className="pr-rows">
    {rows.map((row, index) => {
      const fixed = fixedTotal != null && index === 0;
      const count = fixed ? Math.max(1, fixedTotal - others(row.id)) : row.count;
      const label = rows.length > 1 ? `แอร์แบบที่ ${index + 1}` : 'แอร์ที่จะล้าง';
      return <fieldset className="pr-row" key={row.id}>
        <legend className={'pr-row-head' + (rows.length > 1 ? '' : ' sr-only')}>
          <span>{label}</span>
          {rows.length > 1 && <button type="button" className="ui-btn is-ghost is-sm" onClick={() => onChange(rows.filter(item => item.id !== row.id))} aria-label={`ลบ${label}`}><Trash2 size={16}/> ลบ</button>}
        </legend>
        <div className="rq-types" role="radiogroup" aria-label={`${label}: แบบ`}>
          {(['wall', 'hanging', 'cassette'] as AcKind[]).map(kind => <button type="button" role="radio" aria-checked={row.kind === kind} key={kind} className="ui-option rq-type" onClick={() => update(row.id, { kind })}>
            <AcIcon kind={kind}/><span className="ui-option-text"><strong>{kindNames[kind]}</strong><small>{kindHints[kind]}{sheet ? <> · ราว <b className="ui-num">{baht(perUnit(sheet, kind, false))}</b></> : null}</small></span>
          </button>)}
        </div>
        <div className="pr-row-line">
          <div className="ui-field">
            <span className="ui-label" id={`${idPrefix}-${row.id}-count`}>จำนวน</span>
            <Stepper value={count} min={1} max={Math.max(1, (fixedTotal ?? maxUnits) - others(row.id))} label={`${label}: จำนวนเครื่อง`} readOnly={fixed} onChange={value => update(row.id, { count: value })}/>
            {fixed && rows.length > 1 && <small>ที่เหลือจากห้องที่เลือก</small>}
          </div>
          <div className="ui-field">
            <span className="ui-label" id={`${idPrefix}-${row.id}-size`}>ขนาด</span>
            <div className="rq-chips" role="radiogroup" aria-labelledby={`${idPrefix}-${row.id}-size`}>
              {([['normal', 'ไม่เกิน 24,000 BTU'], ['large', 'ใหญ่กว่า 24,000'], ['unknown', 'ไม่ทราบ']] as [UnitSize, string][]).map(([size, text]) =>
                <button type="button" role="radio" aria-checked={row.size === size} key={size} className={'ui-chip' + (row.size === size ? ' is-on' : '')} onClick={() => update(row.id, { size })}>{text}</button>)}
            </div>
          </div>
        </div>
      </fieldset>;
    })}
    {canAdd && <button type="button" className="ui-btn pr-add" onClick={() => onChange([...rows, newRow(rows.some(row => row.kind === 'wall') ? 'hanging' : 'wall')])}><Plus size={18}/> มีแอร์อีกแบบ</button>}
  </div>;
}

/** Standard or deep clean, side by side: what each one includes, the typical price, and which one fits. */
export function CleanChoice({ deep, onChange, recommended, why, standardPrice, deepPrice }: {
  deep: boolean; onChange: (deep: boolean) => void; recommended: boolean; why: string; standardPrice?: number; deepPrice?: number;
}) {
  const option = (value: boolean) => {
    const on = deep === value;
    const price = value ? deepPrice : standardPrice;
    return <button type="button" role="radio" aria-checked={on} className={'ui-option pr-clean' + (on ? ' is-on' : '')} onClick={() => onChange(value)}>
      <span className="pr-clean-head">
        <strong>{value ? 'ล้างใหญ่' : 'ล้างธรรมดา'}</strong>
        {recommended === value && <span className="ui-badge is-active">แนะนำ</span>}
      </span>
      {price != null && <span className="pr-clean-price">ราว <b className="ui-num">{baht(price)}</b></span>}
      <ul>{included[value ? 'deep' : 'standard'].map(text => <li key={text}><Check size={15} strokeWidth={2.6} aria-hidden="true"/>{text}</li>)}</ul>
    </button>;
  };
  return <div className="ui-field">
    <div className="pr-cleans" role="radiogroup" aria-label="แบบการล้าง">{option(false)}{option(true)}</div>
    <p className="pr-why"><Sparkles size={16} aria-hidden="true"/><span><strong>แนะนำ{recommended ? 'ล้างใหญ่' : 'ล้างธรรมดา'}</strong> {why}</span></p>
    <small>{notIncluded} ถ้าต้องทำ ช่างต้องเสนอราคาในแอป และคุณกดอนุมัติก่อน</small>
  </div>;
}

/** A price line by line, with the total. Extra work added on site is marked as such, with its reason. */
export function PriceBreakdown({ lines, totalLabel = 'รวม', className = '' }: { lines: PriceLine[]; totalLabel?: string; className?: string }) {
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  return <table className={'pr-lines ' + className}>
    <tbody>
      {lines.map((line, index) => <tr key={index} className={line.kind === 'extra' ? 'is-extra' : undefined}>
        <th scope="row">
          {line.kind === 'extra' && <span className="ui-badge">งานเพิ่ม</span>} {line.label}
          {line.quantity > 1 && <small className="ui-num"> × {line.quantity} ({baht(line.unitPrice)})</small>}
          {line.reason && <small className="pr-line-reason">{line.reason}</small>}
        </th>
        <td className="ui-num">{baht(line.amount)}</td>
      </tr>)}
    </tbody>
    <tfoot><tr><th scope="row">{totalLabel}</th><td className="ui-num">{baht(sum)}</td></tr></tfoot>
  </table>;
}
