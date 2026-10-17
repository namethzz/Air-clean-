/**
 * Google sign-in in the browser. It returns an ID token that the API verifies.
 * Set VITE_GOOGLE_CLIENT_ID at build time to show the button.
 */
export type SocialProvider = 'google';

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

export const googleEnabled = Boolean(GOOGLE_CLIENT_ID);

interface GoogleCredentialResponse { credential?: string }
interface GoogleAccountsId {
  initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode?: 'popup'; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window { google?: { accounts?: { id?: GoogleAccountsId } } }
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
