import type { BookingStatus } from '../types';
const toneMap: Record<string, string> = { 'เปิดรับช่าง': 'info', 'รอเลือกช่าง': 'warning', 'รอยืนยัน': 'warning', 'ยืนยันแล้ว': 'confirmed', 'กำลังเดินทาง': 'progress', 'ถึงหน้างาน': 'progress', 'กำลังดำเนินการ': 'progress', 'รอชำระเงิน': 'warning', 'มีปัญหาการชำระเงิน': 'danger', 'เสร็จสิ้น': 'success', 'ยกเลิก': 'neutral', 'ใกล้ถึงรอบ': 'warning', 'สุขภาพดี': 'success', 'ควรตรวจเช็ก': 'danger' };
export default function StatusBadge({ status }: { status: BookingStatus | string }) {
  return <span className={`status-badge ${toneMap[status] ?? 'neutral'}`}><span className="status-dot"/>{status}</span>;
}