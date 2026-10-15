/**
 * Google and Apple sign-in in the browser. Each returns an ID token that the API verifies.
 * Set VITE_GOOGLE_CLIENT_ID and/or VITE_APPLE_CLIENT_ID at build time to show the buttons.
 */
export type SocialProvider = 'google' | 'apple';

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
const APPLE_CLIENT_ID = (import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined)?.trim();
/** Must match a Return URL registered for the Apple Services ID. Defaults to this site's home page. */
const APPLE_REDIRECT_URI = (import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined)?.trim();

export const googleEnabled = Boolean(GOOGLE_CLIENT_ID);
export const appleEnabled = Boolean(APPLE_CLIENT_ID);

interface GoogleCredentialResponse { credential?: string }
interface GoogleAccountsId {
  initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode?: 'popup'; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
}
interface AppleSignInResponse { authorization?: { id_token?: string }; user?: { name?: { firstName?: string; lastName?: string } } }
interface AppleAuth {
  init(options: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
  signIn(): Promise<AppleSignInResponse>;
}
declare global {
  interface Window { google?: { accounts?: { id?: GoogleAccountsId } }; AppleID?: { auth?: AppleAuth } }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.async = true; script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => { scripts.delete(src); reject(new Error('โหลดระบบเข้าสู่ระบบของผู้ให้บริการไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')); };
      document.head.appendChild(script);
    });
    scripts.set(src, pending);
  }
  return pending;
}

let googleCallback: (token: string) => void = () => {};
let googleReady: Promise<GoogleAccountsId> | null = null;

/** Draws Google's own button (required by Google's branding rules) and reports the ID token on success. */
export async function renderGoogleButton(element: HTMLElement, onToken: (idToken: string) => void, text: 'signin_with' | 'signup_with' | 'continue_with' = 'continue_with'): Promise<void> {
  if (!GOOGLE_CLIENT_ID) return;
  googleCallback = onToken;
  googleReady ??= loadScript('https://accounts.google.com/gsi/client').then(() => {
    const api = window.google?.accounts?.id;
    if (!api) throw new Error('โหลดระบบเข้าสู่ระบบด้วย Google ไม่สำเร็จ');
    api.initialize({ client_id: GOOGLE_CLIENT_ID, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true,
      callback: response => { if (response.credential) googleCallback(response.credential); } });
    return api;
  }).catch(error => { googleReady = null; throw error; });
  const api = await googleReady;
  element.replaceChildren();
  api.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text, logo_alignment: 'left',
    locale: 'th', width: Math.max(200, Math.min(400, Math.round(element.getBoundingClientRect().width || 320))) });
}

/** Opens Apple's popup. Apple sends the person's name only the first time they share it with this app. */
export async function signInWithApple(): Promise<{ idToken: string; fullName?: string }> {
  if (!APPLE_CLIENT_ID) throw new Error('ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Apple');
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error('โหลดระบบเข้าสู่ระบบด้วย Apple ไม่สำเร็จ');
  auth.init({ clientId: APPLE_CLIENT_ID, scope: 'name email', redirectURI: APPLE_REDIRECT_URI || window.location.origin + '/', usePopup: true });
  let response: AppleSignInResponse;
  try { response = await auth.signIn(); }
  catch (error) {
    const code = (error as { error?: string })?.error;
    throw new Error(code === 'popup_closed_by_user' || code === 'user_cancelled_authorize' ? 'ยกเลิกการเข้าสู่ระบบด้วย Apple แล้ว' : 'เข้าสู่ระบบด้วย Apple ไม่สำเร็จ กรุณาลองใหม่');
  }
  const idToken = response.authorization?.id_token;
  if (!idToken) throw new Error('Apple ไม่ได้ส่งข้อมูลยืนยันตัวตนกลับมา กรุณาลองใหม่');
  const name = [response.user?.name?.firstName, response.user?.name?.lastName].filter(Boolean).join(' ').trim();
  return { idToken, fullName: name || undefined };
}
