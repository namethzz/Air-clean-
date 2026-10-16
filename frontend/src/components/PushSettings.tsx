import { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Info, Send, XCircle } from 'lucide-react';
import { disablePush, enablePush, isPushEnabled, pushUnavailableReason } from '../lib/push';
import { sendTestPush } from '../lib/api';

export type PushState = 'on' | 'off' | 'unavailable';

/** A switch that turns push notifications on or off for this device, with the reason when the device cannot use them. */
export default function PushSettings({ onChange }: { onChange?: (state: PushState) => void }) {
  const [unavailable] = useState(pushUnavailableReason);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    if (unavailable) { setEnabled(false); return; }
    isPushEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, [unavailable]);
  useEffect(() => { if (enabled !== null) changed.current?.(unavailable ? 'unavailable' : enabled ? 'on' : 'off'); }, [enabled, unavailable]);

  async function toggle() {
    const next = !enabled;
    setBusy(true); setMessage(null);
    try {
      await (next ? enablePush() : disablePush());
      setEnabled(next);
      setMessage({ ok: true, text: next ? 'เปิดแล้ว ลองกด “ส่งการแจ้งเตือนทดสอบ” ดูได้' : 'ปิดการแจ้งเตือนบนเครื่องนี้แล้ว' });
    } catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage(null);
    try { setMessage({ ok: true, text: await sendTestPush() }); }
    catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : 'ส่งการแจ้งเตือนทดสอบไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }

  return <section className="pf-card" id="push-settings" aria-labelledby="pf-push-title">
    <div className="pf-row">
      <span className="pf-row-icon" aria-hidden="true"><BellRing size={19}/></span>
      <div className="pf-row-text">
        <strong id="pf-push-title">การแจ้งเตือนบนเครื่องนี้</strong>
        <span>เด้งเตือนเมื่อมีงานใหม่ ข้อเสนอ หรือความคืบหน้าของงาน แม้ปิดหน้าเว็บอยู่</span>
      </div>
      {!unavailable && <button type="button" role="switch" className="pf-switch" aria-checked={!!enabled} aria-labelledby="pf-push-title"
        disabled={busy || enabled === null} onClick={() => void toggle()}><span/></button>}
    </div>
    {unavailable && <div className="pf-alert info" role="note"><Info size={17}/><span>{unavailable}</span></div>}
    {enabled && <button type="button" className="pf-text-button" disabled={busy} onClick={() => void test()}><Send size={15}/>ส่งการแจ้งเตือนทดสอบ</button>}
    {message && <div className={'pf-alert ' + (message.ok ? 'ok' : 'bad')} role={message.ok ? 'status' : 'alert'}>
      {message.ok ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<span>{message.text}</span></div>}
    <p className="pf-fine">ไอคอนกระดิ่งในเว็บแจ้งเตือนเสมอ ส่วนการแจ้งเตือนบนเครื่องต้องเปิดแยกทีละเครื่อง</p>
  </section>;
}
