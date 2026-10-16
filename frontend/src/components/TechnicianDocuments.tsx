import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, IdCard, Loader2, ScrollText, ShieldCheck, UserRoundCheck, X, XCircle } from 'lucide-react';
import type { DocumentKind, TechnicianDocument } from '../types';
import { deleteMyDocument, fetchMyDocuments, uploadMyDocument } from '../lib/api';
import { resizeForUpload } from '../lib/image';
import PrivateImage, { ImageViewer } from './PrivateImage';
import '../pages/Membership.css';
import '../pages/Profile.css';

const slots: { kind: DocumentKind; title: string; hint: string; need: string; icon: typeof IdCard; max: number }[] = [
  { kind: 'idcard', title: 'บัตรประชาชน', hint: 'ถ่ายด้านหน้า ให้เห็นชื่อและรูปชัด', need: 'จำเป็น', icon: IdCard, max: 1 },
  { kind: 'selfie', title: 'รูปคุณถือบัตร', hint: 'ถ่ายหน้าตัวเองคู่กับบัตร ช่วยให้อนุมัติเร็วขึ้น', need: 'แนะนำ', icon: UserRoundCheck, max: 1 },
  { kind: 'certificate', title: 'ใบรับรอง / ใบผ่านงาน', hint: 'ถ้ามี เช่น ใบผ่านการอบรมช่างแอร์', need: 'ไม่บังคับ', icon: ScrollText, max: 3 },
];

/**
 * The technician's identity documents for the admin's check. Only admins see them; customers never do.
 * The ID card is what approval needs; a new photo replaces the old one.
 */
export default function TechnicianDocuments({ onChange }: { onChange?: (documents: TechnicianDocument[]) => void }) {
  const [documents, setDocuments] = useState<TechnicianDocument[] | null>(null);
  const [busy, setBusy] = useState<DocumentKind | null>(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<DocumentKind, HTMLInputElement | null>>>({});
  useEffect(() => { fetchMyDocuments().then(setDocuments).catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดเอกสารไม่สำเร็จ')); }, []);
  // Held in a ref so a parent passing a new callback each render does not re-run the effect.
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => { if (documents) changed.current?.(documents); }, [documents]);

  async function add(kind: DocumentKind, file?: File) {
    if (!file) return;
    setBusy(kind); setError('');
    try {
      const saved = await uploadMyDocument(kind, await resizeForUpload(file));
      setDocuments(previous => [...(previous ?? []).filter(item => kind === 'certificate' || item.kind !== kind), saved]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ส่งรูปไม่สำเร็จ'); }
    finally { setBusy(null); if (inputs.current[kind]) inputs.current[kind]!.value = ''; }
  }
  async function remove(id: string) {
    try { await deleteMyDocument(id); setDocuments(previous => (previous ?? []).filter(item => item.id !== id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ลบรูปไม่สำเร็จ'); }
  }

  const missingId = documents !== null && !documents.some(item => item.kind === 'idcard');
  return <section className="pf-card td-panel" aria-labelledby="td-title">
    <header className="pf-card-head">
      <h2 id="td-title">เอกสารยืนยันตัวตน</h2>
      <p className="td-private"><ShieldCheck size={15}/> ผู้ดูแลระบบเท่านั้นที่เห็นรูปเหล่านี้ ลูกค้าไม่เห็น</p>
    </header>
    {missingId && <div className="pf-alert warn" role="status"><IdCard size={17}/><span>ส่งรูปบัตรประชาชนก่อน ผู้ดูแลจึงอนุมัติบัญชีได้</span></div>}
    {error && <div className="pf-alert bad" role="alert"><XCircle size={17}/><span>{error}</span></div>}
    {!documents ? !error && <p className="td-loading"><Loader2 size={18} className="lp-spin"/> กำลังโหลด…</p> :
    <ul className="td-slots">{slots.map(slot => {
      const have = documents.filter(item => item.kind === slot.kind);
      const Icon = slot.icon;
      const full = have.length >= slot.max;
      const needed = slot.kind === 'idcard' && !have.length;
      return <li key={slot.kind} className={'td-slot' + (have.length ? ' done' : '') + (needed ? ' needed' : '')}>
        <span className="td-icon" aria-hidden="true">{have.length ? <CheckCircle2 size={20}/> : <Icon size={20}/>}</span>
        <div className="td-slot-text">
          <strong>{slot.title}</strong>
          <span>{have.length ? (slot.max > 1 ? `ส่งแล้ว ${have.length} รูป` : 'ส่งแล้ว') : slot.need} · {slot.hint}</span>
        </div>
        <div className="td-slot-files">
          {have.map(item => <figure key={item.id} className="td-file">
            <PrivateImage path={'/technician-documents/' + item.id} alt={slot.title} onOpen={setViewing}/>
            {slot.kind === 'certificate' && <button type="button" className="td-remove" onClick={() => void remove(item.id)} aria-label={`ลบ${slot.title}`}><X size={13}/></button>}
          </figure>)}
          {(!full || slot.max === 1) && <label className={'td-add' + (busy === slot.kind ? ' busy' : '') + (have.length ? '' : ' first')}>
            <input ref={node => { inputs.current[slot.kind] = node; }} type="file" accept="image/*" disabled={busy !== null} onChange={event => void add(slot.kind, event.target.files?.[0])}/>
            {busy === slot.kind ? <Loader2 size={18} className="lp-spin"/> : <Camera size={18}/>}
            <span>{busy === slot.kind ? 'กำลังส่ง…' : have.length && slot.max === 1 ? 'ถ่ายใหม่' : have.length ? 'เพิ่มรูป' : 'ถ่าย / เลือกรูป'}</span>
          </label>}
        </div>
      </li>;
    })}</ul>}
    {viewing && <ImageViewer url={viewing} alt="เอกสาร" onClose={() => setViewing(null)}/>}
  </section>;
}
