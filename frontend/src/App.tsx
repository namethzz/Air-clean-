import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Menu, RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BookingModal, { type BookingPayload } from './components/BookingModal';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import ProfilePage from './pages/ProfilePage';
import DashboardPage from './pages/DashboardPage';
import TechniciansPage from './pages/TechniciansPage';
import BookingsPage from './pages/BookingsPage';
import PassportPage from './pages/PassportPage';
import BatchPage from './pages/BatchPage';
import ReportsPage from './pages/ReportsPage';
import TrackingPage from './pages/TrackingPage';
import NearbyJobsPage from './pages/NearbyJobsPage';
import {
  approveServiceReport, applyForBooking, clearAuth, confirmBookingTechnician, confirmOnsitePayment, createBatchBooking, createBooking,
  createServiceReport, fetchAirConditioners, fetchBatchBookings, fetchBookings, fetchCurrentUser,
  fetchServiceReports, fetchTechnicians, reportPaymentIssue, updateBookingStatus, updateTechnicianLocation,
  type CreateServiceReportPayload,
} from './lib/api';
import type { AppState, Booking, BookingStatus, DashboardSummary, PageKey, PaymentMethod, UserProfile } from './types';

const pageTitles:Record<PageKey,string> = {
  overview:'ภาพรวม', technicians:'ค้นหาช่าง', nearbyJobs:'งานใกล้ฉัน', bookings:'รายการจอง',
  tracking:'ติดตามงาน', passport:'ประวัติแอร์', batch:'งานหลายเครื่อง', reports:'รายงานบริการ', profile:'โปรไฟล์ของฉัน',
};
const activeStatuses:BookingStatus[] = ['เปิดรับช่าง','รอเลือกช่าง','รอยืนยัน','ยืนยันแล้ว','กำลังเดินทาง','ถึงหน้างาน','กำลังดำเนินการ','รอชำระเงิน'];
function emptyState():AppState {
  return { technicians:[], summary:{totalUnits:0,upcomingBookings:0,serviceCompletion:0,totalSpent:0},
    bookings:[], airConditioners:[], batchBookings:[], serviceReports:[] };
}
function summarize(units:AppState['airConditioners'],bookings:Booking[]):DashboardSummary {
  return {
    totalUnits:units.length,
    upcomingBookings:bookings.filter(item=>activeStatuses.includes(item.status)).length,
    serviceCompletion:units.length?Math.round(units.filter(item=>item.services.length>0).length*100/units.length):0,
    totalSpent:bookings.filter(item=>item.status==='เสร็จสิ้น').reduce((sum,item)=>sum+item.price,0),
  };
}
function todayLabel():string {
  return new Date().toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function errorMessage(error:unknown,fallback:string):string {
  return error instanceof Error&&error.message?error.message:fallback;
}
export default function App() {
  const [visitorScreen,setVisitorScreen] = useState<'landing'|'login'|'register'>('landing');
  const [signupRole,setSignupRole] = useState<'customer'|'technician'|'manager'>('customer');
  const [page,setPage] = useState<PageKey>('overview');
  const [user,setUser] = useState<UserProfile|null>(null);
  const [state,setState] = useState<AppState>(emptyState);
  const [searchQuery,setSearchQuery] = useState('');
  const [bookingModalOpen,setBookingModalOpen] = useState(false);
  const [notice,setNotice] = useState('');
  const [apiConnected,setApiConnected] = useState(false);
  const [mobileNavOpen,setMobileNavOpen] = useState(false);
  const [checkingSession,setCheckingSession] = useState(true);
  const [isLoading,setIsLoading] = useState(false);
  const [dataError,setDataError] = useState('');
  const [sessionError,setSessionError] = useState('');
  const showNotice = useCallback((message:string) => { setNotice(message); window.setTimeout(()=>setNotice(''),3600); },[]);

  useEffect(()=>{
    let active = true;
    fetchCurrentUser()
      .then(current=>{if(active)setUser(current);})
      .catch(error=>{if(active)setSessionError(errorMessage(error,'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่'));})
      .finally(()=>{if(active)setCheckingSession(false);});
    return ()=>{active=false;};
  },[]);

  const refreshData = useCallback(async()=>{
    if(!user)return;
    setIsLoading(true);setDataError('');
    const needsUnits = user.role!=='technician';
    const needsBatch = user.role!=='technician';
    const [t,b,u,ba,r] = await Promise.allSettled([
      fetchTechnicians(),fetchBookings(),needsUnits?fetchAirConditioners():Promise.resolve([]),
      needsBatch?fetchBatchBookings():Promise.resolve([]),fetchServiceReports(),
    ]);
    const technicians = t.status==='fulfilled'?t.value:[];
    const bookings = b.status==='fulfilled'?b.value:[];
    const units = u.status==='fulfilled'?u.value:[];
    const batches = ba.status==='fulfilled'?ba.value:[];
    const reports = r.status==='fulfilled'?r.value:[];
    setState({technicians,bookings,airConditioners:units,batchBookings:batches,serviceReports:reports,summary:summarize(units,bookings)});
    setApiConnected(t.status==='fulfilled'&&b.status==='fulfilled');
    const failed:string[]=[];
    if(b.status==='rejected')failed.push('รายการจอง');
    if(t.status==='rejected')failed.push('ข้อมูลช่าง');
    if(u.status==='rejected')failed.push('ประวัติแอร์');
    if(ba.status==='rejected')failed.push('งานหลายเครื่อง');
    if(r.status==='rejected')failed.push('รายงานบริการ');
    if(failed.length)setDataError('โหลดข้อมูลบางส่วนไม่สำเร็จ: '+failed.join(', ')+' กรุณาลองโหลดใหม่');
    setIsLoading(false);
  },[user]);
  useEffect(()=>{if(user)void refreshData();},[user,refreshData]);

  function navigate(next:PageKey){setPage(next);setMobileNavOpen(false);setSearchQuery('');}
  function profileUpdated(nextUser:UserProfile){setUser(nextUser);showNotice('อัปเดตโปรไฟล์เรียบร้อยแล้ว');}
  function onAuthenticated(nextUser:UserProfile){
    setUser(nextUser);setState(emptyState());setPage('overview');setSearchQuery('');setSessionError('');setDataError('');
  }
  function logout(){
    clearAuth();setUser(null);setState(emptyState());setApiConnected(false);setPage('overview');
    setBookingModalOpen(false);setMobileNavOpen(false);setSessionError('');
  }
  function openBooking(_technicianId?:number){setBookingModalOpen(true);}

  async function bookingSubmit(payload:BookingPayload):Promise<boolean>{
    if(!user)return false;
    try{
      const saved=await createBooking({
        service:payload.service,unitLabel:payload.unitLabel,propertyType:payload.propertyType,unitCount:payload.unitCount,address:payload.address,
        scheduledAt:payload.date+'T'+payload.time+':00',price:payload.price,latitude:payload.latitude,longitude:payload.longitude,
      });
      setState(previous=>{const bookings=[saved,...previous.bookings];return {...previous,bookings,summary:summarize(previous.airConditioners,bookings)};});
      setPage('bookings');showNotice('ส่งคำขอแล้ว รอช่างใกล้เคียงส่งความสนใจ');return true;
    }catch(error){showNotice(errorMessage(error,'บันทึกการจองไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function applyForNearbyJob(id:number):Promise<boolean>{
    try{await applyForBooking(id);showNotice('ส่งความสนใจรับงานแล้ว รอลูกค้าเลือกและยืนยัน');return true;}
    catch(error){showNotice(errorMessage(error,'ส่งความสนใจไม่สำเร็จ'));return false;}
  }
  async function selectTechnician(id:number,technicianId:number):Promise<boolean>{
    try{
      const saved=await confirmBookingTechnician(id,technicianId);
      setState(previous=>{const bookings=previous.bookings.map(item=>item.id===id?saved:item);return {...previous,bookings,summary:summarize(previous.airConditioners,bookings)};});
      showNotice('ยืนยันช่างเรียบร้อยแล้ว ช่างจะเห็นงานในรายการของตน');return true;
    }catch(error){showNotice(errorMessage(error,'ยืนยันช่างไม่สำเร็จ กรุณาโหลดข้อมูลใหม่'));return false;}
  }
  async function statusChange(id:number,status:BookingStatus){
    try{
      await updateBookingStatus(id,status);
      setState(previous=>{const bookings=previous.bookings.map(item=>item.id===id?{...item,status}:item);return {...previous,bookings,summary:summarize(previous.airConditioners,bookings)};});
      showNotice(status==='ยกเลิก'?'ยกเลิกรายการแล้ว':status==='กำลังเดินทาง'?'เริ่มเดินทางแล้ว เมื่ออนุญาตตำแหน่งระบบจะอัปเดต GPS':'บันทึกสถานะงานแล้ว');
    }catch(error){showNotice(errorMessage(error,'อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่'));}
  }
  const locationUpdate=useCallback(async(id:number,latitude:number,longitude:number,accuracy?:number)=>{
    try{
      await updateTechnicianLocation(id,{latitude,longitude,accuracy});
      setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?{...item,technicianLatitude:latitude,technicianLongitude:longitude,locationAccuracy:accuracy,locationUpdatedAt:new Date().toISOString()}:item)}));
      setApiConnected(true);
      return true;
    }catch{ return false; }
  },[showNotice]);
  const paymentConfirm=useCallback(async(id:number,method:PaymentMethod)=>{
    try{
      const saved=await confirmOnsitePayment(id,method);
      setState(previous=>{const bookings=previous.bookings.map(item=>item.id===id?saved:item);return {...previous,bookings,summary:summarize(previous.airConditioners,bookings)};});
      showNotice(saved.status==='เสร็จสิ้น'?'ทั้งสองฝ่ายยืนยันแล้ว ปิดงานเรียบร้อย':'บันทึกการยืนยันแล้ว รออีกฝ่ายยืนยัน');setApiConnected(true);
    }catch(error){showNotice(errorMessage(error,'บันทึกการยืนยันไม่สำเร็จ'));}
  },[showNotice]);
  const paymentIssue=useCallback(async(id:number,reason:string)=>{
    try{const saved=await reportPaymentIssue(id,reason);setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));showNotice('ส่งเรื่องให้ผู้ดูแลตรวจสอบแล้ว');}
    catch(error){showNotice(errorMessage(error,'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่'));}
  },[showNotice]);
  const refreshBookings=useCallback(async()=>{
    try{const bookings=await fetchBookings();setState(previous=>({...previous,bookings,summary:summarize(previous.airConditioners,bookings)}));}
    catch(error){showNotice(errorMessage(error,'โหลดรายการจองไม่สำเร็จ'));}
  },[showNotice]);
  async function batchCreate(payload:{building:string;address:string;unitCount:number;date:string}):Promise<boolean>{
    try{
      const created=await createBatchBooking({buildingName:payload.building,address:payload.address,unitCount:payload.unitCount,scheduledDate:payload.date});
      setState(previous=>({...previous,batchBookings:[created,...previous.batchBookings]}));showNotice('บันทึกคำของานหลายเครื่องแล้ว');return true;
    }catch(error){showNotice(errorMessage(error,'สร้างคำของานไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function createReport(payload:CreateServiceReportPayload):Promise<boolean>{
    try{await createServiceReport(payload);await refreshData();showNotice('บันทึกรายงานบริการเรียบร้อยแล้ว');return true;}
    catch(error){showNotice(errorMessage(error,'บันทึกรายงานไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function approveReport(id:number):Promise<boolean>{
    try{await approveServiceReport(id);await refreshData();showNotice('ยืนยันรายงานบริการแล้ว');return true;}
    catch(error){showNotice(errorMessage(error,'ยืนยันรายงานไม่สำเร็จ'));return false;}
  }

  const content = useMemo(()=>{
    if(!user)return null;
    switch(page){
      case 'overview':return <DashboardPage state={state} role={user.role} userName={user.fullName} onNavigate={navigate} onNewBooking={()=>user.role==='technician'?navigate('tracking'):user.role==='manager'?navigate('batch'):openBooking()}/>;
      case 'technicians':return <TechniciansPage technicians={state.technicians} searchQuery={searchQuery} onBook={()=>openBooking()}/>;
      case 'nearbyJobs':return <NearbyJobsPage onApply={applyForNearbyJob}/>;
      case 'bookings':return <BookingsPage bookings={state.bookings} role={user.role} searchQuery={searchQuery} onNewBooking={()=>openBooking()} onNavigate={navigate} onStatusChange={statusChange} onSelectTechnician={selectTechnician} onRefresh={refreshBookings}/>;
      case 'tracking':return <TrackingPage bookings={state.bookings} role={user.role} onStatusChange={statusChange} onLocationUpdate={locationUpdate} onPaymentConfirm={paymentConfirm} onPaymentIssue={paymentIssue} onRefresh={refreshBookings}/>;
      case 'passport':return <PassportPage units={state.airConditioners}/>;
      case 'batch':return <BatchPage bookings={state.batchBookings} onCreate={batchCreate}/>;
      case 'reports':return <ReportsPage bookings={state.bookings} reports={state.serviceReports} role={user.role} onCreateReport={createReport} onApproveReport={approveReport}/>;
      case 'profile':return <ProfilePage user={user} onUpdated={profileUpdated}/>;
    }
  },[user,page,state,searchQuery,locationUpdate,paymentConfirm,paymentIssue,refreshBookings,showNotice]);

  if(checkingSession)return <div className="auth-loading"><span className="auth-brand-icon"><Activity size={23}/></span><p>กำลังตรวจสอบบัญชีของคุณ...</p></div>;
  if(!user) {
    if(visitorScreen === 'landing' && !sessionError) return <LandingPage onStart={(mode,role='customer')=>{setVisitorScreen(mode);setSignupRole(role);}}/>;
    return <AuthPage key={visitorScreen + signupRole} initialMode={visitorScreen==='register'?'register':'login'} initialRole={signupRole} initialError={sessionError} onBack={()=>{setVisitorScreen('landing');setSessionError('');}} onAuthenticated={onAuthenticated}/>;
  }

  return <div className="app-shell">
    <div className={'mobile-nav-backdrop '+(mobileNavOpen?'visible':'')} onClick={()=>setMobileNavOpen(false)} aria-hidden="true"/>
    <div className={'sidebar-container '+(mobileNavOpen?'mobile-open':'')}><Sidebar page={page} onNavigate={navigate} role={user.role} user={user} onLogout={logout}/></div>
    <main className="main-shell">
      <Topbar role={user.role} userName={user.fullName} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewBooking={()=>openBooking()} onLogout={logout}/>
      <div className="mobile-page-bar"><button className="icon-button" onClick={()=>setMobileNavOpen(true)} aria-label="เปิดเมนู"><Menu size={20}/></button><div><strong>{pageTitles[page]}</strong><span>{todayLabel()}</span></div>{user.role!=='technician'&&<button className="icon-button" onClick={()=>openBooking()} aria-label="จองบริการ"><Activity size={19}/></button>}</div>
      {dataError&&<div className="app-data-alert" role="status"><AlertCircle size={18}/><span>{dataError}</span><button className="outline-button" onClick={()=>void refreshData()}><RefreshCw size={15}/> ลองใหม่</button></div>}
      <div className="page-content">{content}</div>
      <footer className="app-footer"><span>© 2026 AirClean</span><span className="footer-center"><span className={'connection-dot '+(apiConnected?'connected':'')}/>{apiConnected?<><Wifi size={13}/> เชื่อมต่อระบบแล้ว</>:<><WifiOff size={13}/> ตรวจสอบการเชื่อมต่อ</>}</span><span>บริการดูแลแอร์ · ข้อมูลจากระบบจริง</span></footer>
    </main>
    {bookingModalOpen&&<BookingModal technicians={state.technicians} onClose={()=>setBookingModalOpen(false)} onSubmit={bookingSubmit}/>}
    {notice&&<div className="toast-notice" role="status"><div className="toast-check"><CheckCircle2 size={17}/></div><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')} aria-label="ปิดข้อความ"><X size={15}/></button></div>}
    {isLoading&&<div className="loading-indicator"><span/>กำลังโหลดข้อมูล...</div>}
  </div>;
}
