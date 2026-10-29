import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, FileText, Loader2, Printer, UserRound, X } from 'lucide-react';
import type { Billing, Receipt } from '../../types';
import { fetchReceipt, issueReceipt } from '../../lib/api';
import { bahtText } from '../../lib/bahtText';
import { Problem } from '../kit';
import './Receipt.css';

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
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => { fetchReceipt(bookingId).then(setReceipt).catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดใบเสร็จไม่สำเร็จ')); }, [bookingId]);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('receipt-open');
    box.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    return () => { document.body.classList.remove('receipt-open'); document.removeEventListener('keydown', key); before?.focus({ preventScroll: true }); };
  }, []);

  // Opens outside the app frame so printing can hide everything else; it carries its own type and focus ring.
  return createPortal(<div className="rt-backdrop" role="dialog" aria-modal="true" aria-label="ใบเสร็จรับเงิน">
    <div className="rt-shell" ref={box} tabIndex={-1}>
      <header className="rt-bar">
        <strong><FileText size={20} aria-hidden="true"/> ใบเสร็จรับเงิน</strong>
        <div>
          {receipt?.issued && <button type="button" className="ui-btn is-primary is-sm" onClick={() => window.print()}><Printer size={17}/> พิมพ์ / บันทึก PDF</button>}
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="ปิด"><X size={20}/></button>
        </div>
      </header>
      {error && <div className="rt-body"><Problem>{error}</Problem></div>}
      {!receipt && !error && <p className="rt-loading" role="status"><Loader2 size={22} className="ui-spin" aria-hidden="true"/> กำลังโหลด…</p>}
      {receipt && !receipt.issued && (canIssue
        ? <PayerForm receipt={receipt} companyFirst={companyFirst} onIssue={async (payer, remember) => setReceipt(await issueReceipt(bookingId, payer, remember))}/>
        : <p className="rt-loading">ลูกค้ายังไม่ได้ออกใบเสร็จสำหรับงานนี้</p>)}
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
  const id = useId();
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

  return <form className="rt-form" onSubmit={submit} noValidate>
    <div className="rt-form-head">
      <h2>ออกใบเสร็จในนาม</h2>
      <p>ออกได้ครั้งเดียวต่องาน หลังออกแล้วข้อมูลในใบเสร็จจะไม่เปลี่ยน</p>
    </div>
    <div className="rt-kind" role="radiogroup" aria-label="ออกใบเสร็จในนาม">
      <button type="button" role="radio" aria-checked={!company} className="ui-option" onClick={() => { setCompany(false); if (!name) setName(receipt.payer.name); }}>
        <UserRound size={22} aria-hidden="true"/><span className="ui-option-text"><strong>บุคคล</strong><small>ชื่อของคุณ</small></span>
      </button>
      <button type="button" role="radio" aria-checked={company} className="ui-option" onClick={() => setCompany(true)}>
        <Building2 size={22} aria-hidden="true"/><span className="ui-option-text"><strong>บริษัท / นิติบุคคล</strong><small>มีเลขผู้เสียภาษี</small></span>
      </button>
    </div>
    <div className="ui-field"><label htmlFor={id + 'name'}>{company ? 'ชื่อบริษัท / นิติบุคคล' : 'ชื่อ-นามสกุล'}</label>
      <input id={id + 'name'} className="ui-input" value={name} onChange={event => setName(event.target.value)} maxLength={160} placeholder={company ? 'เช่น นิติบุคคลอาคารชุด เดอะ ริช' : ''} autoComplete={company ? 'organization' : 'name'}/></div>
    {company && <>
      <div className="ui-field"><label htmlFor={id + 'tax'}>เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
        <input id={id + 'tax'} className="ui-input ui-num rt-tax" inputMode="numeric" value={taxId} onChange={event => setTaxId(event.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="0105xxxxxxxxx" aria-invalid={Boolean(taxId) && !taxOk}/>
        {taxId && !taxOk ? <small>อีก {13 - taxId.length} หลัก</small> : taxId && <small className="rt-ok"><Check size={14} strokeWidth={3} aria-hidden="true"/> ครบ 13 หลัก</small>}</div>
      <fieldset className="rt-branch">
        <legend>สำนักงาน</legend>
        <label className="ui-check"><input type="radio" name={id + 'branch'} checked={headOffice} onChange={() => setHeadOffice(true)}/> สำนักงานใหญ่</label>
        <label className="ui-check"><input type="radio" name={id + 'branch'} checked={!headOffice} onChange={() => setHeadOffice(false)}/> สาขา</label>
        {!headOffice && <input className="ui-input rt-branch-input" value={branch} onChange={event => setBranch(event.target.value)} placeholder="เช่น สาขาที่ 00001" maxLength={40} aria-label="สาขา"/>}
      </fieldset>
    </>}
    <div className="ui-field"><label htmlFor={id + 'address'}>ที่อยู่ในใบเสร็จ {company ? '' : <em>(ไม่บังคับ)</em>}</label>
      <textarea id={id + 'address'} className="ui-textarea" rows={2} value={address} onChange={event => setAddress(event.target.value)} maxLength={400} placeholder={receipt.serviceAddress}/></div>
    <label className="ui-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/> จำข้อมูลนี้ไว้ใช้ครั้งหน้า</label>
    {error && <Problem>{error}</Problem>}
    <button type="submit" className="ui-btn is-primary is-lg is-block" disabled={busy} aria-busy={busy}>{busy ? 'กำลังออกใบเสร็จ…' : 'ออกใบเสร็จ'}</button>
  </form>;
}

function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  return <article className="rt-doc">
    <header className="rt-doc-head">
      <div><span className="rt-brand">AirClean<b>.</b></span><h1>ใบเสร็จรับเงิน</h1><p>RECEIPT</p></div>
      <dl>
        <div><dt>เลขที่</dt><dd>{receipt.number}</dd></div>
        <div><dt>วันที่</dt><dd>{thaiDate(receipt.issuedAt)}</dd></div>
        <div><dt>อ้างอิงงาน</dt><dd>{receipt.bookingCode}</dd></div>
      </dl>
    </header>
    <section className="rt-parties">
      <div><h2>ผู้รับเงิน</h2><strong>{receipt.issuerName}</strong><p>ช่างผู้ให้บริการผ่าน AirClean{receipt.issuerPhone ? ` · โทร ${receipt.issuerPhone}` : ''}</p></div>
      <div><h2>ได้รับเงินจาก</h2><strong>{receipt.payer.name}</strong>
        {receipt.payer.taxId && <p>เลขประจำตัวผู้เสียภาษี {receipt.payer.taxId}{receipt.payer.branch ? ` · ${receipt.payer.branch}` : ''}</p>}
        <p>{receipt.payer.address || receipt.serviceAddress}</p></div>
    </section>
    <table className="rt-table">
      <thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th></tr></thead>
      <tbody>{receipt.lines.map((line, index) => <tr key={index}><td>{line.description}<small>วันที่ให้บริการ {thaiDate(receipt.serviceDate)}{receipt.rooms.length ? ` · ห้อง ${receipt.rooms.join(', ')}` : ''}</small></td><td>{line.quantity} เครื่อง</td><td>{money(line.unitPrice)}</td><td>{money(line.amount)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>รวมทั้งสิ้น <small>({bahtText(receipt.total)})</small></td><td>{money(receipt.total)}</td></tr></tfoot>
    </table>
    <p className="rt-paid">ชำระแล้วด้วย{receipt.paymentMethod === 'PromptPay' ? 'การโอนเงิน' : 'เงินสด'} เมื่อ {thaiDate(receipt.paidAt)}</p>
    <p className="rt-foot">สถานที่ให้บริการ: {receipt.serviceAddress}<br/>เอกสารนี้ออกผ่านระบบ AirClean ไม่ใช่ใบกำกับภาษี</p>
  </article>;
}
