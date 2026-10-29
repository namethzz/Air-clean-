import { Building2, ClipboardList, History, Home, MapPin, Plus, UserCog, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PageKey, UserRole } from '../../types';

/**
 * Keeps the bar on the bottom edge of what is actually on screen. iPhones can leave the page's "layout viewport"
 * shifted after the photo picker or camera closes, which leaves a plain `position: fixed; bottom: 0` bar floating
 * in the middle of the screen; this moves it back. While the keyboard is up the bar steps aside.
 */
function useStickToScreenBottom() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const view = window.visualViewport;
    const nav = ref.current;
    if (!view || !nav) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const layoutHeight = document.documentElement.clientHeight;
        const typing = document.activeElement instanceof HTMLElement && document.activeElement.matches('input:not([type=file]):not([type=checkbox]):not([type=radio]),textarea,select');
        const keyboard = typing && layoutHeight - view.height > 120;
        const gap = Math.round(view.offsetTop + view.height - layoutHeight);
        nav.classList.toggle('is-hidden', keyboard);
        nav.style.transform = !keyboard && Math.abs(gap) > 1 ? `translateY(${gap}px)` : '';
      });
    };
    place();
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place);
    window.addEventListener('focus', place);
    window.addEventListener('pageshow', place);
    document.addEventListener('focusin', place);
    document.addEventListener('focusout', place);
    // The picker closing sends a change event on the file input; check again once the page has settled.
    const afterPicker = (event: Event) => { if ((event.target as HTMLInputElement)?.type === 'file') { place(); window.setTimeout(place, 350); } };
    document.addEventListener('change', afterPicker, true);
    return () => {
      cancelAnimationFrame(frame);
      view.removeEventListener('resize', place);
      view.removeEventListener('scroll', place);
      window.removeEventListener('focus', place);
      window.removeEventListener('pageshow', place);
      document.removeEventListener('focusin', place);
      document.removeEventListener('focusout', place);
      document.removeEventListener('change', afterPicker, true);
    };
  }, []);
  return ref;
}

interface Props {
  role: UserRole;
  page: PageKey;
  actionCount: number;
  onNavigate: (page: PageKey) => void;
  onNewBooking: () => void;
}

/** Thumb-reach navigation on phones and tablets for customers, managers and technicians. The rail takes over on wide screens. */
export default function BottomNav({ role, page, actionCount, onNavigate, onNewBooking }: Props) {
  const ref = useStickToScreenBottom();
  const item = (key: PageKey, label: string, Icon: typeof Home, badge = 0) => {
    const active = page === key;
    return <button type="button" className={'sh-tab' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined} onClick={() => onNavigate(key)}>
      <span className="sh-tab-icon"><Icon size={23} strokeWidth={active ? 2.3 : 1.9}/>{badge > 0 && <b className="sh-count" aria-label={`${badge} งานรอคุณ`}>{badge}</b>}</span>
      <span className="sh-tab-label">{label}</span>
    </button>;
  };
  if (role === 'technician') {
    return <nav ref={ref} className="sh-tabbar is-3" aria-label="เมนูหลัก">
      {item('nearbyJobs', 'งานใกล้ฉัน', MapPin)}
      {item('bookings', 'งานของฉัน', ClipboardList, actionCount)}
      {item('profile', 'โปรไฟล์', UserCog)}
    </nav>;
  }
  const manager = role === 'manager';
  return <nav ref={ref} className="sh-tabbar" aria-label="เมนูหลัก">
    {item('overview', 'หน้าแรก', Home)}
    {item('bookings', manager ? 'งานอาคาร' : 'งานของฉัน', ClipboardList, actionCount)}
    <button type="button" className="sh-tab sh-tab-book" onClick={onNewBooking}><span className="sh-tab-plus" aria-hidden="true"><Plus size={26} strokeWidth={2.5}/></span><span className="sh-tab-label">ขอช่าง</span></button>
    {manager ? item('buildings', 'อาคาร', Building2) : item('history', 'ประวัติ', History)}
    {item('profile', 'บัญชี', UserRound)}
  </nav>;
}
