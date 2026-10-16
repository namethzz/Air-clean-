import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { privateImageUrl } from '../lib/api';

/** Loads an image that needs the sign-in token (a document or a slip) and frees it when it goes away. */
export function usePrivateImage(path: string | null) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!path) return;
    let alive = true, made = '';
    setUrl(''); setFailed(false);
    privateImageUrl(path).then(value => { made = value; if (alive) setUrl(value); else URL.revokeObjectURL(value); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return { url, failed };
}

export default function PrivateImage({ path, alt, onOpen }: { path: string; alt: string; onOpen?: (url: string) => void }) {
  const { url, failed } = usePrivateImage(path);
  return <button type="button" className="pi-thumb" disabled={!url || !onOpen} onClick={() => url && onOpen?.(url)} aria-label={onOpen ? `ดู${alt}` : alt}>
    {url ? <img src={url} alt={alt}/> : failed ? <ImageOff size={20} aria-label="โหลดรูปไม่สำเร็จ"/> : <Loader2 size={20} className="ui-spin" aria-label="กำลังโหลด"/>}
  </button>;
}

/** A full-screen look at one image; Escape or a tap outside closes it. */
export function ImageViewer({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return <div className="pi-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
    <img src={url} alt={alt} onClick={event => event.stopPropagation()}/>
    <button type="button" className="pi-close" onClick={onClose}>ปิด</button>
  </div>;
}
