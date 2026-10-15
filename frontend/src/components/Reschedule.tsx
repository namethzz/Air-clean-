import { useState } from 'react';
import { Phone, X } from 'lucide-react';
import type { Booking } from '../types';
import VisitTimePicker, { defaultVisit, visitPayload, type Visit } from './VisitTimePicker';
import { timeLabel } from '../lib/time';

export type RescheduleSide = 'customer' | 'technician';
const visitDay = (date: string) => new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
export const telLink = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');

/** A Thai number grouped the way people read it aloud: 065-154-5249, 02-123-4567. Anything else stays as typed. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (/^0[689]\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (/^0\d{8}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return phone.trim();
}

/** Who can move the visit now: the customer before a technician is chosen; either side before the technician leaves. */
export function canReschedule(booking: Booking, side: RescheduleSide) {
  if (side === 'customer') return ['เปิดรับช่าง', 'รอเลือกช่าง', 'รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status);
  return ['รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status);
}
const chosen = (booking: Booking) => ['รอยืนยัน', 'ยืนยันแล้ว'].includes(booking.status);

/**
 * A new day and time for the visit. Once a technician is chosen, people agree it by phone first, so the sheet
 * offers the call; the change then applies straight away and the other side is told.
 */
export function RescheduleSheet({ booking, side, onSend, onClose }: { booking: Booking; side: RescheduleSide; onSend: (scheduledAt: string, timeWindow: string | undefined, reason: string | undefined) => Promise<boolean>; onClose: () => void }) {
  const [visit, setVisit] = useState<Visit>(defaultVisit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const other = side === 'customer' ? 'ช่าง' : 'ลูกค้า';
  const phone = side === 'customer' ? booking.technicianPhone : booking.customerPhone;
  async function send() {
    const when = visitPayload(visit);
    if (!when) { setError('เลือกวันและเวลาใหม่'); return; }
    setBusy(true); setError('');
    const ok = await onSend(`${visit.date}T${when.time}:00`, when.timeWindow, undefined);
    setBusy(false);
    if (ok) onClose();
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card booking-modal-wide" role="dialog" aria-modal="true" aria-labelledby="rs-title">
      <div className="modal-header">
        <div><h2 id="rs-title">เปลี่ยนวันนัด</h2><p>นัดเดิม {visitDay(booking.date)} {timeLabel(booking)}</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={19}/></button>
      </div>
      <div className="booking-form">
        {chosen(booking)
          ? <div className="rs-call">
            <p>โทรตกลงวันเวลาใหม่กับ{other}ก่อน แล้วเลือกวันที่ตกลงกันด้านล่าง {other}จะได้รับแจ้งทันที</p>
            {phone && <a className="cj-primary" href={telLink(phone)}><Phone size={17}/> โทรหา{other} {formatPhone(phone)}</a>}
          </div>
          : <p className="rs-note">ช่างที่เสนอราคาไว้จะได้รับแจ้งวันนัดใหม่</p>}
        <VisitTimePicker value={visit} onChange={setVisit}/>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="button" className="primary-button full-width" disabled={busy} onClick={() => void send()}>{busy ? 'กำลังบันทึก…' : 'เปลี่ยนเป็นวันนี้'}</button>
      </div>
    </section>
  </div>;
}
