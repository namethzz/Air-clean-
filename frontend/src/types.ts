export type PageKey = 'overview' | 'technicians' | 'bookings' | 'passport' | 'batch' | 'reports';
export type UserRole = 'customer' | 'technician' | 'manager' | 'admin';
export type BookingStatus = 'รอยืนยัน' | 'ยืนยันแล้ว' | 'กำลังดำเนินการ' | 'เสร็จสิ้น' | 'ยกเลิก';

export interface Technician {
  id: number; name: string; initials: string; title: string; rating: number; reviewCount: number;
  jobsCompleted: number; basePrice: number; area: string; verified: boolean; availableText: string;
  skills: string[]; accent: string; matchScore: number; matchReason: string;
}
export interface ServiceRecord {
  id: number; date: string; technician: string; service: string; price: number; summary: string;
  status: 'เสร็จสิ้น' | 'รอตรวจสอบ';
}
export interface AirConditioner {
  id: number; label: string; room: string; brand: string; model: string; type: string;
  lastServiceDate: string; nextServiceDate: string; health: 'good' | 'due' | 'attention';
  serialNumber: string; services: ServiceRecord[];
}
export interface Booking {
  id: number; code: string; customer: string; technicianId: number; technician: string; technicianInitials: string;
  service: string; unitLabel: string; address: string; date: string; time: string; price: number;
  status: BookingStatus; createdAt: string;
}
export interface BatchBooking {
  id: number; code: string; building: string; address: string; unitCount: number; completedUnits: number;
  scheduledDate: string; status: string; quote: number;
}
export interface DashboardSummary { totalUnits: number; upcomingBookings: number; serviceCompletion: number; totalSpent: number; }
export interface AppState {
  technicians: Technician[]; airConditioners: AirConditioner[]; bookings: Booking[];
  batchBookings: BatchBooking[]; summary: DashboardSummary;
}