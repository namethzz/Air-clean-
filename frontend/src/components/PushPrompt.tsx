import { useEffect, useState } from 'react';
import { BellRing, Info } from 'lucide-react';
import { Problem, Sheet, Steps } from './kit';
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

  // The kit sheet: focus moves in and stays in, Escape and a tap outside mean "not now".
  if (mode === 'install') return <Sheet title="เปิดการแจ้งเตือน" sub={why[role]} onClose={close}
    footer={<button type="button" className="ui-btn is-primary is-lg is-block" onClick={close}>เข้าใจแล้ว</button>}>
    <Steps items={[
      { title: 'กดปุ่มแชร์', text: 'ปุ่มแชร์อยู่ด้านล่างของ Safari' },
      { title: 'เลือก “เพิ่มไปยังหน้าจอโฮม”', text: 'AirClean จะมีไอคอนบนหน้าจอโฮม' },
      { title: 'เปิดจากไอคอน แล้วกด “เปิดการแจ้งเตือน”', text: 'iPhone และ iPad รับการแจ้งเตือนได้เมื่อเปิดจากไอคอนบนหน้าจอโฮม (iOS 16.4 ขึ้นไป)' },
    ]}/>
  </Sheet>;
  return <Sheet title="เปิดการแจ้งเตือน" sub={why[role]} onClose={close}
    footer={<>
      <button type="button" className="ui-btn is-primary is-lg is-block" disabled={busy} aria-busy={busy} onClick={() => void allow()}><BellRing size={20}/> {busy ? 'กำลังเปิด…' : 'เปิดการแจ้งเตือน'}</button>
      <button type="button" className="ui-btn is-ghost is-block" disabled={busy} onClick={close}>ไว้ทีหลัง</button>
    </>}>
    <p className="ui-alert is-info"><Info size={18}/><span>เบราว์เซอร์จะถามอีกครั้ง กด “อนุญาต” แล้วปิดได้ทุกเมื่อที่หน้าบัญชี</span></p>
    {error && <Problem>{error}</Problem>}
  </Sheet>;
}
