import type { AppState, Technician } from '../types';

export const demoTechnicians: Technician[] = [
  { id: 1, name: 'ธนกร ใจดี', initials: 'ธก', title: 'ช่างแอร์อาวุโส', rating: 4.9, reviewCount: 128, jobsCompleted: 426, basePrice: 550, area: 'ลาดพร้าว · วังทองหลาง', verified: true, availableText: 'วันนี้ 14:00 เป็นต้นไป', skills: ['ล้างแอร์ผนัง', 'ตรวจเช็กระบบ', 'แอร์หลายเครื่อง'], accent: 'sage', matchScore: 96, matchReason: 'อยู่ในพื้นที่ · มีคิวว่าง · คะแนนรีวิวสูง' },
  { id: 2, name: 'ปกรณ์ มั่นคง', initials: 'ปม', title: 'ช่างระบบปรับอากาศ', rating: 4.8, reviewCount: 86, jobsCompleted: 301, basePrice: 500, area: 'จตุจักร · ลาดพร้าว', verified: true, availableText: 'พรุ่งนี้ 09:00–12:00', skills: ['ล้างแอร์ผนัง', 'แอร์แขวน', 'งานอาคาร'], accent: 'blue', matchScore: 91, matchReason: 'ราคาเหมาะสม · มีประสบการณ์งานอาคาร' },
  { id: 3, name: 'อาทิตย์ แสงทอง', initials: 'อส', title: 'ช่างอิสระ', rating: 4.7, reviewCount: 54, jobsCompleted: 174, basePrice: 450, area: 'ห้วยขวาง · ดินแดง', verified: true, availableText: 'พรุ่งนี้ 13:00 เป็นต้นไป', skills: ['ล้างแอร์ผนัง', 'ตรวจท่อน้ำทิ้ง'], accent: 'sand', matchScore: 86, matchReason: 'ราคาเริ่มต้นดี · รับงานในบริเวณใกล้เคียง' },
];

export const initialState: AppState = {
  technicians: demoTechnicians,
  summary: { totalUnits: 4, upcomingBookings: 2, serviceCompletion: 92, totalSpent: 4650 },
  bookings: [
    { id: 1001, code: 'AC-26018', customer: 'คุณนที', technicianId: 1, technician: 'ธนกร ใจดี', technicianInitials: 'ธก', service: 'ล้างแอร์ผนัง', unitLabel: 'ห้องนอน · Daikin 12,000 BTU', address: 'ลาดพร้าว 71, กรุงเทพฯ', date: '2026-10-15', time: '10:30', price: 550, status: 'ยืนยันแล้ว', createdAt: '2026-10-11' },
    { id: 1002, code: 'AC-26021', customer: 'คุณนที', technicianId: 2, technician: 'ปกรณ์ มั่นคง', technicianInitials: 'ปม', service: 'ล้างแอร์ + ตรวจเช็ก', unitLabel: 'ห้องทำงาน · Mitsubishi 18,000 BTU', address: 'ลาดพร้าว 71, กรุงเทพฯ', date: '2026-10-18', time: '13:00', price: 850, status: 'รอยืนยัน', createdAt: '2026-10-12' },
    { id: 1003, code: 'AC-25987', customer: 'คุณนที', technicianId: 1, technician: 'ธนกร ใจดี', technicianInitials: 'ธก', service: 'ล้างแอร์ผนัง', unitLabel: 'ห้องนั่งเล่น · Daikin 18,000 BTU', address: 'ลาดพร้าว 71, กรุงเทพฯ', date: '2026-09-15', time: '09:30', price: 650, status: 'เสร็จสิ้น', createdAt: '2026-09-12' },
    { id: 1004, code: 'AC-25912', customer: 'คุณนที', technicianId: 3, technician: 'อาทิตย์ แสงทอง', technicianInitials: 'อส', service: 'ล้างแอร์ผนัง', unitLabel: 'ห้องนอนเล็ก · Carrier 9,000 BTU', address: 'ลาดพร้าว 71, กรุงเทพฯ', date: '2026-08-10', time: '11:00', price: 450, status: 'เสร็จสิ้น', createdAt: '2026-08-08' },
  ],
  airConditioners: [
    { id: 1, label: 'แอร์ห้องนอน', room: 'Bedroom 01', brand: 'Daikin', model: 'FTKF12WV2S', type: 'ติดผนัง · 12,000 BTU', lastServiceDate: '2026-09-15', nextServiceDate: '2027-03-15', health: 'good', serialNumber: 'DK-1182-9041', services: [{ id: 1, date: '2026-09-15', technician: 'ธนกร ใจดี', service: 'ล้างแอร์มาตรฐาน', price: 550, summary: 'ทำความสะอาดแผ่นกรอง คอยล์เย็น และตรวจสอบการระบายน้ำ', status: 'เสร็จสิ้น' }, { id: 2, date: '2026-03-03', technician: 'ธนกร ใจดี', service: 'ล้างแอร์มาตรฐาน', price: 550, summary: 'ระบบทำงานปกติ ไม่พบการรั่วซึม', status: 'เสร็จสิ้น' }] },
    { id: 2, label: 'แอร์ห้องนั่งเล่น', room: 'Living room', brand: 'Daikin', model: 'FTKF18WV2S', type: 'ติดผนัง · 18,000 BTU', lastServiceDate: '2026-07-10', nextServiceDate: '2027-01-10', health: 'due', serialNumber: 'DK-2083-1138', services: [{ id: 3, date: '2026-07-10', technician: 'ปกรณ์ มั่นคง', service: 'ล้างแอร์มาตรฐาน', price: 650, summary: 'ล้างชุดคอยล์และตรวจเช็กท่อน้ำทิ้ง', status: 'เสร็จสิ้น' }] },
    { id: 3, label: 'แอร์ห้องทำงาน', room: 'Workspace', brand: 'Mitsubishi', model: 'MSY-KY18VF', type: 'ติดผนัง · 18,000 BTU', lastServiceDate: '2026-05-22', nextServiceDate: '2026-11-22', health: 'good', serialNumber: 'MS-7701-4510', services: [{ id: 4, date: '2026-05-22', technician: 'ธนกร ใจดี', service: 'ล้างแอร์ + ตรวจเช็ก', price: 850, summary: 'กระแสลมและอุณหภูมิอยู่ในเกณฑ์ปกติ', status: 'เสร็จสิ้น' }] },
    { id: 4, label: 'แอร์ห้องนอนเล็ก', room: 'Bedroom 02', brand: 'Carrier', model: '42TVAA010', type: 'ติดผนัง · 9,000 BTU', lastServiceDate: '2026-04-10', nextServiceDate: '2026-10-10', health: 'attention', serialNumber: 'CA-2103-6782', services: [{ id: 5, date: '2026-04-10', technician: 'อาทิตย์ แสงทอง', service: 'ล้างแอร์มาตรฐาน', price: 450, summary: 'แนะนำให้ตรวจเช็กอีกครั้งหากมีน้ำหยดหรือความเย็นลดลง', status: 'เสร็จสิ้น' }] },
  ],
  batchBookings: [
    { id: 501, code: 'BT-0031', building: 'The Green Residence', address: 'ลาดพร้าว 101, กรุงเทพฯ', unitCount: 20, completedUnits: 12, scheduledDate: '2026-10-20', status: 'ยืนยันแล้ว', quote: 9800 },
    { id: 502, code: 'BT-0028', building: 'Park View Apartment', address: 'จตุจักร, กรุงเทพฯ', unitCount: 12, completedUnits: 12, scheduledDate: '2026-10-06', status: 'เสร็จสิ้น', quote: 5700 },
  ],
};