import type { Booking, BookingStatus, ServiceReportRecord } from '../types';

/** The five stages a customer sees, in order. Every booking status maps onto one of them. */
export const journeySteps = ['ส่งคำขอ', 'เลือกช่าง', 'ช่างมาหา', 'ล้างแอร์', 'จ่ายเงิน'] as const;

/** Index of the stage that is happening now. 5 means every stage is done, -1 means cancelled. */
export function currentStep(status: BookingStatus): number {
  switch (status) {
    case 'เปิดรับช่าง':
    case 'รอเลือกช่าง': return 1;
    case 'รอยืนยัน':
    case 'ยืนยันแล้ว':
    case 'กำลังเดินทาง': return 2;
    case 'ถึงหน้างาน':
    case 'กำลังดำเนินการ': return 3;
    case 'รอชำระเงิน':
    case 'มีปัญหาการชำระเงิน': return 4;
    case 'เสร็จสิ้น': return 5;
    default: return -1;
  }
}

export const isClosed = (booking: Booking) => booking.status === 'เสร็จสิ้น' || booking.status === 'ยกเลิก';

export interface JobGuide {
  /** One line on the list row. */
  short: string;
  /** Headline on the detail page. */
  title: string;
  /** What is going on and what, if anything, the customer should do. */
  hint: string;
}

export function guideFor(booking: Booking): JobGuide {
  const tech = booking.technician && booking.technician !== '-' ? booking.technician : 'ช่าง';
  const offers = booking.applicants?.length ?? 0;
  switch (booking.status) {
    case 'เปิดรับช่าง':
      return { short: 'รอช่างเสนอราคา', title: 'กำลังรอช่างเสนอราคา', hint: 'ช่างใกล้บ้านเห็นคำขอของคุณแล้ว ข้อเสนอจะแสดงที่หน้านี้ ไม่ต้องทำอะไรในตอนนี้' };
    case 'รอเลือกช่าง':
      return { short: offers ? `ช่าง ${offers} คนเสนอราคา` : 'มีช่างสนใจแล้ว', title: offers ? `มีช่าง ${offers} คนเสนอราคา` : 'มีช่างสนใจงานของคุณ', hint: 'เปรียบเทียบราคาและโปรไฟล์ แล้วเลือกช่างหนึ่งคน ที่อยู่เต็มของคุณจะเปิดให้เฉพาะช่างที่เลือก' };
    case 'รอยืนยัน':
      return { short: `รอ${tech}ตอบรับ`, title: `รอ${tech}ตอบรับ`, hint: 'ช่างยังไม่ได้ยืนยันนัดหมาย' };
    case 'ยืนยันแล้ว':
      return { short: `${tech}รับงานแล้ว`, title: `${tech}รับงานแล้ว`, hint: 'ช่างจะออกเดินทางตามวันและเวลานัด เมื่อเริ่มเดินทางคุณจะเห็นตำแหน่งช่างที่หน้านี้' };
    case 'กำลังเดินทาง':
      return { short: `${tech}กำลังเดินทางมา`, title: `${tech}กำลังเดินทางมาหาคุณ`, hint: 'ดูตำแหน่งล่าสุดของช่างบนแผนที่' };
    case 'ถึงหน้างาน':
      return { short: `${tech}มาถึงแล้ว`, title: `${tech}มาถึงแล้ว`, hint: 'ช่างอยู่ที่หน้างานและกำลังจะเริ่มล้างแอร์' };
    case 'กำลังดำเนินการ':
      return { short: `${tech}กำลังล้างแอร์`, title: `${tech}กำลังล้างแอร์`, hint: 'เมื่อล้างเสร็จ ช่างจะแจ้งในระบบและคุณจะชำระเงินที่หน้างาน' };
    case 'รอชำระเงิน':
      return { short: 'ล้างเสร็จแล้ว รอชำระเงิน', title: 'ล้างเสร็จแล้ว ชำระเงินหน้างาน', hint: 'จ่ายเงินให้ช่าง แล้วกดยืนยันด้านล่าง เมื่อช่างยืนยันว่าได้รับเงินแล้ว งานจะปิด' };
    case 'มีปัญหาการชำระเงิน':
      return { short: 'ผู้ดูแลกำลังตรวจสอบ', title: 'ผู้ดูแลกำลังตรวจสอบการชำระเงิน', hint: 'ระบบยังไม่ถือว่างานนี้ชำระเงินสำเร็จ รอผู้ดูแลติดต่อกลับ' };
    case 'เสร็จสิ้น':
      return { short: 'งานเสร็จสมบูรณ์', title: 'งานเสร็จสมบูรณ์', hint: 'ขอบคุณที่ใช้บริการ' };
    default:
      return { short: 'ยกเลิกแล้ว', title: 'ยกเลิกคำขอแล้ว', hint: 'คำขอนี้ไม่ได้ส่งให้ช่างอีกต่อไป' };
  }
}

/** True when the customer is the one who has to act next. */
export function needsAction(booking: Booking, reports: ServiceReportRecord[]): boolean {
  if (booking.status === 'รอเลือกช่าง') return (booking.applicants?.length ?? 0) > 0;
  if (booking.status === 'รอชำระเงิน') return !booking.customerConfirmedPayment;
  return reports.some(report => report.bookingId === booking.id && !report.customerApproved);
}

/** Jobs that need the customer first, then the soonest appointment. */
export function sortJobs(bookings: Booking[], reports: ServiceReportRecord[]): Booking[] {
  return [...bookings].sort((a, b) => {
    const urgent = Number(needsAction(b, reports)) - Number(needsAction(a, reports));
    if (urgent) return urgent;
    return (a.date + a.time).localeCompare(b.date + b.time);
  });
}

/* ───────────── Technician side ───────────── */

export const techSteps = ['รับงาน', 'เดินทาง', 'ถึงหน้างาน', 'ล้างแอร์', 'รับเงิน'] as const;

/** Stage a technician is on. 5 means all done, -1 means cancelled. */
export function techStep(status: BookingStatus): number {
  switch (status) {
    case 'รอยืนยัน': return 0;
    case 'ยืนยันแล้ว':
    case 'กำลังเดินทาง': return 1;
    case 'ถึงหน้างาน':
    case 'กำลังดำเนินการ': return 3;
    case 'รอชำระเงิน':
    case 'มีปัญหาการชำระเงิน': return 4;
    case 'เสร็จสิ้น': return 5;
    default: return -1;
  }
}

export function techGuide(booking: Booking): JobGuide {
  switch (booking.status) {
    case 'รอยืนยัน':
      return { short: 'รอคุณตอบรับ', title: 'ลูกค้าเลือกคุณแล้ว', hint: 'กดรับงานเพื่อยืนยันนัดหมาย' };
    case 'ยืนยันแล้ว':
      return { short: 'พร้อมออกเดินทาง', title: 'นัดหมายยืนยันแล้ว', hint: 'เมื่อออกเดินทางให้กดเริ่ม ระบบจะแชร์ตำแหน่งของคุณให้ลูกค้าเห็นจนกว่าจะถึงหน้างาน' };
    case 'กำลังเดินทาง':
      return { short: 'กำลังเดินทาง', title: 'กำลังเดินทางไปหาลูกค้า', hint: 'เปิดหน้านี้ไว้เพื่อให้ตำแหน่งอัปเดต การล็อกหน้าจอหรือสลับแอปอาจทำให้ตำแหน่งหยุดส่ง' };
    case 'ถึงหน้างาน':
      return { short: 'ถึงหน้างานแล้ว', title: 'ถึงหน้างานแล้ว', hint: 'ระบบหยุดแชร์ตำแหน่งแล้ว เริ่มล้างแอร์ได้เมื่อพร้อม' };
    case 'กำลังดำเนินการ':
      return { short: 'กำลังล้างแอร์', title: 'กำลังล้างแอร์', hint: 'เมื่อเสร็จ ให้บันทึกรายงานสั้น ๆ แล้วกดงานเสร็จ ลูกค้าจะชำระเงินที่หน้างาน' };
    case 'รอชำระเงิน':
      return { short: booking.technicianConfirmedPayment ? 'รอลูกค้ายืนยัน' : 'รอรับเงิน', title: 'รอรับเงินหน้างาน', hint: 'เมื่อได้รับเงินจากลูกค้าแล้วให้กดยืนยัน เมื่อทั้งสองฝ่ายยืนยัน งานจะปิด' };
    case 'มีปัญหาการชำระเงิน':
      return { short: 'ผู้ดูแลกำลังตรวจสอบ', title: 'ผู้ดูแลกำลังตรวจสอบการชำระเงิน', hint: 'ระบบยังไม่ถือว่างานนี้ชำระเงินสำเร็จ รอผู้ดูแลติดต่อกลับ' };
    case 'เสร็จสิ้น':
      return { short: 'งานเสร็จสมบูรณ์', title: 'งานเสร็จสมบูรณ์', hint: 'ลูกค้าและช่างยืนยันการชำระเงินครบแล้ว' };
    default:
      return { short: 'ยกเลิกแล้ว', title: 'งานนี้ถูกยกเลิก', hint: 'ไม่ต้องดำเนินการเพิ่ม' };
  }
}

/** True when the technician is the one who has to act next. */
export function techNeedsAction(booking: Booking): boolean {
  if (booking.status === 'รอชำระเงิน') return !booking.technicianConfirmedPayment;
  return ['รอยืนยัน', 'ยืนยันแล้ว', 'ถึงหน้างาน', 'กำลังดำเนินการ'].includes(booking.status);
}

/** Jobs that need the technician first, then the soonest appointment. */
export function sortByNeed(bookings: Booking[], needs: (booking: Booking) => boolean): Booking[] {
  return [...bookings].sort((a, b) => {
    const urgent = Number(needs(b)) - Number(needs(a));
    return urgent || (a.date + a.time).localeCompare(b.date + b.time);
  });
}
