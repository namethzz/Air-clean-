import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck, X } from 'lucide-react';
import type { AppNotification } from '../types';
import { fetchNotifications, markNotificationsRead } from '../lib/api';
import './NotificationBell.css';

interface Props { onOpen: (notification: AppNotification) => void; onSetupPush: () => void; }

function timeAgo(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/** The bell: unread count, and a list of what happened. Refreshes every 30 seconds and when a push arrives. */
export default function NotificationBell({ onOpen, onSetupPush }: Props) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { const result = await fetchNotifications(); setItems(result.items); setUnread(result.unread); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'โหลดการแจ้งเตือนไม่สำเร็จ'); }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    const onFocus = () => void load();
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'airclean-notification') void load(); };
    window.addEventListener('focus', onFocus);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); navigator.serviceWorker?.removeEventListener('message', onMessage); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  async function choose(item: AppNotification) {
    setOpen(false);
    if (!item.read) {
      setItems(previous => previous.map(row => row.id === item.id ? { ...row, read: true } : row));
      setUnread(count => Math.max(0, count - 1));
      void markNotificationsRead([item.id]).catch(() => undefined);
    }
    onOpen(item);
  }
  async function readAll() {
    setItems(previous => previous.map(row => ({ ...row, read: true })));
    setUnread(0);
    await markNotificationsRead().catch(() => void load());
  }

  const Icon = unread > 0 ? BellRing : Bell;
  return <div className="nb" ref={wrapper}>
    <button type="button" className="nb-trigger" aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'} aria-expanded={open} aria-haspopup="dialog"
      onClick={() => { setOpen(value => !value); if (!open) void load(); }}>
      <Icon size={20}/>
      {unread > 0 && <b className="nb-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</b>}
    </button>
    {open && <section className="nb-panel" role="dialog" aria-label="การแจ้งเตือน">
      <header className="nb-head">
        <strong>การแจ้งเตือน</strong>
        <div>
          {unread > 0 && <button type="button" className="nb-link" onClick={() => void readAll()}><CheckCheck size={15}/> อ่านทั้งหมด</button>}
          <button type="button" className="nb-close" onClick={() => setOpen(false)} aria-label="ปิด"><X size={18}/></button>
        </div>
      </header>
      {error && <p className="nb-empty" role="alert">{error}</p>}
      {!error && items.length === 0 && <p className="nb-empty">ยังไม่มีการแจ้งเตือน เมื่อมีข้อเสนอหรือความคืบหน้าของงาน จะแสดงที่นี่</p>}
      {items.length > 0 && <ul className="nb-list">{items.map(item => <li key={item.id}>
        <button type="button" className={'nb-item' + (item.read ? '' : ' unread')} onClick={() => void choose(item)}>
          <span className="nb-dot" aria-hidden="true"/>
          <span className="nb-text"><strong>{!item.read && <span className="sr-only">ยังไม่อ่าน: </span>}{item.title}</strong><span>{item.body.split('\n')[0]}</span><small>{timeAgo(item.createdAt)}</small></span>
        </button>
      </li>)}</ul>}
      <footer className="nb-foot"><button type="button" className="nb-link" onClick={() => { setOpen(false); onSetupPush(); }}><BellRing size={15}/> รับการแจ้งเตือนบนมือถือ</button></footer>
    </section>}
  </div>;
}
