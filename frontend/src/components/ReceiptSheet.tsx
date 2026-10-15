import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Building2, FileText, Loader2, Printer, UserRound, X } from 'lucide-react';
import type { Billing, Receipt } from '../types';
import { fetchReceipt, issueReceipt } from '../lib/api';
import { bahtText } from '../lib/bahtText';

interface Props { bookingId: number; canIssue: boolean; companyFirst?: boolean; onClose: () => void; }

const money = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (value?: string | null) => value ? new Date(value.length === 10 ? value + 'T00:00:00' : value).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

/**
 * A job's receipt. The customer chooses once who it is made out to (themselves or a company with a tax ID),
 * then it gets a number and stays the same; anyone on the job can open and print it (or save it as a PDF).
 */
export default function ReceiptSheet({ bookingId, canIssue, companyFirst = false, onClose }: Props) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetchReceipt(bookingId).then(setReceipt).catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดใบเสร็จไม่สำเร็จ')); }, [bookingId]);
  useEffect(() => {
    document.body.classList.add('receipt-open');
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.body.classList.remove('receipt-open'); document.removeEventListener('keydown', key); };
  }, [onClose]);

  return createPortal(<div className="rc-backdrop" role="dialog" aria-modal="true" aria-label="ใบเสร็จรับเงิน">
    <div className="rc-shell">
      <header className="rc-bar">
        <strong><FileText size={18}/> ใบเสร็จรับเงิน</strong>
        <div>
          {receipt?.issued && <button type="button" className="cj-primary" onClick={() => window.print()}><Printer size={17}/> พิมพ์ / บันทึก PDF</button>}
          <button type="button" className="rc-close" onClick={onClose} aria-label="ปิด"><X size={20}/></button>
        </div>
      </header>
      {error && <p className="jp-error" role="alert">{error}</p>}
      {!receipt && !error && <p className="rc-loading"><Loader2 size={22} className="lp-spin"/> กำลังโหลด…</p>}
      {receipt && !receipt.issued && (canIssue
        ? <PayerForm receipt={receipt} companyFirst={companyFirst} onIssue={async (payer, remember) => setReceipt(await issueReceipt(bookingId, payer, remember))}/>
        : <p className="rc-note">ลูกค้ายังไม่ได้ออกใบเสร็จสำหรับงานนี้</p>)}
      {receipt?.issued && <ReceiptDocument receipt={receipt}/>}
    </div>
  </div>, document.body);
}

function PayerForm({ receipt, companyFirst, onIssue }: { receipt: Receipt; companyFirst: boolean; onIssue: (payer: Billing, remember: boolean) => Promise<void> }) {
  const saved = receipt.savedBilling;
  const [company, setCompany] = useState(Boolean(saved?.taxId) || (companyFirst && !saved));
  const [name, setName] = useState(saved?.name ?? (companyFirst ? '' : receipt.payer.name));
  const [taxId, setTaxId] = useState(saved?.taxId ?? '');
  const [headOffice, setHeadOffice] = useState(!saved?.branch || saved.branch === 'สำนักงานใหญ่');
  const [branch, setBranch] = useState(saved?.branch && saved.branch !== 'สำนักงานใหญ่' ? saved.branch : '');
  const [address, setAddress] = useState(saved?.address ?? '');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const taxOk = !company || /^\d{13}$/.test(taxId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError(company ? 'กรอกชื่อบริษัท / นิติบุคคล' : 'กรอกชื่อผู้รับใบเสร็จ'); return; }
    if (!taxOk) { setError('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก'); return; }
    setBusy(true); setError('');
    try {
      await onIssue({ name: name.trim(), taxId: company ? taxId : null, branch: company ? (headOffice ? 'สำนักงานใหญ่' : branch.trim() || null) : null, address: address.trim() || null }, remember);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ออกใบเสร็จไม่สำเร็จ'); setBusy(false); }
  }

  return <form className="rc-form" onSubmit={submit}>
    <h2>ออกใบเสร็จในนาม</h2>
    <div className="rc-kind" role="radiogroup" aria-label="ออกใบเสร็จในนาม">
      <button type="button" role="radio" aria-checked={!company} className={!company ? 'active' : ''} onClick={() => { setCompany(false); if (!name) setName(receipt.payer.name); }}><UserRound size={20}/><span><strong>บุคคล</strong><small>ชื่อของคุณ</small></span></button>
      <button type="button" role="radio" aria-checked={company} className={company ? 'active' : ''} onClick={() => setCompany(true)}><Building2 size={20}/><span><strong>บริษัท / นิติบุคคล</strong><small>มีเลขผู้เสียภาษี</small></span></button>
    </div>
    <label className="form-field"><span>{company ? 'ชื่อบริษัท / นิติบุคคล' : 'ชื่อ-นามสกุล'}</span><input value={name} onChange={event => setName(event.target.value)} maxLength={160} placeholder={company ? 'เช่น นิติบุคคลอาคารชุด เดอะ ริช' : ''}/></label>
    {company && <>
      <label className="form-field"><span>เลขประจำตัวผู้เสียภาษี (13 หลัก)</span><input inputMode="numeric" value={taxId} onChange={event => setTaxId(event.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="0105xxxxxxxxx"/>
        {taxId && !taxOk && <small className="rc-warn">อีก {13 - taxId.length} หลัก</small>}</label>
      <div className="rc-branch">
        <label className="lp-check"><input type="radio" checked={headOffice} onChange={() => setHeadOffice(true)}/> สำนักงานใหญ่</label>
        <label className="lp-check"><input type="radio" checked={!headOffice} onChange={() => setHeadOffice(false)}/> สาขา</label>
        {!headOffice && <input className="rc-branch-input" value={branch} onChange={event => setBranch(event.target.value)} placeholder="เช่น สาขาที่ 00001" maxLength={40} aria-label="สาขา"/>}
      </div>
    </>}
    <label className="form-field"><span>ที่อยู่ในใบเสร็จ {company ? '' : '(ไม่บังคับ)'}</span><textarea rows={2} value={address} onChange={event => setAddress(event.target.value)} maxLength={400} placeholder={receipt.serviceAddress}/></label>
    <label className="lp-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/> จำข้อมูลนี้ไว้ใช้ครั้งหน้า</label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button type="submit" className="cj-primary full" disabled={busy}>{busy ? 'กำลังออกใบเสร็จ…' : 'ออกใบเสร็จ'}</button>
    <p className="rc-note">ออกได้ครั้งเดียวต่องาน หลังออกแล้วข้อมูลในใบเสร็จจะไม่เปลี่ยน</p>
  </form>;
}

function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  return <article className="rc-doc">
    <header className="rc-doc-head">
      <div><span className="rc-brand">AirClean<b>.</b></span><h1>ใบเสร็จรับเงิน</h1><p>RECEIPT</p></div>
      <dl>
        <div><dt>เลขที่</dt><dd>{receipt.number}</dd></div>
        <div><dt>วันที่</dt><dd>{thaiDate(receipt.issuedAt)}</dd></div>
        <div><dt>อ้างอิงงาน</dt><dd>{receipt.bookingCode}</dd></div>
      </dl>
    </header>
    <section className="rc-parties">
      <div><h2>ผู้รับเงิน</h2><strong>{receipt.issuerName}</strong><p>ช่างผู้ให้บริการผ่าน AirClean{receipt.issuerPhone ? ` · โทร ${receipt.issuerPhone}` : ''}</p></div>
      <div><h2>ได้รับเงินจาก</h2><strong>{receipt.payer.name}</strong>
        {receipt.payer.taxId && <p>เลขประจำตัวผู้เสียภาษี {receipt.payer.taxId}{receipt.payer.branch ? ` · ${receipt.payer.branch}` : ''}</p>}
        <p>{receipt.payer.address || receipt.serviceAddress}</p></div>
    </section>
    <table className="rc-table">
      <thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th></tr></thead>
      <tbody>{receipt.lines.map((line, index) => <tr key={index}><td>{line.description}<small>วันที่ให้บริการ {thaiDate(receipt.serviceDate)}{receipt.rooms.length ? ` · ห้อง ${receipt.rooms.join(', ')}` : ''}</small></td><td>{line.quantity} เครื่อง</td><td>{money(line.unitPrice)}</td><td>{money(line.amount)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>รวมทั้งสิ้น <small>({bahtText(receipt.total)})</small></td><td>{money(receipt.total)}</td></tr></tfoot>
    </table>
    <p className="rc-paid">ชำระแล้วด้วย{receipt.paymentMethod === 'PromptPay' ? 'การโอนเงิน' : 'เงินสด'} เมื่อ {thaiDate(receipt.paidAt)}</p>
    <p className="rc-foot">สถานที่ให้บริการ: {receipt.serviceAddress}<br/>เอกสารนี้ออกผ่านระบบ AirClean ไม่ใช่ใบกำกับภาษี</p>
  </article>;
}
