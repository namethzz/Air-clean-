import { CheckCircle2, Clock3, Gift, XCircle } from 'lucide-react';
import type { Membership } from '../../types';
import './Membership.css';

const thaiDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** A one-line membership status for the technician's other pages; opens the membership page. */
export function MembershipStrip({ data, onOpen, always = false }: { data: Membership; onOpen: () => void; always?: boolean }) {
  if (data.state === 'NotApproved') return null;
  const expired = data.state === 'Expired';
  const soon = !expired && data.daysLeft <= 7;
  if (!always && !expired && !soon && data.state === 'Active') return null;
  return <div className={'ms-strip ' + (expired ? 'expired' : soon ? 'soon' : 'trial')} role={expired ? 'alert' : 'status'}>
    {expired ? <XCircle size={18}/> : data.pending ? <Clock3 size={18}/> : data.state === 'Trial' ? <Gift size={18}/> : <CheckCircle2 size={18}/>}
    <span>{expired ? (data.pending ? 'สมาชิกหมดอายุ · สลิปรอผู้ดูแลตรวจ' : 'สมาชิกหมดอายุ ส่งข้อเสนองานใหม่ไม่ได้')
      : data.state === 'Trial' ? `ทดลองใช้ฟรี เหลือ ${data.daysLeft} วัน` : soon ? `สมาชิกเหลือ ${data.daysLeft} วัน` : `สมาชิกใช้ได้ถึง ${thaiDate(data.memberUntil)}`}</span>
    <button type="button" className="ui-link" onClick={onOpen}>{expired ? 'ต่ออายุ' : 'ดูรายละเอียด'}</button>
  </div>;
}
