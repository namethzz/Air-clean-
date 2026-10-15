import type { Booking, PageKey, ServiceReportRecord } from '../types';
import { isClosedForCustomer } from './jobFlow';

/** The single thing a customer should do next, derived from their real bookings. */
export interface NextStep {
  /** 'start' = nothing in progress, invite a new request. */
  tone: 'action' | 'wait' | 'start';
  eyebrow?: string;
  title: string;
  text: string;
  cta: string;
  to: PageKey | 'newBooking';
  /** Booking this step is about, so the list below can leave it out. */
  bookingId?: number;
}

const closed = ['เสร็จสิ้น', 'ยกเลิก'];
const travelling = ['กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ'];

export function formatThaiDate(value: string): string {
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function byDate(a: Booking, b: Booking): number {
  return (a.date + a.time).localeCompare(b.date + b.time);
}

export function openBookings(bookings: Booking[]): Booking[] {
  return bookings.filter(item => !closed.includes(item.status)).sort(byDate);
}

export function pickNextStep(bookings: Booking[], _reports: ServiceReportRecord[]): NextStep {
  const open = openBookings(bookings);
  const who = (b: Booking) => b.technician || 'ช่าง';

  const pay = open.find(b => b.status === 'รอชำระเงิน' && !b.customerConfirmedPayment);
  if (pay) return { tone: 'action', eyebrow: 'ต้องทำตอนนี้', title: 'ยืนยันการชำระเงิน', text: `งาน ${pay.code} เสร็จแล้ว ชำระเงินกับ${who(pay)}แล้วกดยืนยันเพื่อปิดงาน`, cta: 'ยืนยันการชำระเงิน', to: 'tracking', bookingId: pay.id };

  // A finished job the customer has not rated yet (in the last two weeks).
  const rate = bookings.filter(b => b.status === 'เสร็จสิ้น' && !b.customerRating && !isClosedForCustomer(b)).sort((a, b) => b.id - a.id)[0];
  if (rate) return { tone: 'action', eyebrow: 'ล้างแอร์เสร็จแล้ว', title: `ให้คะแนน${who(rate)}`, text: `งาน ${rate.code} เสร็จเรียบร้อย คะแนนของคุณช่วยให้ลูกค้าคนอื่นเลือกช่างได้ง่ายขึ้น`, cta: 'ให้คะแนนช่าง', to: 'bookings', bookingId: rate.id };

  const choose = open.find(b => b.status === 'รอเลือกช่าง');
  if (choose) {
    const count = choose.applicants?.length ?? 0;
    return { tone: 'action', eyebrow: 'ต้องทำตอนนี้', title: count ? `มีช่าง ${count} คนเสนอราคาให้คุณ` : 'มีช่างสนใจงานของคุณแล้ว', text: 'เปรียบเทียบราคา โปรไฟล์ และคะแนน แล้วเลือกช่างที่ใช่ ที่อยู่เต็มจะเปิดให้เฉพาะช่างที่คุณเลือก', cta: 'เลือกช่าง', to: 'bookings', bookingId: choose.id };
  }

  const issue = open.find(b => b.status === 'มีปัญหาการชำระเงิน');
  if (issue) return { tone: 'wait', eyebrow: 'งานของคุณ', title: 'ผู้ดูแลกำลังตรวจสอบการชำระเงิน', text: `งาน ${issue.code} ถูกแจ้งปัญหาการชำระเงิน รอผู้ดูแลตรวจสอบ`, cta: 'ดูรายละเอียด', to: 'tracking', bookingId: issue.id };

  const moving = open.find(b => travelling.includes(b.status));
  if (moving) {
    const title = moving.status === 'กำลังเดินทาง' ? `${who(moving)}กำลังเดินทางมาหาคุณ` : `${who(moving)}มาถึงแล้ว กำลังล้างแอร์`;
    return { tone: 'wait', eyebrow: 'งานของคุณ', title, text: `${moving.service} · ${moving.unitLabel}`, cta: moving.status === 'กำลังเดินทาง' ? 'ดูตำแหน่งช่าง' : 'ดูสถานะงาน', to: 'bookings', bookingId: moving.id };
  }

  const upcoming = open.find(b => b.status === 'ยืนยันแล้ว' || b.status === 'รอยืนยัน');
  if (upcoming) return { tone: 'wait', eyebrow: 'นัดหมายถัดไป', title: `${formatThaiDate(upcoming.date)} เวลา ${upcoming.time} น.`, text: `${upcoming.service} · ${who(upcoming)}`, cta: 'ดูรายละเอียด', to: 'bookings', bookingId: upcoming.id };

  const waiting = open.find(b => b.status === 'เปิดรับช่าง');
  if (waiting) return { tone: 'wait', eyebrow: 'งานของคุณ', title: 'กำลังรอช่างเสนอราคา', text: 'ช่างใกล้บ้านจะเห็นคำขอของคุณ และส่งข้อเสนอมาที่รายการจอง', cta: 'ดูคำขอของฉัน', to: 'bookings', bookingId: waiting.id };

  return { tone: 'start', title: 'ขอช่างล้างแอร์ใกล้บ้านคุณ', text: 'ส่งคำขอครั้งเดียว ช่างในพื้นที่จะเสนอราคาให้คุณเลือก', cta: 'ขอช่างล้างแอร์', to: 'newBooking' };
}
