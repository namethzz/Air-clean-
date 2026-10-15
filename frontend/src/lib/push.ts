import { fetchPushPublicKey, removePushSubscription, savePushSubscription } from './api';

export type PushSupport = 'ready' | 'install' | 'inapp' | 'unsupported';

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** What this device needs before it can show notifications: nothing, a Home Screen install (iPhone/iPad), another browser, or nothing will work. */
export function pushSupport(): PushSupport {
  if (/FBAN|FBAV|FB_IAB|Messenger|Line\/|Instagram|MicroMessenger|KAKAOTALK/i.test(navigator.userAgent)) return 'inapp';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isIOS() && !standalone) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  return 'ready';
}

/** Why push cannot be used here, in words the person can act on; null when it can. */
export function pushUnavailableReason(): string | null {
  const ua = navigator.userAgent;
  // Messenger, LINE, Facebook, Instagram and similar in-app browsers cannot receive push.
  if (/FBAN|FBAV|FB_IAB|Messenger|Line\/|Instagram|MicroMessenger|KAKAOTALK/i.test(ua))
    return 'กำลังเปิดผ่านแอปแชต (เช่น Messenger หรือ LINE) ซึ่งรับการแจ้งเตือนไม่ได้ กรุณาเปิดเว็บนี้ใน Chrome หรือ Safari';
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iOS && !standalone)
    return 'บน iPhone/iPad ให้กดปุ่มแชร์ใน Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” จากนั้นเปิด AirClean จากไอคอนบนหน้าจอโฮมแล้วกลับมาเปิดการแจ้งเตือนที่นี่ (ต้องเป็น iOS 16.4 ขึ้นไป)';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน ลองใช้ Chrome, Edge, Firefox หรือ Safari รุ่นล่าสุด';
  if (!window.isSecureContext) return 'การแจ้งเตือนใช้ได้เมื่อเปิดเว็บผ่าน https เท่านั้น';
  return null;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(undefined);
  return navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await registerServiceWorker();
  if (!existing) throw new Error('ไม่สามารถเตรียมระบบแจ้งเตือนของเบราว์เซอร์ได้');
  return navigator.serviceWorker.ready;
}

function keyBytes(base64Url: string): Uint8Array {
  const base64 = (base64Url + '='.repeat((4 - base64Url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when this browser is subscribed and permission is still granted. */
export async function isPushEnabled(): Promise<boolean> {
  if (pushUnavailableReason() || Notification.permission !== 'granted') return false;
  const subscription = await (await registration()).pushManager.getSubscription();
  return Boolean(subscription);
}

/** Asks permission, subscribes this browser and saves it to the account. */
export async function enablePush(): Promise<void> {
  const reason = pushUnavailableReason();
  if (reason) throw new Error(reason);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(permission === 'denied'
      ? 'เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ไว้ เปิดได้ที่การตั้งค่าเว็บไซต์ (ไอคอนแม่กุญแจข้างที่อยู่เว็บ) แล้วลองอีกครั้ง'
      : 'ยังไม่ได้อนุญาตการแจ้งเตือน');
  const reg = await registration();
  const key = keyBytes(await fetchPushPublicKey());
  let subscription = await reg.pushManager.getSubscription();
  // A subscription made with a different server key cannot receive our messages; replace it.
  const currentKey = subscription?.options.applicationServerKey;
  if (subscription && currentKey && toBase64Url(currentKey) !== toBase64Url(key.buffer as ArrayBuffer)) { await subscription.unsubscribe(); subscription = null; }
  try { subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }); }
  catch {
    throw new Error('เบราว์เซอร์ลงทะเบียนรับการแจ้งเตือนไม่สำเร็จ ลองปิดโหมดไม่ระบุตัวตน (Incognito) หรือโหมดประหยัดข้อมูล แล้วเปิดใหม่อีกครั้ง');
  }
  await savePushSubscription({ endpoint: subscription.endpoint, p256dh: toBase64Url(subscription.getKey('p256dh')), auth: toBase64Url(subscription.getKey('auth')) });
}

export async function disablePush(): Promise<void> {
  const subscription = await (await registration()).pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
