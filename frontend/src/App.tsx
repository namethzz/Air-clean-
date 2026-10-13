import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Menu, Wifi, WifiOff, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BookingModal, { type BookingPayload } from './components/BookingModal';
import DashboardPage from './pages/DashboardPage';
import TechniciansPage from './pages/TechniciansPage';
import BookingsPage from './pages/BookingsPage';
import PassportPage from './pages/PassportPage';
import BatchPage from './pages/BatchPage';
import ReportsPage from './pages/ReportsPage';
import { createBatchBooking, createBooking, fetchAirConditioners, fetchBatchBookings, fetchBookings, fetchTechnicians, loginAsDemo, tryDemoLogin, updateBookingStatus } from './lib/api';
import { initialState } from './lib/mockData';
import type { AppState, Booking, BookingStatus, PageKey, UserRole } from './types';

const pageTitles: Record<PageKey, string> = { overview: 'ภาพรวม', technicians: 'ค้นหาช่าง', bookings: 'การจองของฉัน', passport: 'Aircon Passport', batch: 'งานแบบกลุ่ม', reports: 'รายงานบริการ' };
function todayLabel() { return new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

export default function App() {
  const [page, setPage] = useState<PageKey>('overview');
  const [role, setRole] = useState<UserRole>(() => (localStorage.getItem('aircare.demo.role') as UserRole | null) ?? 'customer');
  const [state, setState] = useState<AppState>(initialState);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [preselectedTechnician, setPreselectedTechnician] = useState<number | undefined>();
  const [notice, setNotice] = useState('');
  const [apiConnected, setApiConnected] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    await tryDemoLogin();
    const results = await Promise.allSettled([fetchTechnicians(), fetchBookings(), fetchAirConditioners(), fetchBatchBookings()]);
    const successful = results.filter((result) => result.status === 'fulfilled').length;
    if (successful > 0) {
      setState((previous) => {
        const next = { ...previous };
        const [technicians, bookings, units, batches] = results;
        if (technicians.status === 'fulfilled') next.technicians = technicians.value;
        if (bookings.status === 'fulfilled') next.bookings = bookings.value;
        if (units.status === 'fulfilled') next.airConditioners = units.value;
        if (batches.status === 'fulfilled') next.batchBookings = batches.value;
        next.summary = {
          totalUnits: next.airConditioners.length,
          upcomingBookings: next.bookings.filter((item) => ['รอยืนยัน', 'ยืนยันแล้ว', 'กำลังดำเนินการ'].includes(item.status)).length,
          serviceCompletion: next.airConditioners.length ? Math.round((next.airConditioners.filter((item) => item.services.length > 0).length / next.airConditioners.length) * 100) : 0,
          totalSpent: next.bookings.filter((item) => item.status === 'เสร็จสิ้น').reduce((sum, item) => sum + item.price, 0),
        };
        return next;
      });
      setApiConnected(successful >= 3);
    } else setApiConnected(false);
    setIsLoading(false);
  }, []);

  useEffect(() => { void refreshData(); }, [refreshData]);
  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3600); }
  function handleNavigate(next: PageKey) { setPage(next); setMobileNavOpen(false); setSearchQuery(''); }

  async function handleRoleChange(nextRole: UserRole) {
    setRole(nextRole);
    localStorage.setItem('aircare.demo.role', nextRole);
    try { await loginAsDemo(nextRole); } catch { /* Keep local demo mode available. */ }
    await refreshData();
    if (nextRole === 'technician') setPage('reports');
    else if (nextRole === 'manager') setPage('batch');
    else setPage('overview');
    showNotice(`เปลี่ยนเป็นโหมด${({ customer: 'ลูกค้า', technician: 'ช่างแอร์', manager: 'ผู้ดูแลอาคาร', admin: 'ผู้ดูแลระบบ' } as Record<UserRole, string>)[nextRole]}แล้ว`);
  }

  function openBooking(technicianId?: number) { setPreselectedTechnician(technicianId); setBookingModalOpen(true); }
  async function handleBookingSubmit(payload: BookingPayload) {
    const technician = state.technicians.find((item) => item.id === payload.technicianId) ?? state.technicians[0];
    const localId = Date.now();
    const newBooking: Booking = {
      id: localId, code: `AC-${String(localId).slice(-5)}`, customer: 'คุณนที', technicianId: payload.technicianId,
      technician: technician?.name ?? 'ช่างแอร์', technicianInitials: technician?.initials ?? 'ชง', service: payload.service,
      unitLabel: payload.unitLabel, address: payload.address, date: payload.date, time: payload.time, price: payload.price,
      status: 'รอยืนยัน', createdAt: new Date().toISOString().slice(0, 10),
    };
    try {
      const saved = await createBooking({ technicianId: payload.technicianId, service: payload.service, unitLabel: payload.unitLabel, address: payload.address, scheduledAt: `${payload.date}T${payload.time}:00`, price: payload.price });
      setState((previous) => ({ ...previous, bookings: [saved, ...previous.bookings] }));
      setApiConnected(true);
    } catch {
      setState((previous) => ({ ...previous, bookings: [newBooking, ...previous.bookings], summary: { ...previous.summary, upcomingBookings: previous.summary.upcomingBookings + 1 } }));
      showNotice('บันทึกการจองใน Demo mode แล้ว');
    }
    setPage('bookings'); setBookingModalOpen(false); setPreselectedTechnician(undefined);
  }

  async function handleStatusChange(id: number, status: BookingStatus) {
    try { await updateBookingStatus(id, status); } catch { /* Update local demo state if the API is unavailable. */ }
    setState((previous) => {
      const bookings = previous.bookings.map((item) => item.id === id ? { ...item, status } : item);
      return { ...previous, bookings, summary: {
        ...previous.summary,
        upcomingBookings: bookings.filter((item) => ['รอยืนยัน', 'ยืนยันแล้ว', 'กำลังดำเนินการ'].includes(item.status)).length,
        totalSpent: bookings.filter((item) => item.status === 'เสร็จสิ้น').reduce((sum, item) => sum + item.price, 0),
      } };
    });
    showNotice(status === 'เสร็จสิ้น' ? 'อัปเดตงานเสร็จสิ้นแล้ว' : 'อัปเดตสถานะงานแล้ว');
  }

  async function handleBatchCreate(payload: { building: string; address: string; unitCount: number; date: string }) {
    try {
      const created = await createBatchBooking({ buildingName: payload.building, address: payload.address, unitCount: payload.unitCount, scheduledDate: payload.date });
      setState((previous) => ({ ...previous, batchBookings: [created, ...previous.batchBookings] }));
      showNotice('สร้างคำของานกลุ่มบน API แล้ว');
    } catch {
      const item = { id: Date.now(), code: `BT-${String(Date.now()).slice(-4)}`, building: payload.building, address: payload.address, unitCount: payload.unitCount, completedUnits: 0, scheduledDate: payload.date, status: 'รอช่างเสนอราคา', quote: 0 };
      setState((previous) => ({ ...previous, batchBookings: [item, ...previous.batchBookings] }));
      showNotice('สร้างงานกลุ่มใน Demo mode แล้ว');
    }
  }

  const pageContent = (() => {
    switch (page) {
      case 'overview': return <DashboardPage state={state} role={role} onNavigate={handleNavigate} onNewBooking={() => openBooking()} />;
      case 'technicians': return <TechniciansPage technicians={state.technicians} searchQuery={searchQuery} onBook={openBooking} />;
      case 'bookings': return <BookingsPage bookings={state.bookings} role={role} searchQuery={searchQuery} onNewBooking={() => openBooking()} onStatusChange={handleStatusChange} />;
      case 'passport': return <PassportPage units={state.airConditioners} />;
      case 'batch': return <BatchPage bookings={state.batchBookings} onCreate={handleBatchCreate} />;
      case 'reports': return <ReportsPage state={state} role={role} />;
    }
  })();

  return <div className="app-shell">
    <div className={`mobile-nav-backdrop ${mobileNavOpen ? 'visible' : ''}`} onClick={() => setMobileNavOpen(false)}/>
    <div className={`sidebar-container ${mobileNavOpen ? 'mobile-open' : ''}`}><Sidebar page={page} onNavigate={handleNavigate} role={role} onRoleChange={handleRoleChange}/></div>
    <main className="main-shell">
      <Topbar role={role} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewBooking={() => openBooking()}/>
      <div className="mobile-page-bar"><button className="icon-button" onClick={() => setMobileNavOpen(true)} aria-label="เปิดเมนู"><Menu size={20}/></button><div><strong>{pageTitles[page]}</strong><span>{todayLabel()}</span></div><button className="icon-button" onClick={() => openBooking()} aria-label="จองบริการ"><Activity size={19}/></button></div>
      <div className="page-content">{pageContent}</div>
      <footer className="app-footer"><span>© 2026 AirCare Connect</span><span className="footer-center"><span className={`connection-dot ${apiConnected ? 'connected' : ''}`}/>{apiConnected ? <><Wifi size={13}/> เชื่อมต่อ API แล้ว</> : <><WifiOff size={13}/> Demo mode</>}</span><span>V.1.0.0 <span className="footer-separator">·</span> Made for better home care</span></footer>
    </main>
    {bookingModalOpen && <BookingModal technicians={state.technicians} onClose={() => { setBookingModalOpen(false); setPreselectedTechnician(undefined); }} onSubmit={handleBookingSubmit} initialTechnicianId={preselectedTechnician}/>}
    {notice && <div className="toast-notice"><div className="toast-check"><CheckCircle2 size={17}/></div><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="ปิดข้อความ"><X size={15}/></button></div>}
    {isLoading && <div className="loading-indicator"><span/>กำลังเตรียม workspace</div>}
  </div>;
}