import { useMemo, useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import type { Booking } from '../types';
import type { ProposeChangePayload } from '../lib/api';
import { baht, priceLines, total, unitsOf } from '../lib/pricing';
import { PriceBreakdown, Stepper, UnitRows, itemsToRows, newRow, rowsToItems, type UnitRow } from './Pricing';
import { Problem, Sheet } from './kit';

/** Extra work technicians most often find on site; any other can be typed. */
const commonExtras = ['เติมน้ำยาแอร์', 'เปลี่ยนคาปาซิเตอร์', 'หาจุดรั่วและเชื่อมท่อ', 'แก้ท่อน้ำทิ้งตัน/แตก', 'เปลี่ยนอะไหล่'];

interface ExtraRow { id: number; label: string; amount: string; }
let nextExtraId = 1;

/**
 * Asking the customer to change the price on site. Two cases, never mixed: the units are not what was described
 * (priced from the list the technician quoted with, so the new price follows from the facts), or extra work is
 * needed (the technician names each item and its price). Either way the customer approves in the app first.
 */
export default function PriceChangeSheet({ booking, onSend, onClose }: { booking: Booking; onSend: (payload: ProposeChangePayload) => Promise<boolean>; onClose: () => void }) {
  // Jobs agreed as one sum (before quotes had a price list) can only add extra work; there is no list to re-price from.
  const canCorrect = Boolean(booking.agreedSheet);
  const [kind, setKind] = useState<'correction' | 'extra'>(canCorrect ? 'correction' : 'extra');
  const [rows, setRows] = useState<UnitRow[]>(() => booking.items?.length ? itemsToRows(booking.items) : [newRow('wall', booking.unitCount ?? 1, 'normal')]);
  const [deep, setDeep] = useState(Boolean(booking.deep));
  const [hard, setHard] = useState(booking.hardAccessUnits ?? 0);
  const [extras, setExtras] = useState<ExtraRow[]>([{ id: nextExtraId++, label: '', amount: '' }]);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A building job is cleaned by room: the kinds can change, the number of units cannot.
  const roomUnits = (booking.rooms ?? []).reduce((sum, room) => sum + room.units, 0);
  const items = useMemo(() => {
    const list = rowsToItems(rows);
    if (!roomUnits) return list;
    const first = Math.max(1, roomUnits - unitsOf(list.slice(1)));
    return [{ ...list[0], count: first, large: list[0].large ? first : 0 }, ...list.slice(1)];
  }, [rows, roomUnits]);
  const units = unitsOf(items);
  const hardUnits = Math.min(hard, units);
  // Work already approved stays on top of whatever the cleaning comes to.
  const approvedExtras = total((booking.priceLines ?? []).filter(line => line.kind === 'extra'));
  const correction = booking.agreedSheet ? priceLines(booking.agreedSheet, items, deep, hardUnits) : null;
  const extraTotal = extras.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const newPrice = kind === 'correction' ? (correction ? total(correction) + approvedExtras : null) : booking.price + extraTotal;

  async function send() {
    setProblem(null);
    if (reason.trim().length < 3) { setProblem('บอกเหตุผลให้ลูกค้าเข้าใจ เช่น เห็นอะไรที่หน้างาน'); return; }
    let payload: ProposeChangePayload;
    if (kind === 'correction') payload = { kind, reason: reason.trim(), items, deep, hardAccessUnits: hardUnits };
    else {
      const filled = extras.filter(row => row.label.trim() || row.amount);
      if (!filled.length || filled.some(row => row.label.trim().length < 2 || !(Number(row.amount) >= 1))) { setProblem('ใส่ชื่องานและราคาให้ครบทุกรายการ'); return; }
      if (filled.some(row => Number(row.amount) > 50000)) { setProblem('ราคาต่อรายการไม่เกิน 50,000 บาท ถ้าเป็นงานใหญ่ คุยกับลูกค้าแล้วเปิดงานใหม่'); return; }
      payload = { kind, reason: reason.trim(), extras: filled.map(row => ({ label: row.label.trim(), amount: Math.round(Number(row.amount)) })) };
    }
    setBusy(true);
    const ok = await onSend(payload);
    setBusy(false);
    if (ok) onClose();
  }

  const updateExtra = (id: number, patch: Partial<ExtraRow>) => setExtras(list => list.map(row => row.id === id ? { ...row, ...patch } : row));

  return <Sheet title="ขอปรับราคา" sub="ลูกค้ากดอนุมัติในแอปก่อน ราคาถึงจะเปลี่ยน" onClose={onClose} wide
    footer={<div className="rq-foot">
      <div className="rq-total" aria-live="polite">
        <span>ราคาเดิม {baht(booking.price)}</span>
        <strong className="ui-num">{newPrice != null ? baht(newPrice) : 'ระบบคำนวณให้'}</strong>
        <small>ราคาใหม่ถ้าลูกค้าอนุมัติ</small>
      </div>
      <button type="button" className="ui-btn is-primary is-lg rq-send" disabled={busy} aria-busy={busy} onClick={() => void send()}>{busy ? 'กำลังส่ง…' : <>ส่งให้ลูกค้า <Send size={18}/></>}</button>
    </div>}>
    <div className="rq">
      <section className="rq-section">
        {canCorrect && <div className="ui-tabs" role="group" aria-label="ประเภทคำขอ">
          <button type="button" aria-pressed={kind === 'correction'} onClick={() => setKind('correction')}>แอร์ไม่ตรงกับที่แจ้ง</button>
          <button type="button" aria-pressed={kind === 'extra'} onClick={() => setKind('extra')}>ต้องทำงานเพิ่ม</button>
        </div>}
        {kind === 'correction'
          ? <>
            <p className="pc-hint">แก้ให้ตรงกับที่เห็นจริง ราคาคิดจากใบราคาที่คุณเสนอไว้ตอนแรก</p>
            <UnitRows rows={rows} onChange={setRows} maxUnits={300} fixedTotal={roomUnits || undefined} sheet={booking.agreedSheet ?? undefined} idPrefix="pc"/>
            <div className="ui-field">
              <span className="ui-label" id="pc-clean">แบบการล้าง</span>
              <div className="rq-chips" role="radiogroup" aria-labelledby="pc-clean">
                {[false, true].map(value => <button type="button" role="radio" aria-checked={deep === value} key={String(value)} className={'ui-chip' + (deep === value ? ' is-on' : '')} onClick={() => setDeep(value)}>{value ? 'ล้างใหญ่' : 'ล้างธรรมดา'}</button>)}
              </div>
            </div>
            <div className="ui-field">
              <span className="ui-label" id="pc-hard">คอยล์ร้อนที่เข้าถึงยาก</span>
              <Stepper value={hardUnits} min={0} max={units} label="จำนวนคอยล์ร้อนที่เข้าถึงยาก" unit={`จาก ${units}`} onChange={setHard}/>
            </div>
            {correction && <PriceBreakdown lines={correction} totalLabel="ค่าล้างตามรายการใหม่"/>}
          </>
          : <>
            <p className="pc-hint">เช่น น้ำยาเหลือน้อย หรืออะไหล่เสีย บอกราคาแต่ละรายการ ลูกค้าจะเห็นทั้งหมดก่อนอนุมัติ</p>
            <div className="pc-extras">
              {extras.map((row, index) => <div className="pc-extra" key={row.id}>
                <div className="ui-field">
                  <label htmlFor={`pc-extra-${row.id}`}>งานเพิ่ม {extras.length > 1 ? index + 1 : ''}</label>
                  <input id={`pc-extra-${row.id}`} className="ui-input" value={row.label} maxLength={80} onChange={event => updateExtra(row.id, { label: event.target.value })} placeholder="เช่น เติมน้ำยาแอร์ R32" list="pc-common"/>
                </div>
                <div className="ui-field pc-amount">
                  <label htmlFor={`pc-amount-${row.id}`}>ราคา (บาท)</label>
                  <input id={`pc-amount-${row.id}`} className="ui-input ui-num" inputMode="numeric" value={row.amount} onChange={event => updateExtra(row.id, { amount: event.target.value.replace(/[^0-9]/g, '').slice(0, 5) })} placeholder="800"/>
                </div>
                {extras.length > 1 && <button type="button" className="ui-btn is-ghost is-sm pc-remove" aria-label={`ลบงานเพิ่ม ${index + 1}`} onClick={() => setExtras(list => list.filter(item => item.id !== row.id))}><Trash2 size={16}/></button>}
              </div>)}
              <datalist id="pc-common">{commonExtras.map(text => <option key={text} value={text}/>)}</datalist>
              {extras.length < 5 && <button type="button" className="ui-btn pr-add" onClick={() => setExtras(list => [...list, { id: nextExtraId++, label: '', amount: '' }])}><Plus size={18}/> เพิ่มอีกรายการ</button>}
            </div>
          </>}
        <div className="ui-field">
          <label htmlFor="pc-reason">เหตุผลถึงลูกค้า</label>
          <textarea id="pc-reason" className="ui-textarea" rows={3} maxLength={300} value={reason} onChange={event => setReason(event.target.value)}
            placeholder={kind === 'correction' ? 'เช่น เครื่องห้องนั่งเล่นเป็นแบบแขวน ไม่ใช่ติดผนัง' : 'เช่น วัดแรงดันน้ำยาได้ 60 psi ต่ำกว่าปกติ ต้องเติมน้ำยา'}/>
          {problem && <Problem>{problem}</Problem>}
        </div>
        <p className="pc-hint">ถ้าลูกค้าไม่อนุมัติ ทำงานตามรายการเดิมในราคาเดิม ห้ามเก็บเงินเกินยอดในแอป ลูกค้าแจ้งปัญหาได้</p>
      </section>
    </div>
  </Sheet>;
}
