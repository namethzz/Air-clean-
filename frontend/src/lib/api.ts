import type { AirConditioner, BatchBooking, Booking, PaymentMethod, SavedAddress, ServiceReportRecord, Technician, TechnicianApplication, UserProfile, UserRole } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const TOKEN_KEY = 'aircare.auth.token';

export interface CreateServiceReportPayload {
  bookingId: number; summary: string; cleanedFilter: boolean; cleanedCoil: boolean;
  checkedDrain: boolean; checkedCooling: boolean; beforePhotoUrl?: string; afterPhotoUrl?: string;
}
interface ApiUser { id: number; fullName: string; email: string; role: string; hasPassword?: boolean; providers?: string[] | null }
interface AuthResponse { token: string; expiresAt: string; user: ApiUser }
export class ApiError extends Error {
  constructor(message: string, public status?: number, public data?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
  get code(): string | undefined { return typeof this.data?.code === 'string' ? this.data.code : undefined; }
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
function fromApiUser(user: ApiUser): UserProfile {
  return { id: user.id, fullName: user.fullName, email: user.email, role: roleFromApi(user.role), hasPassword: user.hasPassword ?? true, providers: user.providers ?? [] };
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
    let data: Record<string, unknown> | undefined;
    try {
      const body = await response.json() as { message?: string; title?: string; errors?: Record<string, string[]> };
      data = body as Record<string, unknown>;
      message = body.message || body.title || Object.values(body.errors || {}).flat().join(' ');
    } catch { /* Keep the status-based message. */ }
    if (!message) message = response.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ'
      : response.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว'
      : response.status === 404 ? 'ไม่พบข้อมูลที่ต้องการ'
      : response.status >= 500 ? 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง'
      : 'ทำรายการไม่สำเร็จ (' + response.status + ')';
    throw new ApiError(message, response.status, data);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function login(email: string, password: string): Promise<UserProfile> {
  const result = await request<AuthResponse>('/auth/login', { method:'POST', body:JSON.stringify({ email:email.trim(), password }) });
  saveToken(result.token);
  return fromApiUser(result.user);
}
export interface TechnicianApplicationFields { phone:string; serviceArea:string; experienceYears:number; }
export async function register(fullName: string, email: string, password: string, role: Exclude<UserRole, 'admin'> = 'customer', technician?: TechnicianApplicationFields): Promise<UserProfile> {
  const result = await request<AuthResponse>('/auth/register', { method:'POST', body:JSON.stringify({ fullName:fullName.trim(), email:email.trim(), password, role, ...(role==='technician'&&technician?{ phone:technician.phone.trim(), serviceArea:technician.serviceArea.trim(), experienceYears:technician.experienceYears }:{}) }) });
  saveToken(result.token);
  return fromApiUser(result.user);
}
export async function updateMyProfile(payload: { fullName: string; email: string }): Promise<UserProfile> {
  const result = await request<ApiUser>('/auth/profile', {
    method:'PATCH', body:JSON.stringify({ fullName:payload.fullName.trim(), email:payload.email.trim() })
  });
  return fromApiUser(result);
}
export async function forgotPassword(email: string): Promise<string> {
  const result = await request<{ message: string }>('/auth/forgot-password', { method:'POST', body:JSON.stringify({ email:email.trim() }) });
  return result.message;
}
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const result = await request<{ message: string }>('/auth/reset-password', { method:'POST', body:JSON.stringify({ token, newPassword }) });
  return result.message;
}
/** Other devices are signed out; this browser keeps working with the new token. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<UserProfile> {
  const result = await request<AuthResponse>('/auth/change-password', { method:'POST', body:JSON.stringify({ currentPassword, newPassword }) });
  saveToken(result.token);
  return fromApiUser(result.user);
}
export interface ExternalSignupFields { role: Exclude<UserRole,'admin'>; fullName?: string; phone?: string; serviceArea?: string; experienceYears?: number; }
/** Signs in with a Google or Apple ID token. Without `signup`, an unknown account throws ApiError with code 'signup_required'. */
export async function externalLogin(provider: 'google'|'apple', idToken: string, signup?: ExternalSignupFields): Promise<UserProfile> {
  const result = await request<AuthResponse>('/auth/external', { method:'POST', body:JSON.stringify({ provider, idToken, createAccount:Boolean(signup), ...signup }) });
  saveToken(result.token);
  return fromApiUser(result.user);
}
export async function sendTestEmail(email: string): Promise<string> {
  return (await request<{ message: string }>('/admin/test-email', { method:'POST', body:JSON.stringify({ email:email.trim() }) })).message;
}
export async function createPasswordResetLink(email: string): Promise<{ link: string; expiresAt: string; fullName: string }> {
  return request('/admin/password-reset-links', { method:'POST', body:JSON.stringify({ email:email.trim() }) });
}
interface SavedAddressResponse { id:number; label:string; placeType:SavedAddress['placeType']; address:string; building?:string|null; floor?:string|null; room?:string|null; note?:string|null; latitude:number; longitude:number; }
function fromApiAddress(item: SavedAddressResponse): SavedAddress {
  return { id:String(item.id), label:item.label, placeType:item.placeType, address:item.address, building:item.building??undefined,
    floor:item.floor??undefined, room:item.room??undefined, note:item.note??undefined, latitude:item.latitude, longitude:item.longitude, locationSelected:true };
}
export async function fetchSavedAddresses(): Promise<SavedAddress[]> {
  return (await request<SavedAddressResponse[]>('/me/addresses')).map(fromApiAddress);
}
export async function saveAddress(item: SavedAddress): Promise<SavedAddress> {
  const { label, placeType, address, building, floor, room, note, latitude, longitude } = item;
  return fromApiAddress(await request<SavedAddressResponse>('/me/addresses', { method:'POST', body:JSON.stringify({ label, placeType, address, building, floor, room, note, latitude, longitude }) }));
}
export async function deleteSavedAddress(id: string): Promise<void> {
  return request<void>('/me/addresses/' + encodeURIComponent(id), { method:'DELETE' });
}
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  if (!localStorage.getItem(TOKEN_KEY)) { clearAuth(); return null; }
  try {
    return fromApiUser(await request<ApiUser>('/auth/me'));
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
export async function fetchTechnicianApplications():Promise<TechnicianApplication[]> {
  return request<TechnicianApplication[]>('/admin/technicians');
}
export async function setTechnicianVerification(id:number,verified:boolean,note?:string):Promise<TechnicianApplication> {
  return request<TechnicianApplication>('/technicians/'+id+'/verification',{method:'PATCH',body:JSON.stringify({verified,note})});
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
  title: string; area: string; basePrice: number; availableText: string; skills: string; phone: string; experienceYears: number;
}
export function fetchMyTechnicianProfile(): Promise<TechnicianApplication> { return request<TechnicianApplication>('/technicians/me'); }
export function updateMyTechnicianProfile(payload: TechnicianProfilePayload): Promise<TechnicianApplication> {
  return request<TechnicianApplication>('/technicians/me', { method: 'PATCH', body: JSON.stringify(payload) });
}
