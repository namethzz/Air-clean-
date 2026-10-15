import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** How often to look for a new deploy while the app stays open. */
const CHECK_MS = 5 * 60 * 1000;
const RELOAD_KEY = 'airclean.reloadedFor';

async function deployedVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return ((await response.json()) as { version?: string }).version ?? null;
  } catch { return null; }
}

/**
 * Apps opened from the Home Screen stay in memory for days and keep running the version they started with.
 * When a newer deploy exists the app reloads as soon as it comes back to the front (nothing is half-typed then),
 * and while it is open it offers a one-tap update instead of reloading under the person's fingers.
 */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function check(reloadNow: boolean) {
      const version = await deployedVersion();
      if (disposed || !version || version === __APP_VERSION__) return;
      // Reload once per new version; if the page still comes back old (a cached copy), offer the button instead of looping.
      let tried = false;
      try { tried = sessionStorage.getItem(RELOAD_KEY) === version; sessionStorage.setItem(RELOAD_KEY, version); } catch { tried = true; }
      if (reloadNow && !tried) window.location.reload();
      else setAvailable(true);
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check(true); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    const timer = window.setInterval(() => void check(false), CHECK_MS);
    void check(true);
    return () => { disposed = true; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onVisible); window.clearInterval(timer); };
  }, []);
  if (!available) return null;
  return <div className="update-banner" role="status">
    <span>มี AirClean เวอร์ชันใหม่</span>
    <button type="button" onClick={() => window.location.reload()}><RefreshCw size={15}/> อัปเดตตอนนี้</button>
  </div>;
}
