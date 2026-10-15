import type { AirConditioner, BatchBooking, Booking, PaymentMethod, ServiceReportRecord, Technician, UserProfile, UserRole } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const TOKEN_KEY = 'aircare.auth.token';

export interface CreateServiceReportPayload {
  bookingId: number; summary: string; cleanedFilter: boolean; cleanedCoil: boolean;
  checkedDrain: boolean; checkedCooling: boolean; beforePhotoUrl?: string; afterPhotoUrl?: string;
}
interface AuthResponse { token: string; expiresAt: string; user: { id: number; fullName: string; email: string; role: string } }
export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = 'ApiError'; }
}
export function isApiConfigured(): boolean { return Boolean(API_BASE); }
function requireApiBase(): string {
  if (!API_BASE) throw new ApiError('ยังไม่ได้ตั้งค่าที่อยู่ API กรุณาตั้งค่า VITE_API_BASE_URL ใน Render ก่อนเปิดใช้งาน');
  return API_BASE;
}
function roleFromApi(role: string): UserRole {
  switch (role.toLowerCase()) {
    case 'technician': return 'technician';
    case 'manager': return 'manager';
    case 'admin': return 'admin';
    default: return 'customer';
  }
}
function fromApiUser(user: AuthResponse['user']): UserProfile {
  return { id: user.id, fullName: user.fullName, email: user.email, role: roleFromApi(user.role) };
}
function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem('aircare.demo.token');
  localStorage.removeItem('aircare.demo.role');
}
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('aircare.demo.token');
  localStorage.removeItem('aircare.demo.role');
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = requireApiBase();
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  let response: Response;
  try { response = await fetch(base + path, { ...options, headers }); }
  catch { throw new ApiError('เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือสถานะเซิร์ฟเวอร์'); }
  if (!response.ok) {
    let message = '';
    try {
      const body = await response.json() as { message?: string; title?: string; errors?: Record<string, string[]> };
      message = body.message || body.title || Object.values(body.errors || {}).flat().join(' ');
    } catch { /* Keep the status-based message. */ }
    if (!message) message = response.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ'
      : response.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว'
      : response.status === 404 ? 'ไม่พบข้อมูลที่ต้องการ'
      : response.status >= 500 ? 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง'
      : 'ทำรายการไม่สำเร็จ (' + response.status + ')';
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function login(email: string, password: string): Promise<UserProfile> {
  const result = await request<AuthResponse>('/auth/login', { method:'POST', body:JSON.stringify({ email:email.trim(), password }) });
  saveToken(result.token);
  return fromApiUser(result.user);
}
export async function register(fullName: string, email: string, password: string, role: Exclude<UserRole, 'admin'> = 'customer'): Promise<UserProfile> {
  const result = await request<AuthResponse>('/auth/register', { method:'POST', body:JSON.stringify({ fullName:fullName.trim(), email:email.trim(), password, role }) });
  saveToken(result.token);
  return fromApiUser(result.user);
}
export async function updateMyProfile(payload: { fullName: string; email: string }): Promise<UserProfile> {
  const result = await request<{ id:number; fullName:string; email:string; role:string }>('/auth/profile', {
    method:'PATCH', body:JSON.stringify({ fullName:payload.fullName.trim(), email:payload.email.trim() })
  });
  return { id:result.id, fullName:result.fullName, email:result.email, role:roleFromApi(result.role) };
}
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  if (!localStorage.getItem(TOKEN_KEY)) { clearAuth(); return null; }
  try {
    const result = await request<{id:number;fullName:string;email:string;role:string}>('/auth/me');
    return { id:result.id, fullName:result.fullName, email:result.email, role:roleFromApi(result.role) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { clearAuth(); return null; }
    throw error;
  }
}
export async function fetchTechnicians(): Promise<Technician[]> { return request<Technician[]>('/technicians'); }
export async function fetchBookings(): Promise<Booking[]> { return request<Booking[]>('/bookings'); }
export async function fetchAirConditioners(): Promise<AirConditioner[]> { return request<AirConditioner[]>('/air-conditioners'); }
export async function fetchBatchBookings(): Promise<BatchBooking[]> { return request<BatchBooking[]>('/batch-bookings'); }
export async function fetchServiceReports(): Promise<ServiceReportRecord[]> { return request<ServiceReportRecord[]>('/service-reports'); }
export async function createBooking(payload: {
  service:string; unitLabel:string; propertyType:string; unitCount:number; address:string; scheduledAt:string;
  price:number; notes?:string; latitude?:number; longitude?:number; airConditionerId?:number;
}): Promise<Booking> {
  return request<Booking>('/bookings', { method:'POST', body:JSON.stringify(payload) });
}
export async function fetchNearbyJobs(latitude:number,longitude:number,radiusKm=25):Promise<Booking[]> {
  const query=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),radiusKm:String(radiusKm)});
  return request<Booking[]>('/technician-jobs?'+query.toString());
}
export async function applyForBooking(id:number,note?:string):Promise<Booking> {
  return request<Booking>('/bookings/'+id+'/applications',{method:'POST',body:JSON.stringify({note})});
}
export async function confirmBookingTechnician(id:number,technicianId:number):Promise<Booking> {
  return request<Booking>('/bookings/'+id+'/confirm-technician',{method:'POST',body:JSON.stringify({technicianId})});
}
export interface AirConditionerPayload {
  label:string; room?:string; brand?:string; model?:string; type?:string; serialNumber?:string; lastServiceDate?:string;
}
export async function createAirConditioner(payload:AirConditionerPayload):Promise<AirConditioner> {
  return request<AirConditioner>('/air-conditioners',{method:'POST',body:JSON.stringify(payload)});
}
export async function deleteAirConditioner(id:number):Promise<void> {
  return request<void>('/air-conditioners/'+id,{method:'DELETE'});
}
export async function createReview(bookingId:number,rating:number,comment:string):Promise<void> {
  await request<unknown>('/bookings/'+bookingId+'/reviews',{method:'POST',body:JSON.stringify({rating,comment:comment.trim()})});
}
export async function setTechnicianVerification(id:number,verified:boolean):Promise<Technician> {
  return request<Technician>('/technicians/'+id+'/verification',{method:'PATCH',body:JSON.stringify({verified})});
}
export async function createBatchBooking(payload: {
  buildingName:string; address:string; unitCount:number; scheduledDate:string; notes?:string;
}): Promise<BatchBooking> {
  return request<BatchBooking>('/batch-bookings', { method:'POST', body:JSON.stringify(payload) });
}
export async function updateBookingStatus(id:number,status:string): Promise<void> {
  return request<void>('/bookings/' + id + '/status', { method:'PATCH', body:JSON.stringify({status}) });
}
export async function updateTechnicianLocation(id:number,payload:{latitude:number;longitude:number;accuracy?:number}): Promise<void> {
  return request<void>('/bookings/' + id + '/location', { method:'POST', body:JSON.stringify(payload) });
}
export async function confirmOnsitePayment(id:number,method:PaymentMethod): Promise<Booking> {
  return request<Booking>('/bookings/' + id + '/payment-confirmation', { method:'PATCH', body:JSON.stringify({method,confirmed:true}) });
}
export async function reportPaymentIssue(id:number,reason:string): Promise<Booking> {
  return request<Booking>('/bookings/' + id + '/payment-issue', { method:'POST', body:JSON.stringify({reason}) });
}
export async function createServiceReport(payload:CreateServiceReportPayload): Promise<void> {
  return request<void>('/service-reports', { method:'POST', body:JSON.stringify(payload) });
}
export async function approveServiceReport(id:number): Promise<void> {
  return request<void>('/service-reports/' + id + '/approve', { method:'PATCH' });
}

export interface TechnicianProfilePayload {
  title: string; area: string; basePrice: number; availableText: string; skills: string;
}
export function fetchMyTechnicianProfile(): Promise<Technician> { return request<Technician>('/technicians/me'); }
export function updateMyTechnicianProfile(payload: TechnicianProfilePayload): Promise<Technician> {
  return request<Technician>('/technicians/me', { method: 'PATCH', body: JSON.stringify(payload) });
}
