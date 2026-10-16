import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Menu, RefreshCw, WifiOff, X } from 'lucide-react';
import BrandMark from './components/BrandMark';
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
import BookingsPage from './pages/BookingsPage';
import CleaningHistoryPage from './pages/CleaningHistoryPage';
import ReportsPage from './pages/ReportsPage';
import TrackingPage from './pages/TrackingPage';
import NearbyJobsPage from './pages/NearbyJobsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import BuildingsPage from './pages/BuildingsPage';
import { books } from './lib/roles';
import IssuesPage from './pages/IssuesPage';
import MembershipPage from './pages/MembershipPage';
import AdminTechniciansPage from './pages/AdminTechniciansPage';
import UpdateBanner from './components/UpdateBanner';
import PushPrompt from './components/PushPrompt';
import NotificationBell from './components/NotificationBell';
import { disablePush, registerServiceWorker } from './lib/push';
import {
  reopenBooking, answerPriceChange, proposePriceChange, withdrawPriceChange, type ProposeChangePayload, applyForBooking, completeJob, updateJobProgress, requestReschedule, reportProblem, clearAuth, confirmBookingTechnician, confirmOnsitePayment, createBooking,
  createReview, fetchAirConditioners, fetchBookings, fetchCurrentUser,
  fetchServiceReports, fetchTechnicians, reportPaymentIssue, updateBookingStatus, updateTechnicianLocation,
  type CompleteJobPayload,
} from './lib/api';
import type { AppNotification, AppState, Booking, BookingStatus, DashboardSummary, PageKey, PaymentMethod, UserProfile, UserRole } from './types';

const pageTitles:Record<PageKey,string> = {
  overview:'ภาพรวม', technicians:'ค้นหาช่าง', nearbyJobs:'งานใกล้ฉัน', bookings:'รายการจอง',
  tracking:'ติดตามงาน', reports:'รายงานบริการ', profile:'โปรไฟล์ของฉัน', approvals:'ตรวจสอบช่าง', issues:'เรื่องที่ถูกแจ้ง', history:'ประวัติการล้างแอร์', buildings:'อาคารของฉัน', membership:'ค่าสมาชิกช่าง',
};
/** Customers see plainer names for the same pages. */
const customerTitles:Partial<Record<PageKey,string>> = { overview:'หน้าแรก', bookings:'งานของฉัน', history:'ประวัติการล้างแอร์', profile:'บัญชีของฉัน' };
const technicianTitles:Partial<Record<PageKey,string>> = { nearbyJobs:'งานใกล้ฉัน', bookings:'งานของฉัน', profile:'โปรไฟล์และราคา', membership:'สมาชิก AirClean' };
const managerTitles:Partial<Record<PageKey,string>> = { overview:'หน้าแรก', bookings:'งานของอาคาร', buildings:'อาคารของฉัน', history:'ประวัติการล้างแอร์', profile:'บัญชีของฉัน' };
function titleFor(role:UserRole,page:PageKey):string { if(role==='admin'&&page==='technicians')return 'ช่างทั้งหมด'; return (role==='manager'&&managerTitles[page])||(role==='customer'&&customerTitles[page])||(role==='technician'&&technicianTitles[page])||pageTitles[page]; }
/** Where each role starts. Technicians go straight to jobs near them. */
/** Follows a media query, so a part can live in whichever bar the layout shows. */
function useMedia(query:string){
  const [match,setMatch]=useState(()=>window.matchMedia(query).matches);
  useEffect(()=>{const media=window.matchMedia(query);const change=()=>setMatch(media.matches);media.addEventListener('change',change);return ()=>media.removeEventListener('change',change);},[query]);
  return match;
}
function homePage(role:UserRole):PageKey { return role==='technician'?'nearbyJobs':'overview'; }
const activeStatuses:BookingStatus[] = ['เปิดรับช่าง','รอเลือกช่าง','รอยืนยัน','ยืนยันแล้ว','กำลังเดินทาง','ถึงหน้างาน','กำลังดำเนินการ','รอชำระเงิน'];
function emptyState():AppState {
  return { technicians:[], summary:{totalUnits:0,upcomingBookings:0,serviceCompletion:0,totalSpent:0},
    bookings:[], airConditioners:[], serviceReports:[] };
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
  const [bookingPlaceId,setBookingPlaceId] = useState<string|undefined>();
  const [bookingRooms,setBookingRooms] = useState<string[]|undefined>();
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
  // One timer for the toast: a second message replaces the first and gets its full time on screen.
  const noticeTimer = useRef<number>();
  const showNotice = useCallback((message:string) => { window.clearTimeout(noticeTimer.current); setNotice(message); noticeTimer.current = window.setTimeout(()=>setNotice(''),3600); },[]);
  // Each saved change bumps this; a list fetch that started before it is older than what is on screen and is dropped.
  const writes = useRef(0);
  const desktop = useMedia('(min-width: 1024px)');

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
    const at = writes.current;
    const needsUnits = user.role!=='technician';
    const [t,b,u,r] = await Promise.allSettled([
      fetchTechnicians(),fetchBookings(),needsUnits?fetchAirConditioners():Promise.resolve([]),fetchServiceReports(),
    ]);
    const technicians = t.status==='fulfilled'?t.value:[];
    const bookings = b.status==='fulfilled'?b.value:[];
    const units = u.status==='fulfilled'?u.value:[];
    const reports = r.status==='fulfilled'?r.value:[];
    // A change saved while this was loading is newer than these bookings: keep it.
    if(writes.current!==at)setState(previous=>({technicians,bookings:previous.bookings,airConditioners:units,serviceReports:reports,summary:summarize(units,previous.bookings)}));
    else setState({technicians,bookings,airConditioners:units,serviceReports:reports,summary:summarize(units,bookings)});
    setApiConnected(t.status==='fulfilled'&&b.status==='fulfilled');
    const failed:string[]=[];
    if(b.status==='rejected')failed.push('รายการจอง');
    if(t.status==='rejected')failed.push('ข้อมูลช่าง');
    if(u.status==='rejected')failed.push('ประวัติแอร์');
    if(r.status==='rejected')failed.push('รายงานบริการ');
    if(failed.length)setDataError('โหลดข้อมูลบางส่วนไม่สำเร็จ: '+failed.join(', ')+' กรุณาลองโหลดใหม่');
    setIsLoading(false);
  },[user]);
  useEffect(()=>{if(user)void refreshData();},[user,refreshData]);
  useEffect(()=>{void registerServiceWorker();},[]);

  // Notification links use the same role rules as the menus (navigate is redefined each render).
  const navigateRef = useRef<(next:PageKey)=>void>(()=>undefined);
  /** Links from notifications: ?job=ID opens that job, ?page=NAME opens a page. */
  const openLink=useCallback((url:string)=>{
    const params=new URL(url,window.location.origin).searchParams;
    const job=Number(params.get('job'));
    const target=params.get('page') as PageKey|null;
    if(job>0){setPage('bookings');setMobileNavOpen(false);setJobFocus({id:job,token:Date.now()});}
    else if(target&&target in pageTitles)navigateRef.current(target);
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
  /** The profile page listens for this, opens its account tab and scrolls to the notification switch. */
  function setupPush(){navigate('profile');window.setTimeout(()=>window.dispatchEvent(new Event('airclean:show-push')),150);}

  navigateRef.current = navigate;
  function navigate(next:PageKey){
    // Customers and technicians track, pay and report inside "my jobs", so those pages open there.
    const role = user?.role;
    // Customers keep a cleaning history instead of the per-unit passport.
    const target:PageKey = (books(role)||role==='technician')&&(next==='tracking'||next==='reports')?'bookings':role==='technician'&&next==='overview'?'nearbyJobs':books(role)&&next==='technicians'?'overview':next;
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
  function openBooking(unitId?:number,placeId?:string,rooms?:string[]){setBookingUnitId(unitId);setBookingPlaceId(placeId);setBookingRooms(rooms);setBookingModalOpen(true);}

  async function bookingSubmit(payload:BookingPayload):Promise<boolean>{
    if(!user)return false;
    try{
      const saved=await createBooking({
        service:payload.service,unitLabel:payload.unitLabel,propertyType:payload.propertyType,unitCount:payload.unitCount,address:payload.address,
        scheduledAt:payload.date+'T'+payload.time+':00',price:payload.price,latitude:payload.latitude,longitude:payload.longitude,
        airConditionerId:payload.airConditionerId,timeWindow:payload.timeWindow,notes:payload.notes,placeId:payload.placeId,rooms:payload.rooms,contactPhone:payload.contactPhone,
        items:payload.items,deep:payload.deep,hardAccessUnits:payload.hardAccessUnits,lastCleaned:payload.lastCleaned,symptoms:payload.symptoms,
      });
      if(payload.contactPhone&&payload.contactPhone!==user.phone)setUser({...user,phone:payload.contactPhone});
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
  // Price changes on site: the technician asks, the customer approves or declines, the technician may take it back.
  async function changeAction(id:number,run:()=>Promise<Booking>,done:string,failed:string):Promise<boolean>{
    try{
      const saved=await run();
      setState(previous=>{const bookings=previous.bookings.map(item=>item.id===id?saved:item);return {...previous,bookings,summary:summarize(previous.airConditioners,bookings)};});
      showNotice(done);return true;
    }catch(error){showNotice(errorMessage(error,failed));return false;}
  }
  const answerChange=(id:number,changeId:string,approve:boolean)=>changeAction(id,()=>answerPriceChange(id,changeId,approve),
    approve?'อนุมัติแล้ว ยอดที่ต้องจ่ายอัปเดตแล้ว':'ไม่อนุมัติ ช่างจะทำตามรายการเดิมในราคาเดิม','ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่');
  const proposeChange=(id:number,payload:ProposeChangePayload)=>changeAction(id,()=>proposePriceChange(id,payload),
    'ส่งคำขอให้ลูกค้าแล้ว ราคาจะเปลี่ยนเมื่อลูกค้ากดอนุมัติ','ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
  const withdrawChange=(id:number,changeId:string)=>changeAction(id,()=>withdrawPriceChange(id,changeId),'ยกเลิกคำขอแล้ว ราคายังเป็นตามที่ตกลง','ยกเลิกคำขอไม่สำเร็จ');
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
      writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?{...item,technicianLatitude:latitude,technicianLongitude:longitude,locationAccuracy:accuracy,locationUpdatedAt:new Date().toISOString()}:item)}));
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
    try{const saved=await reportPaymentIssue(id,reason);writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));showNotice('ส่งเรื่องให้ผู้ดูแลตรวจสอบแล้ว');}
    catch(error){showNotice(errorMessage(error,'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่'));}
  },[showNotice]);
  const refreshBookings=useCallback(async()=>{
    const at=writes.current;
    try{const bookings=await fetchBookings();if(writes.current!==at)return;setState(previous=>({...previous,bookings,summary:summarize(previous.airConditioners,bookings)}));}
    catch(error){showNotice(errorMessage(error,'โหลดรายการจองไม่สำเร็จ'));}
  },[showNotice]);
  async function reviewJob(bookingId:number,rating:number,comment:string):Promise<boolean>{
    try{
      await createReview(bookingId,rating,comment);
      writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===bookingId?{...item,customerRating:rating}:item)}));
      showNotice('ขอบคุณสำหรับคะแนน');return true;
    }catch(error){showNotice(errorMessage(error,'ส่งคะแนนไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function rescheduleJob(id:number,scheduledAt:string,timeWindow?:string,reason?:string):Promise<boolean>{
    try{const saved=await requestReschedule(id,scheduledAt,timeWindow,reason);writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));
      showNotice('เปลี่ยนวันนัดแล้ว อีกฝ่ายได้รับแจ้งแล้ว');return true;}
    catch(error){showNotice(errorMessage(error,'เลื่อนนัดไม่สำเร็จ'));return false;}
  }
  async function reopenJob(id:number):Promise<boolean>{
    try{const saved=await reopenBooking(id);writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));
      showNotice('เปิดรับข้อเสนออีกครั้งแล้ว ช่างใกล้บ้านจะเห็นงานนี้');return true;}
    catch(error){showNotice(errorMessage(error,'เปิดรับข้อเสนอไม่สำเร็จ'));void refreshBookings();return false;}
  }
  async function saveProgress(id:number,unitsDone:number,roomsDone?:string[]):Promise<boolean>{
    try{const saved=await updateJobProgress(id,unitsDone,roomsDone);writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));return true;}
    catch(error){showNotice(errorMessage(error,'บันทึกความคืบหน้าไม่สำเร็จ'));return false;}
  }
  async function finishJob(id:number,payload:CompleteJobPayload):Promise<boolean>{
    try{
      const saved=await completeJob(id,payload);
      writes.current++;setState(previous=>({...previous,bookings:previous.bookings.map(item=>item.id===id?saved:item)}));
      void refreshData();
      return true;
    }catch(error){showNotice(errorMessage(error,'ปิดงานไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }
  async function sendProblem(id:number,reason:string):Promise<boolean>{
    try{await reportProblem(id,reason);showNotice('ส่งเรื่องให้ผู้ดูแลแล้ว');return true;}
    catch(error){showNotice(errorMessage(error,'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่'));return false;}
  }

  // A new screen starts at its top: signing out from the bottom of a long page used to leave the next screen
  // scrolled to its end. "instant" skips the landing page's smooth scrolling.
  const screen = user ? 'app:'+page : 'visitor:'+visitorScreen+(resetToken?':reset':'');
  useLayoutEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[screen]);

  const content = useMemo(()=>{
    if(!user)return null;
    switch(page){
      case 'overview':return <DashboardPage state={state} role={user.role} userName={user.fullName} onNavigate={navigate} onOpenJob={openJob} onNewBooking={()=>user.role==='technician'?navigate('tracking'):openBooking()}/>;
      case 'technicians':if(user.role==='admin')return <AdminTechniciansPage onNotice={showNotice} onChanged={()=>void refreshData()}/>;
        return null;
      case 'nearbyJobs':return <NearbyJobsPage onApply={applyForNearbyJob} onOpenProfile={()=>navigate('profile')} onOpenMembership={()=>navigate('membership')} onOpenMyJobs={()=>navigate('bookings')} myJobs={state.bookings}/>;
      case 'membership':return user.role==='technician'||user.role==='admin'?<MembershipPage admin={user.role==='admin'} onNotice={showNotice}/>:null;
      case 'bookings':if(user.role==='technician')return <TechnicianJobsPage bookings={state.bookings} reports={state.serviceReports} focus={jobFocus} onFindJobs={()=>navigate('nearbyJobs')} onOpenProfile={()=>navigate('profile')} onStatusChange={statusChange} onLocationUpdate={locationUpdate} onComplete={finishJob} onProgress={saveProgress} onReschedule={rescheduleJob} onProposeChange={proposeChange} onWithdrawChange={withdrawChange} onRefresh={refreshBookings}/>;
        if(books(user.role))return <CustomerJobsPage bookings={state.bookings} reports={state.serviceReports} focus={jobFocus} onNewBooking={()=>openBooking()} onSelectTechnician={selectTechnician} onStatusChange={statusChange} onPaymentConfirm={paymentConfirm} onPaymentIssue={paymentIssue} onReview={reviewJob} onReportProblem={sendProblem} onReschedule={rescheduleJob} onReopen={reopenJob} onAnswerChange={answerChange} onOpenPassport={()=>navigate('history')} onRefresh={refreshBookings}/>;
        return <BookingsPage bookings={state.bookings} role={user.role} searchQuery={searchQuery} onNewBooking={()=>openBooking()} onNavigate={navigate} onStatusChange={statusChange} onSelectTechnician={selectTechnician} onRefresh={refreshBookings}/>;
      case 'tracking':return user.role==='admin'?<TrackingPage bookings={state.bookings} onRefresh={refreshBookings}/>:null;
      case 'buildings':return user.role==='manager'?<BuildingsPage bookings={state.bookings} onBook={(placeId,rooms)=>openBooking(undefined,placeId,rooms)} onOpenJob={openJob} onNotice={showNotice}/>:null;
      case 'history':return books(user.role)?<CleaningHistoryPage bookings={state.bookings} reports={state.serviceReports} onOpenJob={openJob} onNewBooking={()=>openBooking()}/>:null;
      case 'reports':return user.role==='admin'?<ReportsPage bookings={state.bookings} reports={state.serviceReports}/>:null;
      case 'issues':return user.role==='admin'?<IssuesPage onNotice={showNotice} onChanged={()=>void refreshData()}/>:null;
      case 'approvals':return user.role==='admin'?<ApprovalsPage onNotice={showNotice} onChanged={()=>void refreshData()}/>:null;
      case 'profile':return <ProfilePage user={user} onUpdated={profileUpdated} onLogout={logout} onOpenMembership={()=>navigate('membership')}/>;
    }
  },[user,page,state,searchQuery,jobFocus,locationUpdate,paymentConfirm,paymentIssue,refreshBookings,showNotice]);

  const actionCount = books(user?.role)?state.bookings.filter(item=>!isClosedForCustomer(item)&&needsAction(item,state.serviceReports)).length:user?.role==='technician'?state.bookings.filter(item=>!isClosed(item)&&techNeedsAction(item)).length:user?.role==='admin'?state.bookings.filter(item=>item.issue?.open||item.status==='มีปัญหาการชำระเงิน').length:0;

  function finishReset(message?:string){
    const url=new URL(window.location.href);url.searchParams.delete('reset');window.history.replaceState(null,'',url.pathname+url.search+url.hash);
    setResetToken('');setVisitorScreen('login');
    if(message){clearAuth();setUser(null);setState(emptyState());setAuthInfo(message);}
  }
  if(resetToken&&!checkingSession)return <AuthPage key="reset" resetToken={resetToken} onResetFinished={finishReset} onBack={()=>{finishReset();setVisitorScreen('landing');}} onAuthenticated={onAuthenticated}/>;
  if(checkingSession)return <div className="au-loading" role="status"><span className="au-brand-mark"><BrandMark className="w-[82%] h-auto"/></span><p>กำลังตรวจสอบบัญชีของคุณ…</p></div>;
  if(!user) {
    if(visitorScreen === 'landing' && !sessionError) return <LandingPage onStart={(mode,role='customer')=>{setVisitorScreen(mode);setSignupRole(role);}}/>;
    return <AuthPage key={visitorScreen + signupRole} initialMode={visitorScreen==='register'?'register':'login'} initialRole={signupRole} initialError={sessionError} initialInfo={authInfo} onBack={()=>{setVisitorScreen('landing');setSessionError('');}} onAuthenticated={onAuthenticated}/>;
  }

  // One bell, in whichever bar is showing: two copies polled twice and drifted apart.
  const bell = <NotificationBell onOpen={openNotification} onSetupPush={setupPush}/>;
  const tabbed = books(user.role)||user.role==='technician'; // they get the phone bottom bar
  return <div className={'sh ac-shell'+(tabbed?' has-tabbar':'')} data-role={user.role}>
    <div className={'sh-scrim'+(mobileNavOpen?' is-open':'')} onClick={()=>setMobileNavOpen(false)} aria-hidden="true"/>
    <div className={'sh-rail-wrap'+(mobileNavOpen?' is-open':'')}><Sidebar page={page} onNavigate={navigate} role={user.role} user={user} onLogout={logout} onNewBooking={books(user.role)?()=>openBooking():undefined} actionCount={actionCount}/></div>
    <main className="sh-main">
      <Topbar role={user.role} page={page} title={titleFor(user.role,page)} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewBooking={()=>openBooking()} bell={desktop?bell:null}/>
      <header className="sh-band">
        {tabbed
          ?<span className="sh-band-mark" aria-hidden="true"><BrandMark className="w-[80%] h-auto"/></span>
          :<button type="button" className="sh-band-btn" onClick={()=>setMobileNavOpen(true)} aria-label="เปิดเมนู"><Menu size={22}/></button>}
        <div className="sh-band-text"><h1>{titleFor(user.role,page)}</h1><span>{todayLabel()}</span></div>
        {!desktop&&bell}
      </header>
      {dataError&&<div className="ui-alert is-problem sh-data-alert" role="status"><AlertCircle size={18}/><span>{dataError}</span><button type="button" className="ui-btn is-sm" onClick={()=>void refreshData()}><RefreshCw size={15}/> ลองใหม่</button></div>}
      {isLoading&&<div className="sh-progress" role="status"><span className="sr-only">กำลังโหลดข้อมูล</span></div>}
      <div className="sh-content">{content}</div>
      <footer className="sh-foot"><span>© 2026 AirClean</span>{!apiConnected&&<span className="sh-offline" role="status"><WifiOff size={14}/> เชื่อมต่อระบบไม่ได้ ลองโหลดหน้าใหม่</span>}</footer>
    </main>
    {tabbed&&<BottomNav role={user.role} page={page} actionCount={actionCount} onNavigate={navigate} onNewBooking={()=>openBooking()}/>}
    <UpdateBanner/>
    <PushPrompt key={user.id} userId={user.id} role={user.role}/>
    {bookingModalOpen&&<BookingModal units={books(user.role)?[]:state.airConditioners} initialUnitId={bookingUnitId} role={user.role} initialPlaceId={bookingPlaceId} initialRooms={bookingRooms} bookings={state.bookings} phone={user.phone} onClose={()=>setBookingModalOpen(false)} onSubmit={bookingSubmit}/>}
    {notice&&<div className="sh-toast" role="status"><CheckCircle2 size={19} aria-hidden="true"/><span>{notice}</span><button type="button" className="sh-toast-close" onClick={()=>setNotice('')} aria-label="ปิดข้อความ"><X size={16}/></button></div>}
  </div>;
}
