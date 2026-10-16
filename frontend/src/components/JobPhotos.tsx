import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImageOff, Loader2, Plus, X } from 'lucide-react';
import type { JobPhoto } from '../types';
import { deleteJobPhoto, fetchJobPhotos, jobPhotoUrl, uploadJobPhoto } from '../lib/api';
import { resizeForUpload } from '../lib/image';
import { Problem } from './kit';
import './JobPhotos.css';

const kindLabel = { before: 'ก่อนล้าง', after: 'หลังล้าง' } as const;

/** Loads a photo with the sign-in token and shows it; frees the memory when it goes away. */
function useAuthImage(id: string | null) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true, made = '';
    setUrl(''); setFailed(false);
    jobPhotoUrl(id).then(value => { made = value; if (alive) setUrl(value); else URL.revokeObjectURL(value); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return { url, failed };
}

function Thumb({ photo, onOpen, onRemove }: { photo: JobPhoto; onOpen?: () => void; onRemove?: () => void }) {
  const { url, failed } = useAuthImage(photo.id);
  return <figure className="ph-thumb">
    <button type="button" className="ph-thumb-img" onClick={onOpen} aria-label={`ดูรูป${kindLabel[photo.kind]}`} disabled={!onOpen}>
      {url ? <img src={url} alt={`รูป${kindLabel[photo.kind]}`}/> : failed ? <ImageOff size={22} aria-label="โหลดรูปไม่สำเร็จ"/> : <Loader2 size={22} className="ui-spin" aria-label="กำลังโหลด"/>}
    </button>
    {onRemove && <button type="button" className="ph-remove" onClick={onRemove} aria-label="ลบรูปนี้"><X size={16} strokeWidth={2.6}/></button>}
  </figure>;
}

function Viewer({ photos, index, onClose, onMove }: { photos: JobPhoto[]; index: number; onClose: () => void; onMove: (index: number) => void }) {
  const photo = photos[index];
  const { url, failed } = useAuthImage(photo.id);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus({ preventScroll: true });
    return () => before?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < photos.length - 1) onMove(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onMove(index - 1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [index, photos.length, onClose, onMove]);
  return <div className="ph-viewer" role="dialog" aria-modal="true" aria-label="รูปงาน" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button type="button" ref={close} className="ph-viewer-btn ph-viewer-close" onClick={onClose} aria-label="ปิด"><X size={24}/></button>
    {url ? <img src={url} alt={`รูป${kindLabel[photo.kind]}`}/> : failed ? <p className="ph-viewer-note">โหลดรูปไม่สำเร็จ</p> : <Loader2 size={30} className="ui-spin ph-viewer-note" aria-label="กำลังโหลด"/>}
    <p className="ph-viewer-caption" aria-live="polite">{kindLabel[photo.kind]} · <span className="ui-num">{index + 1}/{photos.length}</span></p>
    {index > 0 && <button type="button" className="ph-viewer-btn ph-viewer-nav is-prev" onClick={() => onMove(index - 1)} aria-label="รูปก่อนหน้า"><ChevronLeft size={28}/></button>}
    {index < photos.length - 1 && <button type="button" className="ph-viewer-btn ph-viewer-nav is-next" onClick={() => onMove(index + 1)} aria-label="รูปถัดไป"><ChevronRight size={28}/></button>}
  </div>;
}

/** Read-only gallery of a job's photos for the customer, the technician and admins. Renders nothing without photos. */
export function JobPhotoGallery({ bookingId, title = 'รูปจากหน้างาน', className = '' }: { bookingId: number; title?: string; className?: string }) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { fetchJobPhotos(bookingId).then(setPhotos).catch(() => setPhotos([])); }, [bookingId]);
  if (!photos.length) return null;
  const ordered = [...photos.filter(p => p.kind === 'before'), ...photos.filter(p => p.kind === 'after')];
  return <section className={'ph' + (className ? ' ' + className : '')}>
    <h3 className="ph-title">{title}</h3>
    {(['before', 'after'] as const).map(kind => {
      const rows = ordered.filter(p => p.kind === kind);
      return rows.length ? <div key={kind} className="ph-group"><span className="ph-kind">{kindLabel[kind]} <span className="ui-num">{rows.length}</span></span><div className="ph-grid">
        {rows.map(photo => <Thumb key={photo.id} photo={photo} onOpen={() => setOpen(ordered.indexOf(photo))}/>)}
      </div></div> : null;
    })}
    {open != null && <Viewer photos={ordered} index={open} onClose={() => setOpen(null)} onMove={setOpen}/>}
  </section>;
}

/** The technician's photo step when closing a job: take or pick photos; each one uploads straight away. */
export function JobPhotoPicker({ bookingId, onChange }: { bookingId: number; onChange: (state: { after: number; failed: boolean }) => void }) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [uploading, setUploading] = useState<Record<'before' | 'after', number>>({ before: 0, after: 0 });
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const inputs = { before: useRef<HTMLInputElement>(null), after: useRef<HTMLInputElement>(null) };

  useEffect(() => { fetchJobPhotos(bookingId).then(setPhotos).catch(() => undefined); }, [bookingId]);
  useEffect(() => { onChange({ after: photos.filter(p => p.kind === 'after').length, failed }); }, [photos, failed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(kind: 'before' | 'after', files: FileList | null) {
    if (!files?.length) return;
    setError('');
    for (const file of Array.from(files).slice(0, 8)) {
      setUploading(value => ({ ...value, [kind]: value[kind] + 1 }));
      try {
        const saved = await uploadJobPhoto(bookingId, kind, await resizeForUpload(file));
        setPhotos(value => [...value, saved]);
      } catch (reason) {
        setFailed(true);
        setError(reason instanceof Error ? reason.message : 'อัปโหลดรูปไม่สำเร็จ');
      } finally { setUploading(value => ({ ...value, [kind]: value[kind] - 1 })); }
    }
  }
  async function remove(photo: JobPhoto) {
    setPhotos(value => value.filter(p => p.id !== photo.id));
    await deleteJobPhoto(photo.id).catch(() => setPhotos(value => [...value, photo]));
  }

  return <div className="ph ph-picker">
    {(['before', 'after'] as const).map(kind => <div key={kind} className="ph-group">
      <span className="ph-kind">{kindLabel[kind]}{kind === 'after' ? ' *' : <em> (ถ้ามี)</em>}</span>
      <div className="ph-grid">
        {photos.filter(p => p.kind === kind).map(photo => <Thumb key={photo.id} photo={photo} onRemove={() => void remove(photo)}/>)}
        {Array.from({ length: uploading[kind] }, (_, i) => <figure key={'u' + i} className="ph-thumb"><span className="ph-thumb-img" role="status" aria-label="กำลังอัปโหลด"><Loader2 size={22} className="ui-spin"/></span></figure>)}
        {photos.length < 8 && <button type="button" className="ph-add" onClick={() => inputs[kind].current?.click()}>
          {photos.some(p => p.kind === kind) ? <Plus size={24}/> : <Camera size={24}/>}<span>{photos.some(p => p.kind === kind) ? 'เพิ่ม' : 'ถ่ายรูป'}</span>
        </button>}
      </div>
      <input ref={inputs[kind]} type="file" accept="image/*" multiple hidden onChange={event => { void add(kind, event.target.files); event.target.value = ''; }}/>
    </div>)}
    {error && <Problem>{error}</Problem>}
  </div>;
}
