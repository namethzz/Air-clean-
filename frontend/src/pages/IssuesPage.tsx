import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Ban, CheckCircle2, Clock3, Mail, MessageSquareWarning, Phone, RefreshCw, Wallet, Wrench } from 'lucide-react';
import type { AdminIssue, IssueResolution } from '../types';
import { fetchAdminIssues, resolveIssue } from '../lib/api';

interface Props { onNotice: (message: string) => void; onChanged: () => void; }
type Tab = 'open' | 'resolved';
type Action = 'paid' | 'cancel' | 'close';

function when(value?: string | null) {
  return value ? new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}
function errorText(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
const resolutionLabel: Record<IssueResolution, string> = { Paid: 'ปิดงานว่าชำระแล้ว', Cancelled: 'ยกเลิกงาน', Closed: 'ปิดเรื่องแล้ว' };

/** Admin queue of reported problems: payment disputes that hold a job open, and customer reports after a job. */
export default function IssuesPage({ onNotice, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('open');
  const [rows, setRows] = useState<AdminIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (which: Tab) => {
    setLoading(true); setError('');
    try { setRows(await fetchAdminIssues(which)); }
    catch (reason) { setError(errorText(reason, 'โหลดเรื่องที่ถูกแจ้งไม่สำเร็จ')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(tab); }, [load, tab]);
  function resolved(bookingId: number) { setRows(previous => previous.filter(row => row.bookingId !== bookingId)); onChanged(); }

  return <div className="page-stack">
    <div className="page-heading-row">
      <div><div className="eyebrow">REPORTED ISSUES</div><h1>เรื่องที่ถูกแจ้ง</h1><p className="page-subtitle">โทรหรืออีเมลคุยกับลูกค้าและช่างก่อน แล้วปิดเรื่องตามที่ตกลงกัน ทั้งสองฝ่ายจะได้รับแจ้งผลทันที</p></div>
      <button type="button" className="outline-button" onClick={() => void load(tab)} disabled={loading}><RefreshCw size={15}/> {loading ? 'กำลังโหลด...' : 'โหลดใหม่'}</button>
    </div>
    <div className="approval-tabs" role="tablist" aria-label="สถานะเรื่อง">
      <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>รอดำเนินการ{tab === 'open' && !loading && <span>{rows.length}</span>}</button>
      <button type="button" role="tab" aria-selected={tab === 'resolved'} className={tab === 'resolved' ? 'active' : ''} onClick={() => setTab('resolved')}>ปิดแล้ว</button>
    </div>
    {error && <div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={() => void load(tab)}><RefreshCw size={15}/> ลองใหม่</button></div>}
    {!loading && !error && rows.length === 0 && <section className="panel nearby-empty"><MessageSquareWarning size={24}/><strong>{tab === 'open' ? 'ไม่มีเรื่องรอดำเนินการ' : 'ยังไม่มีเรื่องที่ปิดแล้ว'}</strong></section>}
    <div className="approval-grid">{rows.map(row => <IssueCard key={row.bookingId} row={row} onResolved={resolved} onNotice={onNotice}/>)}</div>
  </div>;
}

function Contact({ label, party }: { label: string; party: AdminIssue['customer'] }) {
  return <div><dt>{label}</dt><dd>
    <strong>{party.name || '—'}</strong>
    {party.phone && <a className="issue-contact" href={'tel:' + party.phone.replace(/[^\d+]/g, '')}><Phone size={14}/> {party.phone}</a>}
    {party.email && <a className="issue-contact" href={'mailto:' + party.email}><Mail size={14}/> {party.email}</a>}
  </dd></div>;
}

function IssueCard({ row, onResolved, onNotice }: { row: AdminIssue; onResolved: (bookingId: number) => void; onNotice: (message: string) => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState(row.paymentMethod === 'PromptPay' ? 'PromptPay' : 'Cash');
  const [busy, setBusy] = useState(false);
  const payment = row.issue.kind === 'Payment';
  const noteRequired = action !== 'paid';

  async function submit() {
    if (!action) return;
    setBusy(true);
    try {
      await resolveIssue(row.bookingId, action, note.trim() || undefined, action === 'paid' ? method : undefined);
      onNotice(action === 'paid' ? `ปิดงาน ${row.code} ว่าชำระแล้ว` : action === 'cancel' ? `ยกเลิกงาน ${row.code} แล้ว` : `ปิดเรื่องของงาน ${row.code} แล้ว`);
      onResolved(row.bookingId);
    } catch (reason) { onNotice(errorText(reason, 'ปิดเรื่องไม่สำเร็จ')); }
    finally { setBusy(false); }
  }

  return <article className="panel approval-card issue-card">
    <header>
      <div><h2>{row.code}</h2><p>{row.service} {row.unitCount} เครื่อง · ฿{row.price.toLocaleString()}</p></div>
      <span className={'approval-state ' + (row.issue.open ? 'pending' : row.issue.resolution === 'Cancelled' ? 'rejected' : 'approved')}>
        {payment ? <Wallet size={13}/> : <Wrench size={13}/>} {payment ? 'การชำระเงิน' : 'หลังงานเสร็จ'}
      </span>
    </header>
    <blockquote className="issue-reason"><span>{row.issue.reportedBy}แจ้ง · {when(row.issue.reportedAt)}</span>{row.issue.reason || '(ไม่ได้ระบุเหตุผล)'}</blockquote>
    <dl>
      <div><dt>สถานะงาน</dt><dd>{row.status}</dd></div>
      <div><dt>วันนัด</dt><dd>{when(row.scheduledAt)}</dd></div>
      <Contact label="ลูกค้า" party={row.customer}/>
      <Contact label="ช่าง" party={row.technician}/>
      {row.address && <div><dt>ที่อยู่</dt><dd>{row.address}</dd></div>}
    </dl>
    {row.history.length > 0 && <details className="issue-history"><summary>ประวัติงาน ({row.history.length})</summary><ol>
      {row.history.map((item, index) => <li key={index}><Clock3 size={13}/><span><small>{when(item.at)} · {item.status}</small>{item.notes || '—'}</span></li>)}
    </ol></details>}
    {!row.issue.open
      ? <p className="issue-result"><CheckCircle2 size={16}/><span><strong>{row.issue.resolution ? resolutionLabel[row.issue.resolution] : 'ปิดแล้ว'}</strong> · {when(row.issue.resolvedAt)}{row.issue.resolutionNote && <><br/>{row.issue.resolutionNote}</>}</span></p>
      : action
        ? <div className="approval-reject">
          <strong>{action === 'paid' ? 'ยืนยันว่าลูกค้าชำระเงินแล้ว งานจะปิดและบันทึกประวัติ' : action === 'cancel' ? 'ยกเลิกงานนี้ (ไม่มีการเก็บเงิน)' : 'ปิดเรื่องที่ลูกค้าแจ้ง'}</strong>
          {action === 'paid' && <label className="form-field"><span>ชำระด้วย</span><select value={method} onChange={event => setMethod(event.target.value)}><option value="Cash">เงินสด</option><option value="PromptPay">โอน / PromptPay</option></select></label>}
          <label className="form-field"><span>{noteRequired ? 'บันทึกว่าตกลงหรือแก้ไขอย่างไร (ทั้งสองฝ่ายจะเห็น)' : 'หมายเหตุ (ไม่บังคับ ทั้งสองฝ่ายจะเห็น)'}</span>
            <textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder={action === 'close' ? 'เช่น ช่างกลับไปแก้ท่อน้ำทิ้งให้แล้ว' : 'เช่น โทรคุยกับทั้งสองฝ่ายแล้ว ลูกค้าโอนเงินเรียบร้อย'}/></label>
          <div>
            <button type="button" className={'primary-button' + (action === 'cancel' ? ' danger' : '')} disabled={busy || (noteRequired && !note.trim())} onClick={() => void submit()}>{busy ? 'กำลังบันทึก...' : 'ยืนยัน'}</button>
            <button type="button" className="outline-button" disabled={busy} onClick={() => setAction(null)}>ย้อนกลับ</button>
          </div>
        </div>
        : <footer>
          {payment
            ? <><button type="button" className="primary-button" onClick={() => setAction('paid')}><CheckCircle2 size={15}/> ชำระแล้ว ปิดงาน</button>
              <button type="button" className="outline-button" onClick={() => setAction('cancel')}><Ban size={15}/> ยกเลิกงาน</button></>
            : <button type="button" className="primary-button" onClick={() => setAction('close')}><CheckCircle2 size={15}/> ปิดเรื่อง</button>}
        </footer>}
  </article>;
}
