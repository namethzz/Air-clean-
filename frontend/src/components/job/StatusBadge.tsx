import type { BookingStatus } from '../../types';

/** Status colours carry meaning only: blue is moving, amber waits, teal is done, red is a problem. */
const toneMap: Record<string, '' | 'is-active' | 'is-wait' | 'is-done' | 'is-problem'> = {
  'เปิดรับช่าง': 'is-active', 'รอเลือกช่าง': 'is-wait', 'รอยืนยัน': 'is-wait', 'ยืนยันแล้ว': 'is-done',
  'กำลังเดินทาง': 'is-active', 'ถึงหน้างาน': 'is-active', 'กำลังดำเนินการ': 'is-active', 'รอชำระเงิน': 'is-wait',
  'มีปัญหาการชำระเงิน': 'is-problem', 'เสร็จสิ้น': 'is-done', 'ยกเลิก': '', 'หมดเวลาเลือกช่าง': 'is-problem',
  'ใกล้ถึงรอบ': 'is-wait', 'สุขภาพดี': 'is-done', 'ควรตรวจเช็ก': 'is-problem',
};
export default function StatusBadge({ status }: { status: BookingStatus | string }) {
  return <span className={'ui-badge ' + (toneMap[status] ?? '')}>{status}</span>;
}
