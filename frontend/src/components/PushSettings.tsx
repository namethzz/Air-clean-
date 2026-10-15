import { useEffect, useState } from 'react';
import { BellOff, BellRing, CheckCircle2, Info, Send } from 'lucide-react';
import { disablePush, enablePush, isPushEnabled, pushUnavailableReason } from '../lib/push';
import { sendTestPush } from '../lib/api';

/** Turn push notifications on or off for this device, with the reason when the device cannot use them. */
export default function PushSettings() {
  const [unavailable] = useState(pushUnavailableReason);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (unavailable) { setEnabled(false); return; }
    isPushEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, [unavailable]);

  async function run(action: () => Promise<void>, done: string, next: boolean) {
    setBusy(true); setMessage(null);
    try { await action(); setEnabled(next); setMessage({ ok: true, text: done }); }
    catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage(null);
    try { setMessage({ ok: true, text: await sendTestPush() }); }
    catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : 'ส่งการแจ้งเตือนทดสอบไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }

  return <section className="panel profile-form-panel" id="push-settings">
    <div className="panel-heading"><div><h2>การแจ้งเตือนบนอุปกรณ์นี้</h2><p>ให้มือถือหรือคอมพิวเตอร์เครื่องนี้เด้งแจ้งเตือนเมื่อมีข้อเสนอหรือความคืบหน้าของงาน แม้ปิดหน้าเว็บอยู่</p></div></div>
    <div className="profile-form">
      {unavailable
        ? <div className="push-note" role="note"><Info size={18}/><span>{unavailable}</span></div>
        : <>
          <div className={'push-state' + (enabled ? ' on' : '')} role="status">
            {enabled ? <BellRing size={18}/> : <BellOff size={18}/>}
            <span>{enabled === null ? 'กำลังตรวจสอบ...' : enabled ? 'เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว' : 'ยังไม่ได้เปิดการแจ้งเตือนบนอุปกรณ์นี้'}</span>
          </div>
          <div className="push-actions">
            {enabled
              ? <>
                <button type="button" className="primary-button" disabled={busy} onClick={() => void test()}><Send size={16}/> ส่งการแจ้งเตือนทดสอบ</button>
                <button type="button" className="outline-button" disabled={busy} onClick={() => void run(disablePush, 'ปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว', false)}><BellOff size={16}/> ปิดการแจ้งเตือน</button>
              </>
              : <button type="button" className="primary-button" disabled={busy || enabled === null} onClick={() => void run(enablePush, 'เปิดการแจ้งเตือนแล้ว ลองกด “ส่งการแจ้งเตือนทดสอบ”', true)}><BellRing size={16}/> {busy ? 'กำลังเปิด...' : 'เปิดการแจ้งเตือน'}</button>}
          </div>
        </>}
      {message && (message.ok
        ? <div className="profile-saved" role="status"><CheckCircle2 size={17}/>{message.text}</div>
        : <div className="auth-error" role="alert">{message.text}</div>)}
      <p className="page-subtitle">การแจ้งเตือนในเว็บ (ไอคอนกระดิ่ง) ทำงานเสมอ ส่วนการแจ้งเตือนบนอุปกรณ์ต้องเปิดแยกในแต่ละเครื่อง</p>
    </div>
  </section>;
}
