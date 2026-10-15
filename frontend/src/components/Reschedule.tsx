import { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import type { Booking } from '../types';
import VisitTimePicker, { defaultVisit, visitPayload, type Visit } from './VisitTimePicker';
import { timeLabel } from '../lib/time';

export type RescheduleSide = 'customer' | 'technician';
const visitDay = (date: string) => new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
const reasons: Record<RescheduleSide, string[]> = {
  customer: ['ติดธุระ', 'ไม่อยู่บ้าน', 'อาคารไม่สะดวกวันนั้น'],
  technician: ['ติดงานก่อนหน้า', 'รถมีปัญหา', 'ไม่สบาย'],
};

/** Who can move the visit now: the customer before a technician is chosen; either side before the technician leaves. */
export function canReschedule(booking: Booking, side: RescheduleSide) {
  if (side === 'customer') return ['เปิดรับช่าง', 'รอเลือกช่าง', 'รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status);
  return ['รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status);
}
/** Before a technician is chosen the change is immediate; after that the other side has to agree. */
const needsAgreement = (booking: Booking) => ['รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status);

export function RescheduleSheet({ booking, side, onSend, onClose }: { booking: Booking; side: RescheduleSide; onSend: (scheduledAt: string, timeWindow: string | undefined, reason: string | undefined) => Promise<boolean>; onClose: () => void }) {
  const [visit, setVisit] = useState<Visit>(defaultVisit);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const agreement = needsAgreement(booking);
  async function send() {
    const when = visitPayload(visit);
    if (!when) { setError('เลือกวันและเวลาใหม่'); return; }
    setBusy(true); setError('');
    const ok = await onSend(`${visit.date}T${when.time}:00`, when.timeWindow, reason.trim() || undefined);
    setBusy(false);
    if (ok) onClose();
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card booking-modal-wide" role="dialog" aria-modal="true" aria-labelledby="rs-title">
      <div className="modal-header">
        <div><h2 id="rs-title">{agreement ? 'ขอเลื่อนนัด' : 'เปลี่ยนวันนัด'}</h2>
          <p>นัดเดิม {visitDay(booking.date)} {timeLabel(booking)} · {agreement ? (side === 'customer' ? 'ช่างต้องกดตกลงก่อน นัดจึงจะเปลี่ยน' : 'ลูกค้าต้องกดตกลงก่อน นัดจึงจะเปลี่ยน') : 'ช่างที่เสนอราคาไว้จะได้รับแจ้ง'}</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={19}/></button>
      </div>
      <div className="booking-form">
        <VisitTimePicker value={visit} onChange={setVisit}/>
        {agreement && <div className="bk-field">
          <span className="bk-label">เหตุผล <em>(ไม่บังคับ)</em></span>
          <div className="bk-chips">{reasons[side].map(item => <button type="button" key={item} className={'bk-chip' + (reason === item ? ' active' : '')} aria-pressed={reason === item} onClick={() => setReason(value => value === item ? '' : item)}>{item}</button>)}</div>
          <input className="rs-reason" value={reasons[side].includes(reason) ? '' : reason} onChange={event => setReason(event.target.value)} placeholder="หรือพิมพ์เหตุผลเอง" maxLength={200} aria-label="เหตุผลอื่น"/>
        </div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="button" className="primary-button full-width" disabled={busy} onClick={() => void send()}>{busy ? 'กำลังส่ง…' : agreement ? 'ส่งคำขอเลื่อนนัด' : 'เปลี่ยนวันนัด'}</button>
      </div>
    </section>
  </div>;
}

/** A pending change of date: the asker can withdraw it, the other side agrees or keeps the old time. */
export function RescheduleBanner({ booking, side, onAnswer }: { booking: Booking; side: RescheduleSide; onAnswer: (accept: boolean) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const ask = booking.reschedule;
  if (!ask) return null;
  const mine = ask.by === side;
  const proposed = `${visitDay(ask.date)} ${timeLabel({ time: ask.time, timeWindow: ask.timeWindow })}`;
  const answer = async (accept: boolean) => { setBusy(true); await onAnswer(accept); setBusy(false); };
  return <section className={'rs-banner' + (mine ? '' : ' ask')} role="status">
    <CalendarClock size={20}/>
    <div>
      <strong>{mine ? `คุณขอเลื่อนนัดเป็น ${proposed}` : `${ask.by === 'technician' ? 'ช่าง' : 'ลูกค้า'}ขอเลื่อนนัดเป็น ${proposed}`}</strong>
      <span>{mine ? `รอ${side === 'customer' ? 'ช่าง' : 'ลูกค้า'}ตอบ · นัดเดิมยังใช้อยู่` : `นัดเดิม ${visitDay(booking.date)} ${timeLabel(booking)}`}{ask.reason ? ` · เหตุผล: ${ask.reason}` : ''}</span>
      <div className="rs-actions">
        {mine
          ? <button type="button" className="cj-link" disabled={busy} onClick={() => void answer(false)}>ถอนคำขอ</button>
          : <><button type="button" className="cj-primary" disabled={busy} onClick={() => void answer(true)}>ตกลงเลื่อน</button>
            <button type="button" className="cj-ghost" disabled={busy} onClick={() => void answer(false)}>ไม่สะดวก ใช้นัดเดิม</button></>}
      </div>
    </div>
  </section>;
}
