import { timeLabel } from './time';
import type { Booking, BookingStatus, ServiceReportRecord } from '../types';

/** The five stages a customer sees, in order. The last one is rating the technician. */
export const journeySteps = ['ส่งคำขอ', 'เลือกช่าง', 'ช่างมาหา', 'ล้างแอร์', 'ให้คะแนน'] as const;

/** Index of the stage that is happening now. 5 means every stage is done, -1 means cancelled. */
export function currentStep(booking: Booking): number {
  switch (booking.status) {
    case 'เปิดรับช่าง':
    case 'รอเลือกช่าง':
    case 'หมดเวลาเลือกช่าง': return 1;
    case 'รอยืนยัน':
    case 'ยืนยันแล้ว':
    case 'กำลังเดินทาง': return 2;
    case 'ถึงหน้างาน':
    case 'กำลังดำเนินการ':
    case 'รอชำระเงิน':
    case 'มีปัญหาการชำระเงิน': return 3;
    case 'เสร็จสิ้น': return booking.customerRating ? 5 : 4;
    default: return -1;
  }
}

export const isClosed = (booking: Booking) => booking.status === 'เสร็จสิ้น' || booking.status === 'ยกเลิก' || booking.status === 'หมดเวลาเลือกช่าง';

/** Days since the appointment date (negative when it is still ahead). */
function daysSince(date: string): number {
  return (Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000;
}

/** For customers a finished job stays in "in progress" until they rate it (for two weeks), so the next step is visible. */
export const isClosedForCustomer = (booking: Booking) =>
  booking.status === 'ยกเลิก' || (booking.status === 'เสร็จสิ้น' && (Boolean(booking.customerRating) || daysSince(booking.date) > 14));

export interface JobGuide {
  /** One line on the list row. */
  short: string;
  /** Headline on the detail page. */
  title: string;
  /** What is going on and what, if anything, the customer should do. */
  hint: string;
}

export function guideFor(booking: Booking): JobGuide {
  const guide = rawGuide(booking);
  const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
  return { short: tidy(guide.short), title: tidy(guide.title), hint: tidy(guide.hint) };
}

function rawGuide(booking: Booking): JobGuide {
  // A real name is set off by spaces ("รอ Nameth ตอบรับ"); the generic word joins the Thai ("รอช่างตอบรับ").
  const tech = booking.technician && booking.technician !== '-' ? ` ${booking.technician.trim()} ` : 'ช่าง';
  const offers = booking.applicants?.length ?? 0;
  switch (booking.status) {
    case 'เปิดรับช่าง':
      return { short: 'รอช่างเสนอราคา', title: 'กำลังรอช่างเสนอราคา', hint: 'ช่างใกล้บ้านเห็นคำขอของคุณแล้ว ข้อเสนอจะแสดงที่หน้านี้ ไม่ต้องทำอะไรในตอนนี้' };
    case 'รอเลือกช่าง':
      return { short: offers ? `ช่าง ${offers} คนเสนอราคา` : 'มีช่างสนใจแล้ว', title: offers ? `มีช่าง ${offers} คนเสนอราคา` : 'มีช่างสนใจงานของคุณ', hint: 'เปรียบเทียบราคาและโปรไฟล์ แล้วเลือกช่างหนึ่งคนภายในเวลาที่กำหนด ที่อยู่เต็มของคุณจะเปิดให้เฉพาะช่างที่เลือก' };
    case 'หมดเวลาเลือกช่าง':
      return { short: 'หมดเวลาเลือกช่าง · เปิดรับใหม่ได้', title: 'หมดเวลาเลือกช่าง', hint: `ไม่ได้เลือกช่างภายใน 1 ชั่วโมงหลังมีข้อเสนอแรก ข้อเสนอเดิมจึงหมดอายุ ช่างที่เคยเสนอได้รับแจ้งแล้ว ถ้ายังต้องการช่าง กดเปิดรับข้อเสนออีกครั้ง` };
    case 'รอยืนยัน':
      return { short: `รอ${tech}ตอบรับ`, title: `รอ${tech}ตอบรับ`, hint: 'ช่างยังไม่ได้ยืนยันนัดหมาย' };
    case 'ยืนยันแล้ว':
      return { short: `${tech}จะมาตามนัด`, title: `${tech}รับงานแล้ว`, hint: 'ช่างจะมาตามวันและเวลานัด ถ้าช่างแชร์ตำแหน่งระหว่างเดินทาง คุณจะเห็นบนแผนที่ที่หน้านี้' };
    case 'กำลังเดินทาง':
      return { short: `${tech}กำลังเดินทางมา`, title: `${tech}กำลังเดินทางมาหาคุณ`, hint: 'ดูตำแหน่งล่าสุดของช่างบนแผนที่' };
    case 'ถึงหน้างาน':
    case 'กำลังดำเนินการ':
      return { short: `${tech}กำลังล้างแอร์`, title: `${tech}มาถึงแล้ว กำลังล้างแอร์`, hint: 'เมื่อล้างเสร็จ จ่ายเงินให้ช่างโดยตรง (เงินสดหรือโอน) ช่างจะเป็นผู้ปิดงานในระบบ คุณไม่ต้องกดอะไร' };
    case 'รอชำระเงิน':
      return { short: 'ล้างเสร็จแล้ว รอชำระเงิน', title: 'ล้างเสร็จแล้ว จ่ายเงินปลายทาง', hint: 'จ่ายเงินให้ช่าง แล้วกดยืนยันด้านล่าง' };
    case 'มีปัญหาการชำระเงิน':
      return { short: 'ผู้ดูแลกำลังตรวจสอบ', title: 'ผู้ดูแลกำลังตรวจสอบการชำระเงิน', hint: 'ระบบยังไม่ถือว่างานนี้ชำระเงินสำเร็จ รอผู้ดูแลติดต่อกลับ' };
    case 'เสร็จสิ้น':
      return booking.customerRating
        ? { short: 'งานเสร็จสมบูรณ์', title: 'งานเสร็จสมบูรณ์', hint: 'ขอบคุณที่ใช้บริการและให้คะแนนช่าง' }
        : { short: 'ล้างเสร็จแล้ว · ให้คะแนนช่าง', title: 'ล้างแอร์เสร็จแล้ว', hint: `${tech}ปิดงานและได้รับเงินแล้ว บันทึกประวัติการล้างแอร์เรียบร้อย` };
    default:
      return { short: 'ยกเลิกแล้ว', title: 'ยกเลิกคำขอแล้ว', hint: 'คำขอนี้ไม่ได้ส่งให้ช่างอีกต่อไป' };
  }
}

/** True when the customer is the one who has to act next. */
export function needsAction(booking: Booking, _reports: ServiceReportRecord[] = []): boolean {
  if (booking.status === 'หมดเวลาเลือกช่าง') return true;
  if (booking.status === 'รอเลือกช่าง') return (booking.applicants?.length ?? 0) > 0;
  if (booking.status === 'รอชำระเงิน') return !booking.customerConfirmedPayment;
  if (booking.status === 'เสร็จสิ้น') return !booking.customerRating && !isClosedForCustomer(booking);
  return false;
}

/** Jobs that need the customer first, then the soonest appointment. */
export function sortJobs(bookings: Booking[], reports: ServiceReportRecord[]): Booking[] {
  return [...bookings].sort((a, b) => {
    const urgent = Number(needsAction(b, reports)) - Number(needsAction(a, reports));
    // While choosing, the request whose time runs out first comes first.
    if (!urgent && a.offerDeadline && b.offerDeadline) return a.offerDeadline.localeCompare(b.offerDeadline);
    if (urgent) return urgent;
    return (a.date + a.time).localeCompare(b.date + b.time);
  });
}

/* ───────────── Technician side ───────────── */

export const techSteps = ['ส่งข้อเสนอ', 'ลูกค้ายืนยัน', 'ไปหน้างาน', 'ปิดงาน'] as const;

/** A job the technician offered on that the customer has not decided yet. */
export const isOffer = (booking: Booking) => booking.status === 'เปิดรับช่าง' || booking.status === 'รอเลือกช่าง';

/** Stage a technician is on. 4 means all done, -1 means cancelled. */
export function techStep(status: BookingStatus): number {
  switch (status) {
    case 'เปิดรับช่าง':
    case 'รอเลือกช่าง':
    case 'รอยืนยัน': return 1;
    case 'ยืนยันแล้ว':
    case 'กำลังเดินทาง': return 2;
    case 'ถึงหน้างาน':
    case 'กำลังดำเนินการ':
    case 'รอชำระเงิน':
    case 'มีปัญหาการชำระเงิน': return 3;
    case 'เสร็จสิ้น': return 4;
    default: return -1;
  }
}

function when(booking: Booking): string {
  const date = new Date(booking.date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const day = days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${timeLabel(booking)}`;
}

export function techGuide(booking: Booking): JobGuide {
  switch (booking.status) {
    case 'เปิดรับช่าง':
    case 'รอเลือกช่าง':
      return { short: 'ส่งข้อเสนอแล้ว · รอลูกค้าเลือก', title: 'ส่งข้อเสนอแล้ว รอลูกค้าเลือกช่าง', hint: 'ถ้าลูกค้าเลือกคุณ จะมีแจ้งเตือนทันที และที่อยู่เต็มพร้อมแผนที่จะแสดงที่หน้านี้' };
    case 'รอยืนยัน':
      return { short: 'ลูกค้าเลือกคุณแล้ว', title: 'ลูกค้าเลือกคุณแล้ว', hint: 'กดรับงานเพื่อยืนยันนัดหมาย' };
    case 'ยืนยันแล้ว':
      return { short: `ต้องไป ${when(booking)}`, title: `งานที่ต้องไป · ${when(booking)}`, hint: 'ดูที่อยู่และกดนำทางได้เลย เมื่อล้างเสร็จและได้รับเงินแล้ว กดปิดงานด้านล่างครั้งเดียว' };
    case 'กำลังเดินทาง':
      return { short: 'กำลังเดินทาง', title: 'กำลังเดินทางไปหาลูกค้า', hint: 'ลูกค้าเห็นตำแหน่งของคุณ เมื่อถึงหน้างานระบบจะรู้เองจาก GPS ไม่ต้องกด เปิดหน้านี้ไว้ระหว่างเดินทาง' };
    case 'รอชำระเงิน':
      if (booking.technicianConfirmedPayment) return { short: 'ปิดงานแล้ว · รอลูกค้ายืนยัน', title: 'ปิดงานแล้ว รอลูกค้ายืนยันการจ่ายเงิน', hint: 'ลูกค้าได้รับแจ้งให้ยืนยัน ถ้าลูกค้าไม่ยืนยันหรือแจ้งปัญหาภายใน 3 วัน ระบบปิดงานให้อัตโนมัติ' };
      return { short: 'อยู่ที่หน้างาน', title: 'ถึงหน้างานแล้ว', hint: 'ล้างแอร์ได้เลย เสร็จแล้วรับเงินจากลูกค้า แล้วกดปิดงานด้านล่างครั้งเดียว' };
    case 'ถึงหน้างาน':
    case 'กำลังดำเนินการ':
      return { short: 'อยู่ที่หน้างาน', title: 'ถึงหน้างานแล้ว', hint: 'ล้างแอร์ได้เลย เสร็จแล้วรับเงินจากลูกค้า แล้วกดปิดงานด้านล่างครั้งเดียว' };
    case 'มีปัญหาการชำระเงิน':
      return { short: 'ผู้ดูแลกำลังตรวจสอบ', title: 'ผู้ดูแลกำลังตรวจสอบการชำระเงิน', hint: 'รอผู้ดูแลติดต่อกลับ' };
    case 'เสร็จสิ้น':
      return { short: 'ปิดงานแล้ว', title: 'งานเสร็จสมบูรณ์', hint: 'บันทึกงานและการรับเงินเรียบร้อยแล้ว' };
    default:
      return { short: 'ยกเลิกแล้ว', title: 'งานนี้ถูกยกเลิก', hint: 'ไม่ต้องดำเนินการเพิ่ม' };
  }
}

/** True when the technician is the one who has to act next (a job to go to or to close). */
export function techNeedsAction(booking: Booking): boolean {
  // Once the technician has closed the job, it waits on the customer.
  if (techClosed(booking)) return false;
  return ['รอยืนยัน', 'ยืนยันแล้ว', 'กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ', 'รอชำระเงิน'].includes(booking.status);
}

/** The technician pressed "done and paid"; the job waits for the customer to confirm (or closes by itself after 3 days). */
export const techClosed = (booking: Booking) => booking.status === 'รอชำระเงิน' && Boolean(booking.technicianConfirmedPayment);

/** Jobs that need the technician first, then the soonest appointment. */
export function sortByNeed(bookings: Booking[], needs: (booking: Booking) => boolean): Booking[] {
  return [...bookings].sort((a, b) => {
    const urgent = Number(needs(b)) - Number(needs(a));
    return urgent || (a.date + a.time).localeCompare(b.date + b.time);
  });
}

/** Whole minutes left to pick a technician (0 when the time is up), or null when no clock is running. */
export function minutesToPick(booking: Booking, now = Date.now()): number | null {
  if (booking.status !== 'รอเลือกช่าง' || !booking.offerDeadline) return null;
  return Math.max(0, Math.ceil((new Date(booking.offerDeadline).getTime() - now) / 60000));
}
