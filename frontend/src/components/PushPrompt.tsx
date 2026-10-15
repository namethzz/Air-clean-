import { useEffect, useState } from 'react';
import { BellRing, Share, SquarePlus, X } from 'lucide-react';
import type { UserRole } from '../types';
import { enablePush, isPushEnabled, pushSupport } from '../lib/push';

interface Props { userId: number; role: UserRole; }

/** Ask again this long after "not now". */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const storageKey = (userId: number) => `airclean.pushAsk.${userId}`;
function snoozed(userId: number) {
  try { return Date.now() - Number(localStorage.getItem(storageKey(userId)) || 0) < SNOOZE_MS; } catch { return false; }
}
function snooze(userId: number) { try { localStorage.setItem(storageKey(userId), String(Date.now())); } catch { /* private mode */ } }

const why: Record<UserRole, string> = {
  customer: 'รู้ทันทีเมื่อช่างเสนอราคา กำลังเดินทางมา และล้างเสร็จ แม้ไม่ได้เปิดแอปอยู่',
  technician: 'รู้ทันทีเมื่อลูกค้าเลือกคุณ มีงานใหม่ หรือมีการเปลี่ยนแปลงนัดหมาย แม้ไม่ได้เปิดแอปอยู่',
  manager: 'รู้ทันทีเมื่อมีความคืบหน้าของงาน แม้ไม่ได้เปิดแอปอยู่',
  admin: 'รู้ทันทีเมื่อมีช่างสมัครใหม่หรือมีเรื่องถูกแจ้ง แม้ไม่ได้เปิดแอปอยู่',
};

/**
 * Asks for notifications when the app opens. Browsers only show the permission dialog after a tap, so this is a
 * sheet with a button. Devices that already allowed it are subscribed quietly; iPhone/iPad in Safari first get
 * the Home Screen steps, because iOS only allows notifications for installed web apps.
 */
export default function PushPrompt({ userId, role }: Props) {
  const [mode, setMode] = useState<'ask' | 'install' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const support = pushSupport();
    if (support === 'install') { if (!snoozed(userId)) setMode('install'); return; }
    if (support !== 'ready') return;
    if (Notification.permission === 'granted') {
      // Allowed before (or on another account on this device): make sure this account receives on this device.
      void isPushEnabled().then(on => on ? undefined : enablePush()).catch(() => undefined);
      return;
    }
    if (Notification.permission === 'denied' || snoozed(userId)) return;
    const timer = window.setTimeout(() => { if (!cancelled) setMode('ask'); }, 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [userId]);

  if (!mode) return null;
  const close = () => { snooze(userId); setMode(null); };
  async function allow() {
    setBusy(true); setError('');
    try { await enablePush(); setMode(null); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เปิดการแจ้งเตือนไม่สำเร็จ');
      if (Notification.permission === 'denied') snooze(userId);
    }
    finally { setBusy(false); }
  }

  return <div className="pp-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="pp-sheet" role="dialog" aria-modal="true" aria-labelledby="pp-title">
      <button type="button" className="pp-close" onClick={close} aria-label="ปิด"><X size={20}/></button>
      <span className="pp-icon"><BellRing size={28}/></span>
      <h2 id="pp-title">เปิดการแจ้งเตือน</h2>
      <p>{why[role]}</p>
      {mode === 'install'
        ? <>
          <ol className="pp-steps">
            <li><Share size={18}/><span>กดปุ่ม <strong>แชร์</strong> ด้านล่างของ Safari</span></li>
            <li><SquarePlus size={18}/><span>เลือก <strong>“เพิ่มไปยังหน้าจอโฮม”</strong></span></li>
            <li><BellRing size={18}/><span>เปิด AirClean จากไอคอนบนหน้าจอโฮม แล้วกด <strong>“เปิดการแจ้งเตือน”</strong></span></li>
          </ol>
          <p className="pp-small">iPhone และ iPad รับการแจ้งเตือนได้เมื่อเปิดจากไอคอนบนหน้าจอโฮม (iOS 16.4 ขึ้นไป)</p>
          <button type="button" className="pp-primary" onClick={close}>เข้าใจแล้ว</button>
        </>
        : <>
          {error && <p className="pp-error" role="alert">{error}</p>}
          <button type="button" className="pp-primary" disabled={busy} onClick={() => void allow()}><BellRing size={18}/> {busy ? 'กำลังเปิด...' : 'เปิดการแจ้งเตือน'}</button>
          <button type="button" className="pp-later" disabled={busy} onClick={close}>ไว้ทีหลัง</button>
        </>}
    </section>
  </div>;
}
