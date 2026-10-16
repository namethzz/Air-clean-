import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Camera, Loader2, Minus, Plus, RotateCw, Trash2, X, XCircle } from 'lucide-react';
import type { UserProfile } from '../types';
import { deleteProfilePhoto, uploadProfilePhoto } from '../lib/api';
import { loadImage } from '../lib/image';
import { clampCrop, drawCrop, MAX_ZOOM, turn, zoomTo, type CropState } from '../lib/crop';
import Avatar from './Avatar';

/** The saved photo: 512px square JPEG, sharp on high-density screens and around 40–80 KB. */
const OUTPUT = 512;
const START: CropState = { zoom: 1, x: 0, y: 0, rotation: 0 };
interface Loaded { image: ImageBitmap | HTMLImageElement; width: number; height: number }

const hintFor = (role: UserProfile['role']) => role === 'technician'
  ? 'ลูกค้าเห็นรูปนี้ตอนเทียบข้อเสนอและในงานที่เลือกคุณ รูปหน้าตรงที่เห็นชัดช่วยให้ลูกค้ามั่นใจ'
  : 'รูปนี้แสดงในบัญชีของคุณ ช่วยให้จำบัญชีได้ง่ายขึ้น';

/**
 * A sheet (a dialog on wide screens) to choose, frame and save a profile photo, or remove it.
 * Framing: drag to move, pinch / scroll / slider to zoom, and a quarter-turn button for sideways photos.
 */
export default function PhotoEditor({ user, onClose, onSaved }: { user: UserProfile; onClose: () => void; onSaved: (user: UserProfile) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [crop, setCrop] = useState<CropState>(START);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState(280);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  // The key handler reads the latest close; the effect runs once, so focus is not pulled back on every render.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  useEffect(() => () => { if (loaded && 'close' in loaded.image) loaded.image.close(); }, [loaded]);

  // The framing square follows the sheet's width (phones) up to 320px.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setView(Math.round(Math.min(320, frame.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [loaded]);

  // Redraw the preview whenever the framing changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(view * ratio); canvas.height = Math.round(view * ratio);
    const context = canvas.getContext('2d');
    if (context) drawCrop(context, loaded.image, loaded.width, loaded.height, view, canvas.width, crop);
  }, [loaded, crop, view]);

  const fit = useCallback((next: CropState) => loaded ? clampCrop(next, loaded.width, loaded.height, view) : next, [loaded, view]);
  useEffect(() => { setCrop(previous => fit(previous)); }, [fit]);

  async function choose(file?: File) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(''); setOpening(true);
    try {
      if (!file.type.startsWith('image/') && file.type !== '') throw new Error('เลือกไฟล์รูปภาพ (JPG, PNG หรือ WebP)');
      if (file.size > 25_000_000) throw new Error('ไฟล์ใหญ่เกินไป เลือกรูปที่เล็กกว่า 25 MB');
      const next = await loadImage(file);
      if (next.width < 64 || next.height < 64) throw new Error('รูปเล็กเกินไป เลือกรูปที่ใหญ่กว่านี้');
      setLoaded(next); setCrop(START);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'เปิดรูปนี้ไม่ได้ ลองรูปอื่น'); }
    finally { setOpening(false); }
  }

  async function save() {
    if (!loaded) return;
    setBusy('save'); setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT; canvas.height = OUTPUT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('เตรียมรูปไม่สำเร็จ');
      drawCrop(context, loaded.image, loaded.width, loaded.height, view, OUTPUT, crop);
      // A transparent PNG would turn black as a JPEG; put white behind it.
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#fff'; context.fillRect(0, 0, OUTPUT, OUTPUT);
      onSaved(await uploadProfilePhoto(canvas.toDataURL('image/jpeg', 0.88)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกรูปไม่สำเร็จ กรุณาลองใหม่'); setBusy(null); }
  }
  async function remove() {
    setBusy('remove'); setError('');
    try { onSaved(await deleteProfilePhoto()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ลบรูปไม่สำเร็จ'); setBusy(null); }
  }

  // Dragging with one finger or the mouse moves the photo; two fingers zoom.
  function down(event: PointerEvent<HTMLDivElement>) {
    if (!loaded || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom };
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(event.pointerId);
    if (!last || !loaded) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const start = pinch.current;
      setCrop(previous => zoomTo(previous, start.zoom * distance / Math.max(1, start.distance), loaded.width, loaded.height, view));
    } else if (pointers.current.size === 1) {
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      setCrop(previous => fit({ ...previous, x: previous.x + dx, y: previous.y + dy }));
    }
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }
  function wheel(event: WheelEvent<HTMLDivElement>) {
    if (!loaded) return;
    setCrop(previous => zoomTo(previous, previous.zoom * Math.exp(-event.deltaY * 0.0015), loaded.width, loaded.height, view));
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (!loaded) return;
    const step = event.shiftKey ? 30 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) { event.preventDefault(); const [dx, dy] = moves[event.key]; setCrop(previous => fit({ ...previous, x: previous.x + dx, y: previous.y + dy })); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); setCrop(previous => zoomTo(previous, previous.zoom + 0.2, loaded.width, loaded.height, view)); }
    else if (event.key === '-') { event.preventDefault(); setCrop(previous => zoomTo(previous, previous.zoom - 0.2, loaded.width, loaded.height, view)); }
  }
  const setZoom = (zoom: number) => loaded && setCrop(previous => zoomTo(previous, zoom, loaded.width, loaded.height, view));

  return <div className="pe-backdrop" onClick={close}>
    <div className="pe-sheet" role="dialog" aria-modal="true" aria-labelledby="pe-title" tabIndex={-1} ref={dialogRef} onClick={event => event.stopPropagation()}>
      <header className="pe-head">
        <h2 id="pe-title">{loaded ? 'จัดรูปให้พอดีวงกลม' : 'รูปโปรไฟล์'}</h2>
        <button type="button" className="pe-close" onClick={close} disabled={!!busy} aria-label="ปิด"><X size={20}/></button>
      </header>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => void choose(event.target.files?.[0])}/>

      {!loaded ? <div className="pe-start">
        <span className="pe-current" aria-hidden="true"><Avatar name={user.fullName} photoId={user.photoId}/></span>
        <p>{hintFor(user.role)}</p>
        {error && <div className="pf-alert bad" role="alert"><XCircle size={17}/><span>{error}</span></div>}
        <div className="pe-actions">
          <button type="button" className="pf-button" onClick={() => fileRef.current?.click()} disabled={opening || !!busy}>
            {opening ? <Loader2 size={18} className="ui-spin"/> : <Camera size={18}/>}{opening ? 'กำลังเปิดรูป…' : user.photoId ? 'เปลี่ยนรูป' : 'เลือกรูป'}</button>
          {user.photoId && <button type="button" className="pf-button ghost danger" onClick={() => void remove()} disabled={!!busy}>
            {busy === 'remove' ? <Loader2 size={18} className="ui-spin"/> : <Trash2 size={18}/>}{busy === 'remove' ? 'กำลังลบ…' : 'ลบรูป'}</button>}
        </div>
        <p className="pf-fine">ถ่ายใหม่หรือเลือกจากคลังรูปก็ได้ ระบบจะย่อรูปให้เหลือขนาดเล็กก่อนส่ง</p>
      </div> : <div className="pe-edit">
        <div className="pe-frame" ref={frameRef}>
          <div className="pe-stage" style={{ width: view, height: view }} tabIndex={0} role="application"
            aria-label="ตำแหน่งรูป ลากหรือใช้ปุ่มลูกศรเพื่อเลื่อน ปุ่มบวกและลบเพื่อซูม"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onKeyDown={key}>
            <canvas ref={canvasRef} style={{ width: view, height: view }} aria-hidden="true"/>
            <span className="pe-ring" aria-hidden="true"/>
          </div>
        </div>
        <div className="pe-tools">
          <button type="button" className="pe-icon" onClick={() => setZoom(crop.zoom - 0.25)} disabled={crop.zoom <= 1} aria-label="ซูมออก"><Minus size={18}/></button>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} aria-label="ซูม" onChange={event => setZoom(Number(event.target.value))}
            style={{ '--pe-fill': `${((crop.zoom - 1) / (MAX_ZOOM - 1)) * 100}%` } as CSSProperties}/>
          <button type="button" className="pe-icon" onClick={() => setZoom(crop.zoom + 0.25)} disabled={crop.zoom >= MAX_ZOOM} aria-label="ซูมเข้า"><Plus size={18}/></button>
          <button type="button" className="pe-icon" onClick={() => setCrop(previous => turn(previous))} aria-label="หมุนรูป 90 องศา"><RotateCw size={18}/></button>
        </div>
        <p className="pe-tip">ลากเพื่อเลื่อนรูป · ใช้สองนิ้วหรือแถบด้านบนเพื่อซูม</p>
        {error && <div className="pf-alert bad" role="alert"><XCircle size={17}/><span>{error}</span></div>}
        <div className="pe-actions">
          <button type="button" className="pf-button" onClick={() => void save()} disabled={!!busy}>
            {busy === 'save' && <Loader2 size={18} className="ui-spin"/>}{busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกรูป'}</button>
          <button type="button" className="pf-button ghost" onClick={() => fileRef.current?.click()} disabled={!!busy}>เลือกรูปอื่น</button>
        </div>
      </div>}
    </div>
  </div>;
}
