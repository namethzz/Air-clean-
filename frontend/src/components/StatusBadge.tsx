import type { BookingStatus } from '../types';
const toneMap: Record<string, string> = { 'รอยืนยัน': 'warning', 'ยืนยันแล้ว': 'confirmed', 'กำลังดำเนินการ': 'progress', 'เสร็จสิ้น': 'success', 'ยกเลิก': 'neutral', 'ใกล้ถึงรอบ': 'warning', 'สุขภาพดี': 'success', 'ควรตรวจเช็ก': 'danger' };
export default function StatusBadge({ status }: { status: BookingStatus | string }) {
  return <span className={`status-badge ${toneMap[status] ?? 'neutral'}`}><span className="status-dot"/>{status}</span>;
}