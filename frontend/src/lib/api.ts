import type { AirConditioner, BatchBooking, Booking, DashboardSummary, PaymentMethod, Technician } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const TOKEN_KEY = 'aircare.demo.token';
type DemoRole = 'customer' | 'technician' | 'manager' | 'admin';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new Error('Demo mode');
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function loginAsDemo(role: DemoRole): Promise<void> {
  localStorage.setItem('aircare.demo.role', role);
  if (!API_BASE) return;
  const credentials = {
    customer: { email: 'customer@aircare.demo', password: 'Aircare123!' },
    technician: { email: 'technician@aircare.demo', password: 'Aircare123!' },
    manager: { email: 'manager@aircare.demo', password: 'Aircare123!' },
    admin: { email: 'admin@aircare.demo', password: 'Aircare123!' },
  };
  const response = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials[role]) });
  if (!response.ok) throw new Error('Demo sign-in failed');
  const result = await response.json() as { token: string };
  localStorage.setItem(TOKEN_KEY, result.token);
}

export async function tryDemoLogin(): Promise<void> {
  if (!API_BASE || localStorage.getItem(TOKEN_KEY)) return;
  const role = (localStorage.getItem('aircare.demo.role') as DemoRole | null) ?? 'customer';
  try { await loginAsDemo(role); } catch { /* Fall back to local demo data if the API is offline. */ }
}
export async function fetchDashboard(): Promise<DashboardSummary> { return request<DashboardSummary>('/dashboard'); }
export async function fetchTechnicians(): Promise<Technician[]> { return request<Technician[]>('/technicians'); }
export async function fetchBookings(): Promise<Booking[]> { return request<Booking[]>('/bookings'); }
export async function fetchAirConditioners(): Promise<AirConditioner[]> { return request<AirConditioner[]>('/air-conditioners'); }
export async function fetchBatchBookings(): Promise<BatchBooking[]> { return request<BatchBooking[]>('/batch-bookings'); }
export async function createBooking(payload: { technicianId: number; service: string; unitLabel: string; address: string; scheduledAt: string; price: number; notes?: string; latitude?: number; longitude?: number }): Promise<Booking> {
  return request<Booking>('/bookings', { method: 'POST', body: JSON.stringify(payload) });
}
export async function createBatchBooking(payload: { buildingName: string; address: string; unitCount: number; scheduledDate: string; notes?: string }): Promise<BatchBooking> {
  return request<BatchBooking>('/batch-bookings', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateBookingStatus(id: number, status: string): Promise<void> {
  return request<void>(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function updateTechnicianLocation(id: number, payload: { latitude: number; longitude: number; accuracy?: number }): Promise<void> {
  return request<void>(`/bookings/${id}/location`, { method: 'POST', body: JSON.stringify(payload) });
}
export async function confirmOnsitePayment(id: number, method: PaymentMethod): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/payment-confirmation`, { method: 'PATCH', body: JSON.stringify({ method, confirmed: true }) });
}
export async function reportPaymentIssue(id: number, reason: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/payment-issue`, { method: 'POST', body: JSON.stringify({ reason }) });
}
