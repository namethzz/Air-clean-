import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImageOff, Loader2, Plus, X } from 'lucide-react';
import type { JobPhoto } from '../types';
import { deleteJobPhoto, fetchJobPhotos, jobPhotoUrl, uploadJobPhoto } from '../lib/api';
import { resizeForUpload } from '../lib/image';

const kindLabel = { before: 'ก่อนล้าง', after: 'หลังล้าง' } as const;

/** Loads a photo with the sign-in token and shows it; frees the memory when it goes away. */
function useAuthImage(id: string | null) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true, made = '';
    jobPhotoUrl(id).then(value => { made = value; if (alive) setUrl(value); else URL.revokeObjectURL(value); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return { url, failed };
}

function Thumb({ photo, onOpen, onRemove }: { photo: JobPhoto; onOpen?: () => void; onRemove?: () => void }) {
  const { url, failed } = useAuthImage(photo.id);
  return <figure className="jp-thumb">
    <button type="button" className="jp-thumb-img" onClick={onOpen} aria-label={`ดูรูป${kindLabel[photo.kind]}`} disabled={!onOpen}>
      {url ? <img src={url} alt={`รูป${kindLabel[photo.kind]}`}/> : failed ? <ImageOff size={20}/> : <Loader2 size={20} className="ui-spin"/>}
    </button>
    {onRemove && <button type="button" className="jp-remove" onClick={onRemove} aria-label="ลบรูปนี้"><X size={14}/></button>}
  </figure>;
}

function Viewer({ photos, index, onClose, onMove }: { photos: JobPhoto[]; index: number; onClose: () => void; onMove: (index: number) => void }) {
  const photo = photos[index];
  const { url, failed } = useAuthImage(photo.id);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < photos.length - 1) onMove(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onMove(index - 1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [index, photos.length, onClose, onMove]);
  return <div className="jp-viewer" role="dialog" aria-modal="true" aria-label="รูปงาน" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button type="button" className="jp-viewer-close" onClick={onClose} aria-label="ปิด"><X size={22}/></button>
    {url ? <img src={url} alt={`รูป${kindLabel[photo.kind]}`}/> : failed ? <p>โหลดรูปไม่สำเร็จ</p> : <Loader2 size={28} className="ui-spin"/>}
    <p className="jp-viewer-caption">{kindLabel[photo.kind]} · {index + 1}/{photos.length}</p>
    {index > 0 && <button type="button" className="jp-viewer-nav prev" onClick={() => onMove(index - 1)} aria-label="รูปก่อนหน้า"><ChevronLeft size={26}/></button>}
    {index < photos.length - 1 && <button type="button" className="jp-viewer-nav next" onClick={() => onMove(index + 1)} aria-label="รูปถัดไป"><ChevronRight size={26}/></button>}
  </div>;
}

/** Read-only gallery of a job's photos for the customer, the technician and admins. Renders nothing without photos. */
export function JobPhotoGallery({ bookingId, title = 'รูปจากหน้างาน' }: { bookingId: number; title?: string }) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { fetchJobPhotos(bookingId).then(setPhotos).catch(() => setPhotos([])); }, [bookingId]);
  if (!photos.length) return null;
  const ordered = [...photos.filter(p => p.kind === 'before'), ...photos.filter(p => p.kind === 'after')];
  return <section className="jp-gallery">
    <h3>{title}</h3>
    {(['before', 'after'] as const).map(kind => {
      const rows = ordered.filter(p => p.kind === kind);
      return rows.length ? <div key={kind}><span className="jp-kind">{kindLabel[kind]}</span><div className="jp-grid">
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

  return <div className="jp-picker">
    {(['before', 'after'] as const).map(kind => <div key={kind} className="jp-picker-row">
      <span className="jp-kind">{kindLabel[kind]}{kind === 'after' ? ' *' : ' (ถ้ามี)'}</span>
      <div className="jp-grid">
        {photos.filter(p => p.kind === kind).map(photo => <Thumb key={photo.id} photo={photo} onRemove={() => void remove(photo)}/>)}
        {Array.from({ length: uploading[kind] }, (_, i) => <figure key={'u' + i} className="jp-thumb"><span className="jp-thumb-img"><Loader2 size={20} className="ui-spin"/></span></figure>)}
        {photos.length < 8 && <button type="button" className="jp-add" onClick={() => inputs[kind].current?.click()}>
          {photos.some(p => p.kind === kind) ? <Plus size={22}/> : <Camera size={22}/>}<span>{photos.some(p => p.kind === kind) ? 'เพิ่ม' : 'ถ่ายรูป'}</span>
        </button>}
      </div>
      <input ref={inputs[kind]} type="file" accept="image/*" multiple hidden onChange={event => { void add(kind, event.target.files); event.target.value = ''; }}/>
    </div>)}
    {error && <p className="jp-error" role="alert">{error}</p>}
  </div>;
}
