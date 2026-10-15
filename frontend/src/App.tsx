import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Menu, RefreshCw, WifiOff, Wind, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import CustomerJobsPage, { type JobFocus } from './pages/CustomerJobsPage';
import TechnicianJobsPage from './pages/TechnicianJobsPage';
import { isClosed, isClosedForCustomer, needsAction, techNeedsAction } from './lib/jobFlow';
import Topbar from './components/Topbar';
import BookingModal, { type BookingPayload } from './components/BookingModal';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import ProfilePage from './pages/ProfilePage';
import DashboardPage from './pages/DashboardPage';
import TechniciansPage from './pages/TechniciansPage';
import BookingsPage from './pages/BookingsPage';
import PassportPage from './pages/PassportPage';
import CleaningHistoryPage from './pages/CleaningHistoryPage';
import BatchPage from './pages/BatchPage';
import ReportsPage from './pages/ReportsPage';
import TrackingPage from './pages/TrackingPage';
import NearbyJobsPage from './pages/NearbyJobsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import IssuesPage from './pages/IssuesPage';
import AdminTechniciansPage from './pages/AdminTechniciansPage';
import UpdateBanner from './components/UpdateBanner';
import PushPrompt from './components/PushPrompt';
import NotificationBell from './components/NotificationBell';
import { disablePush, registerServiceWorker } from './lib/push';
import './pages/WorkspaceTheme.css';
import {
  approveServiceReport, applyForBooking, completeJob, reportProblem, clearAuth, confirmBookingTechnician, confirmOnsitePayment, createAirConditioner, createBatchBooking, createBooking,
  createReview, createServiceReport, deleteAirConditioner, fetchAirConditioners, fetchBatchBookings, fetchBookings, fetchCurrentUser,
  fetchServiceReports, fetchTechnicians, reportPaymentIssue, updateBookingStatus, updateTechnicianLocation,
  type AirConditionerPayload, type CompleteJobPayload, type CreateServiceReportPayload,
} from './lib/api';
import type { AppNotification, AppState, Booking, BookingStatus, DashboardSummary, PageKey, PaymentMethod, UserProfile, UserRole } from './types';

const pageTitles:Record<PageKey,string> = {
  overview:'ภาพรวม', technicians:'ค้นหาช่าง', nearbyJobs:'งานใกล้ฉัน', bookings:'รายการจอง',
  tracking:'ติดตามงาน', passport:'ประวัติแอร์', batch:'งานหลายเครื่อง', reports:'รายงานบริการ', profile:'โปรไฟล์ของฉัน', approvals:'ตรวจสอบช่าง', issues:'เรื่องที่ถูกแจ้ง', history:'ประวัติการล้างแอร์',
};
/** Customers see plainer names for the same pages. */
const customerTitles:Partial<Record<PageKey,string>> = { overview:'หน้าแรก', bookings:'งานของฉัน', history:'ประวัติการล้างแอร์', profile:'บัญชีของฉัน' };
const technicianTitles:Partial<Record<PageKey,string>> = { nearbyJobs:'งานใกล้ฉัน', bookings:'งานของฉัน', profile:'โปรไฟล์และราคา' };
function titleFor(role:UserRole,page:PageKey):string { if(role==='admin'&&page==='technicians')return 'ช่างทั้งหมด'; return (role==='customer'&&customerTitles[page])||(role==='technician'&&technicianTitles[page])||pageTitles[page]; }
/** Where each role starts. Technicians go straight to jobs near them. */
function homePage(role:UserRole):PageKey { return role==='technician'?'nearbyJobs':'overview'; }
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
  const [jobFocus,setJobFocus] = useState<JobFocus|null>(null);
  const [user,setUser] = useState<UserProfile|null>(null);
  const [state,setState] = useState<AppState>(emptyState);
  const [searchQuery,setSearchQuery] = useState('');
  const [bookingModalOpen,setBookingModalOpen] = useState(false);
  const [bookingUnitId,setBookingUnitId] = useState<number|undefined>();
  const [notice,setNotice] = useState('');
  const [apiConnected,setApiConnected] = useState(false);
  const [mobileNavOpen,setMobileNavOpen] = useState(false);
  const [checkingSession,setCheckingSession] = useState(true);
  const [isLoading,setIsLoading] = useState(false);
  const [dataError,setDataError] = useState('');
  const [sessionError,setSessionError] = useState('');
  // A password reset link opens the app with ?reset=<token>.
  const [resetToken,setResetToken] = useState(()=>new URLSearchParams(window.location.search).get('reset')??'');
  const [authInfo,setAuthInfo] = useState('');
  const showNotice = useCallback((message:string) => { setNotice(message); window.setTimeout(()=>setNotice(''),3600); },[]);

  useEffect(()=>{
    let active = true;
    fetchCurrentUser()
      .then(current=>{if(active){setUser(current);if(current)setPage(homePage(current.role));}})
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
  useEffect(()=>{void registerServiceWorker();},[]);

  /** Links from notifications: ?job=ID opens that job, ?page=NAME opens a page. */
  const openLink=useCallback((url:string)=>{
    const params=new URL(url,window.location.origin).searchParams;
    const job=Number(params.get('job'));
    const target=params.get('page') as PageKey|null;
    if(job>0){setPage('bookings');setMobileNavOpen(false);setJobFocus({id:job,token:Date.now()});}
    else if(target&&target in pageTitles)setPage(target);
  },[]);
  useEffect(()=>{
    if(!user)return;
    const params=new URLSearchParams(window.location.search);
    if(params.has('job')||params.has('page')){
      openLink(window.location.href);
      params.delete('job');params.delete('page');
      window.history.replaceState(null,'',window.location.pathname+(params.size?'?'+params.toString():'')+window.location.hash);
    }
    const onMessage=(event:MessageEvent)=>{if(event.data?.type==='airclean-open'&&typeof event.data.url==='string')openLink(event.data.url);};
    navigator.serviceWorker?.addEventListener('message',onMessage);
    return ()=>navigator.serviceWorker?.removeEventListener('message',onMessage);
  },[user,openLink]);
  function openNotification(item:AppNotification){
    if(item.bookingId){openJob(item.bookingId);void refreshBookings();}
    else if(item.target in pageTitles)navigate(item.target as PageKey);
  }
  function setupPush(){navigate('profile');window.setTimeout(()=>document.getElementById('push-settings')?.scrollIntoView({behavior:'smooth',block:'start'}),150);}

  function navigate(next:PageKey){
    // Customers and technicians track, pay and report inside "my jobs", so those pages open there.
    const role = user?.role;
    // Customers keep a cleaning history instead of the per-unit passport.
    const target:PageKey = (role==='customer'||role==='technician')&&(next==='tracking'||next==='reports')?'bookings':role==='technician'&&next==='overview'?'nearbyJobs':role==='customer'&&next==='passport'?'history':next;
    setPage(target);setMobileNavOpen(false);setSearchQuery('');
  }
  function openJob(id?:number){setPage('bookings');setMobileNavOpen(false);setSearchQuery('');setJobFocus(id==null?null:{id,token:Date.now()});}
  function profileUpdated(nextUser:UserProfile){setUser(nextUser);showNotice('อัปเดตโปรไฟล์เรียบร้อยแล้ว');}
  function onAuthenticated(nextUser:UserProfile){
    setAuthInfo('');setUser(nextUser);setState(emptyState());setPage(homePage(nextUser.role));setSearchQuery('');setSessionError('');setDataError('');
  }
  async function logout(){
    // Stop this device's push notifications so the next person using it does not receive them.
    await Promise.race([disablePush().catch(()=>undefined),new Promise(resolve=>window.setTimeout(resolve,3000))]);
    clearAuth();setUser(null);setState(emptyState());setApiConnected(false);setPage('overview');
    setBookingModalOpen(false);setMobileNavOpen(false);setSessionError('');
  }
  function openBooking(unitId?:number){setBookingUnitId(unitId);setBookingModalOpen(true);}

  async function bookingSubmit(payload:BookingPayload):Promise<boolean>{
    if(!user)return false;
    try{
      const saved=await createBooking({
        service:payload.service,unitLabel:payload.unitLabel,propertyType:payload.propertyType,unitCount:payload.unitCount,address:payload.address,
        scheduledAt:payload.date+'T'+payload.time+':00',price:payload.price,latitude:payload.latitude,longitude:payload.longitude,
        airConditionerId:payload.airConditionerId,
      });
      setState(previous=>{const bookings=[saved,...previous.bookings];return {...previous,bookings,summary:summarize(previous.airConditioners,bookings)};});
      openJob(saved.id);showNotice('ส่งคำขอแล้ว รอช่างใกล้เคียงเสนอราคา');return true;
    }catch(error){showNotice(errorMessage(error,'บันทึกการจองไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function applyForNearbyJob(id:number):Promise<boolean>{
    try{
      await applyForBooking(id);
      // Show the offer in "my jobs" straight away, so the technician sees where it stands.
      const bookings=await fetchBookings();
      setState(previous=>({...previous,bookings}));
      openJob(id);
      showNotice('ส่งข้อเสนอแล้ว รอลูกค้าเลือก ถ้าลูกค้าเลือกคุณจะมีแจ้งเตือน');return true;
    }
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
      showNotice(status==='ยกเลิก'?'ยกเลิกรายการแล้ว':status==='กำลังเดินทาง'?'ออกเดินทางแล้ว ลูกค้าจะเห็นตำแหน่งของคุณ':status==='ถึงหน้างาน'?'ถึงหน้างานแล้ว หยุดแชร์ตำแหน่ง':'บันทึกสถานะงานแล้ว');
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
  async function addUnit(payload:AirConditionerPayload){
    try{
      const created=await createAirConditioner(payload);
      setState(previous=>{const airConditioners=[...previous.airConditioners,created];return {...previous,airConditioners,summary:summarize(airConditioners,previous.bookings)};});
      showNotice('เพิ่มเครื่องในสมุดประวัติแล้ว');return created;
    }catch(error){showNotice(errorMessage(error,'เพิ่มเครื่องไม่สำเร็จ กรุณาลองใหม่'));return null;}
  }
  async function removeUnit(id:number):Promise<boolean>{
    try{
      await deleteAirConditioner(id);
      setState(previous=>{const airConditioners=previous.airConditioners.filter(item=>item.id!==id);return {...previous,airConditioners,summary:summarize(airConditioners,previous.bookings)};});
      showNotice('ลบเครื่องออกจากสมุดประวัติแล้ว');return true;
    }catch(error){showNotice(errorMessage(error,'ลบเครื่องไม่สำเร็จ'));return false;}
  }
  async function reviewJob(bookingId:number,rating:number,comment:string):Promise<boolean>{
    try{
      await createReview(bookingId,rating,comment);
      setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===bookingId?{...item,customerRating:rating}:item)}));
      showNotice('ขอบคุณสำหรับคะแนน');return true;
    }catch(error){showNotice(errorMessage(error,'ส่งคะแนนไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function finishJob(id:number,payload:CompleteJobPayload):Promise<boolean>{
    try{
      const saved=await completeJob(id,payload);
      setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));
      void refreshData();
      return true;
    }catch(error){showNotice(errorMessage(error,'ปิดงานไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function sendProblem(id:number,reason:string):Promise<boolean>{
    try{await reportProblem(id,reason);showNotice('ส่งเรื่องให้ผู้ดูแลแล้ว');return true;}
    catch(error){showNotice(errorMessage(error,'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่'));return false;}
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
      case 'overview':return <DashboardPage state={state} role={user.role} userName={user.fullName} onNavigate={navigate} onOpenJob={openJob} onNewBooking={()=>user.role==='technician'?navigate('tracking'):user.role==='manager'?navigate('batch'):openBooking()}/>;
      case 'technicians':if(user.role==='admin')return <AdminTechniciansPage onNotice={showNotice} onChanged={()=>void refreshData()}/>;
        return <TechniciansPage technicians={state.technicians} searchQuery={searchQuery} onBook={()=>openBooking()}/>;
      case 'nearbyJobs':return <NearbyJobsPage onApply={applyForNearbyJob} onOpenProfile={()=>navigate('profile')}/>;
      case 'bookings':if(user.role==='technician')return <TechnicianJobsPage bookings={state.bookings} reports={state.serviceReports} focus={jobFocus} onFindJobs={()=>navigate('nearbyJobs')} onStatusChange={statusChange} onLocationUpdate={locationUpdate} onComplete={finishJob} onRefresh={refreshBookings}/>;
        if(user.role==='customer')return <CustomerJobsPage bookings={state.bookings} reports={state.serviceReports} focus={jobFocus} onNewBooking={()=>openBooking()} onSelectTechnician={selectTechnician} onStatusChange={statusChange} onPaymentConfirm={paymentConfirm} onPaymentIssue={paymentIssue} onReview={reviewJob} onReportProblem={sendProblem} onOpenPassport={()=>navigate('history')} onRefresh={refreshBookings}/>;
        return <BookingsPage bookings={state.bookings} role={user.role} searchQuery={searchQuery} onNewBooking={()=>openBooking()} onNavigate={navigate} onStatusChange={statusChange} onSelectTechnician={selectTechnician} onRefresh={refreshBookings}/>;
      case 'tracking':return <TrackingPage bookings={state.bookings} role={user.role} onStatusChange={statusChange} onLocationUpdate={locationUpdate} onPaymentConfirm={paymentConfirm} onPaymentIssue={paymentIssue} onRefresh={refreshBookings}/>;
      case 'history':return user.role==='customer'?<CleaningHistoryPage bookings={state.bookings} reports={state.serviceReports} onOpenJob={openJob} onNewBooking={()=>openBooking()}/>:null;
      case 'passport':return <PassportPage units={state.airConditioners} onCreate={addUnit} onDelete={removeUnit} onBook={unitId=>openBooking(unitId)}/>;
      case 'batch':return <BatchPage bookings={state.batchBookings} onCreate={batchCreate}/>;
      case 'reports':return <ReportsPage bookings={state.bookings} reports={state.serviceReports} role={user.role} onCreateReport={createReport} onApproveReport={approveReport}/>;
      case 'issues':return user.role==='admin'?<IssuesPage onNotice={showNotice} onChanged={()=>void refreshData()}/>:null;
      case 'approvals':return user.role==='admin'?<ApprovalsPage onNotice={showNotice} onChanged={()=>void refreshData()}/>:null;
      case 'profile':return <ProfilePage user={user} onUpdated={profileUpdated} onLogout={logout}/>;
    }
  },[user,page,state,searchQuery,jobFocus,locationUpdate,paymentConfirm,paymentIssue,refreshBookings,showNotice]);

  const actionCount = user?.role==='customer'?state.bookings.filter(item=>!isClosedForCustomer(item)&&needsAction(item,state.serviceReports)).length:user?.role==='technician'?state.bookings.filter(item=>!isClosed(item)&&techNeedsAction(item)).length:user?.role==='admin'?state.bookings.filter(item=>item.issue?.open||item.status==='มีปัญหาการชำระเงิน').length:0;

  function finishReset(message?:string){
    const url=new URL(window.location.href);url.searchParams.delete('reset');window.history.replaceState(null,'',url.pathname+url.search+url.hash);
    setResetToken('');setVisitorScreen('login');
    if(message){clearAuth();setUser(null);setState(emptyState());setAuthInfo(message);}
  }
  if(resetToken&&!checkingSession)return <AuthPage key="reset" resetToken={resetToken} onResetFinished={finishReset} onBack={()=>{finishReset();setVisitorScreen('landing');}} onAuthenticated={onAuthenticated}/>;
  if(checkingSession)return <div className="auth-loading"><span className="auth-brand-icon"><Activity size={23}/></span><p>กำลังตรวจสอบบัญชีของคุณ...</p></div>;
  if(!user) {
    if(visitorScreen === 'landing' && !sessionError) return <LandingPage onStart={(mode,role='customer')=>{setVisitorScreen(mode);setSignupRole(role);}}/>;
    return <AuthPage key={visitorScreen + signupRole} initialMode={visitorScreen==='register'?'register':'login'} initialRole={signupRole} initialError={sessionError} initialInfo={authInfo} onBack={()=>{setVisitorScreen('landing');setSessionError('');}} onAuthenticated={onAuthenticated}/>;
  }

  const bell = <NotificationBell onOpen={openNotification} onSetupPush={setupPush}/>;
  const customer = user.role==='customer'||user.role==='technician'; // both get the phone bottom bar
  return <div className="app-shell ac-shell" data-role={user.role}>
    <div className={'mobile-nav-backdrop '+(mobileNavOpen?'visible':'')} onClick={()=>setMobileNavOpen(false)} aria-hidden="true"/>
    <div className={'sidebar-container '+(mobileNavOpen?'mobile-open':'')}><Sidebar page={page} onNavigate={navigate} role={user.role} user={user} onLogout={logout} onNewBooking={user.role==='customer'?()=>openBooking():undefined} actionCount={actionCount}/></div>
    <main className="main-shell">
      <Topbar role={user.role} page={page} title={titleFor(user.role,page)} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewBooking={()=>openBooking()} bell={bell}/>
      {customer
        ?<div className="mobile-page-bar customer-bar"><span className="customer-bar-mark"><Wind size={18}/></span><div><strong>{titleFor(user.role,page)}</strong><span>{todayLabel()}</span></div>{bell}</div>
        :<div className="mobile-page-bar"><button className="icon-button" onClick={()=>setMobileNavOpen(true)} aria-label="เปิดเมนู"><Menu size={20}/></button><div><strong>{titleFor(user.role,page)}</strong><span>{todayLabel()}</span></div>{bell}{user.role!=='technician'&&<button className="icon-button" onClick={()=>openBooking()} aria-label="จองบริการ"><Activity size={19}/></button>}</div>}
      {dataError&&<div className="app-data-alert" role="status"><AlertCircle size={18}/><span>{dataError}</span><button className="outline-button" onClick={()=>void refreshData()}><RefreshCw size={15}/> ลองใหม่</button></div>}
      <div className="page-content">{content}</div>
      <footer className="app-footer"><span>© 2026 AirClean</span>{!apiConnected&&<span className="footer-center" role="status"><WifiOff size={13}/> เชื่อมต่อระบบไม่ได้ ลองโหลดหน้าใหม่</span>}</footer>
    </main>
    {customer&&<BottomNav role={user.role} page={page} actionCount={actionCount} onNavigate={navigate} onNewBooking={()=>openBooking()}/>}
    <UpdateBanner/>
    <PushPrompt key={user.id} userId={user.id} role={user.role}/>
    {bookingModalOpen&&<BookingModal technicians={state.technicians} units={user.role==='customer'?[]:state.airConditioners} initialUnitId={bookingUnitId} onClose={()=>setBookingModalOpen(false)} onSubmit={bookingSubmit}/>}
    {notice&&<div className="toast-notice" role="status"><div className="toast-check"><CheckCircle2 size={17}/></div><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')} aria-label="ปิดข้อความ"><X size={15}/></button></div>}
    {isLoading&&<div className="loading-indicator"><span/>กำลังโหลดข้อมูล...</div>}
  </div>;
}
