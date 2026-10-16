import CustomerHome from './CustomerHome';
import AdminOverview from './AdminOverview';
import type { AppState, PageKey, UserRole } from '../types';

interface Props {
  state: AppState;
  role: UserRole;
  userName: string;
  onNavigate: (page: PageKey) => void;
  onOpenJob: (id?: number) => void;
  onNewBooking: () => void;
}

/**
 * The first page after signing in. Customers and building managers get their own home; technicians start on
 * "งานใกล้ฉัน" instead, so what is left here is the admin's overview of the platform.
 */
export default function DashboardPage({ state, role, userName, onNavigate, onOpenJob, onNewBooking }: Props) {
  if (role === 'customer' || role === 'manager') {
    return <CustomerHome role={role} bookings={state.bookings} reports={state.serviceReports} userName={userName} onNavigate={onNavigate} onOpenJob={onOpenJob} onNewBooking={onNewBooking}/>;
  }

  return <AdminOverview state={state} userName={userName} onNavigate={onNavigate} onOpenJob={onOpenJob}/>;
}
