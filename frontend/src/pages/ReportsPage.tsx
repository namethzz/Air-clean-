import { useState,type FormEvent } from 'react';
import { CheckCircle2,ClipboardCheck,Clock3,FileCheck2,Image,Plus,ShieldCheck,Wrench } from 'lucide-react';
import type { Booking,ServiceReportRecord,UserRole } from '../types';
import type { CreateServiceReportPayload } from '../lib/api';

interface Props{bookings:Booking[];reports:ServiceReportRecord[];role:UserRole;onCreateReport:(payload:CreateServiceReportPayload)=>Promise<boolean>;onApproveReport:(id:number)=>Promise<boolean>;}
const checklistLabels=[
 {key:'cleanedFilter',label:'ทำความสะอาดแผ่นกรอง'},
 {key:'cleanedCoil',label:'ทำความสะอาดคอยล์'},
 {key:'checkedDrain',label:'ตรวจท่อน้ำทิ้ง'},
 {key:'checkedCooling',label:'ตรวจการทำงานของเครื่อง'},
] as const;
function dateLabel(value:string):string{const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
export default function ReportsPage({bookings,reports,role,onCreateReport,onApproveReport}:Props){
 const [selectedId,setSelectedId]=useState<number|undefined>();
 const [showForm,setShowForm]=useState(false);
 const [targetBookingId,setTargetBookingId]=useState<number|undefined>();
 const [summary,setSummary]=useState('');
 const [cleanedFilter,setCleanedFilter]=useState(false);
 const [cleanedCoil,setCleanedCoil]=useState(false);
 const [checkedDrain,setCheckedDrain]=useState(false);
 const [checkedCooling,setCheckedCooling]=useState(false);
 const [beforePhotoUrl,setBeforePhotoUrl]=useState('');
 const [afterPhotoUrl,setAfterPhotoUrl]=useState('');
 const [submitting,setSubmitting]=useState(false);
 const [actionError,setActionError]=useState('');
 const technicianMode=role==='technician';
 const available=bookings.filter(item=>(item.status==='กำลังดำเนินการ'||item.status==='รอชำระเงิน')&&!reports.some(report=>report.bookingId===item.id));
 const active=available.find(item=>item.id===targetBookingId)||available[0];
 const selected=reports.find(item=>item.id===selectedId)||reports[0];
 const approved=reports.filter(item=>item.customerApproved).length;
 const awaiting=reports.length-approved;
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!active)return;setSubmitting(true);setActionError('');
  const ok=await onCreateReport({bookingId:active.id,summary:summary.trim(),cleanedFilter,cleanedCoil,checkedDrain,checkedCooling,beforePhotoUrl:beforePhotoUrl.trim()||undefined,afterPhotoUrl:afterPhotoUrl.trim()||undefined});
  setSubmitting(false);
  if(ok){setShowForm(false);setSummary('');setCleanedFilter(false);setCleanedCoil(false);setCheckedDrain(false);setCheckedCooling(false);setBeforePhotoUrl('');setAfterPhotoUrl('');}
  else setActionError('บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือการเชื่อมต่อแล้วลองอีกครั้ง');
 }
 async function approve(){if(!selected)return;setActionError('');const ok=await onApproveReport(selected.id);if(!ok)setActionError('ยืนยันรายงานไม่สำเร็จ กรุณาลองอีกครั้ง');}
 return <div className="page-stack">
  <div className="page-heading-row"><div><div className="eyebrow">SERVICE RECORDS</div><h1>รายงานบริการ</h1><p className="page-subtitle">ดูรายงานการทำงานและผลตรวจจากข้อมูลที่บันทึกจริง</p></div>
   {technicianMode&&<button type="button" className="primary-button" disabled={!available.length} onClick={()=>{setTargetBookingId(active?.id);setShowForm(v=>!v);}}><Plus size={17}/> บันทึกรายงาน</button>}
  </div>
  <div className="report-live-metrics">
   <div className="report-live-metric"><span className="report-live-icon"><ClipboardCheck size={19}/></span><div><small>รายงานทั้งหมด</small><strong>{reports.length}</strong></div></div>
   <div className="report-live-metric"><span className="report-live-icon"><CheckCircle2 size={19}/></span><div><small>ลูกค้ายืนยันแล้ว</small><strong>{approved}</strong></div></div>
   <div className="report-live-metric"><span className="report-live-icon"><Clock3 size={19}/></span><div><small>รอยืนยัน</small><strong>{awaiting}</strong></div></div>
  </div>
  {showForm&&technicianMode&&<section className="panel report-create-panel">
   <div className="panel-heading"><div><h2>บันทึกรายงานหน้างาน</h2><p>ระบุเฉพาะงานที่ทำและตรวจจริง</p></div><button type="button" className="icon-button" onClick={()=>setShowForm(false)} aria-label="ปิดฟอร์ม">×</button></div>
   {available.length===0?<div className="empty-state"><Wrench size={23}/><strong>ยังไม่มีงานที่บันทึกรายงานได้</strong><span>รายงานได้เมื่อสถานะงานเป็นกำลังดำเนินการหรือรอชำระเงิน</span></div>:<form className="report-create-form" onSubmit={submit}>
    <label className="form-field"><span>รายการจอง</span><select value={active?.id||''} onChange={e=>setTargetBookingId(Number(e.target.value))} required>{available.map(item=><option key={item.id} value={item.id}>{item.code+' · '+item.service+' · '+item.customer}</option>)}</select></label>
    <label className="form-field"><span>สรุปงานที่ทำ *</span><textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={4} maxLength={2000} required placeholder="ระบุงานที่ทำ ผลตรวจ และคำแนะนำสำหรับลูกค้า"/></label>
    <div className="report-check-grid">
     <label><input type="checkbox" checked={cleanedFilter} onChange={e=>setCleanedFilter(e.target.checked)}/> ทำความสะอาดแผ่นกรอง</label>
     <label><input type="checkbox" checked={cleanedCoil} onChange={e=>setCleanedCoil(e.target.checked)}/> ทำความสะอาดคอยล์</label>
     <label><input type="checkbox" checked={checkedDrain} onChange={e=>setCheckedDrain(e.target.checked)}/> ตรวจท่อน้ำทิ้ง</label>
     <label><input type="checkbox" checked={checkedCooling} onChange={e=>setCheckedCooling(e.target.checked)}/> ตรวจการทำงานของเครื่อง</label>
    </div>
    <div className="form-grid-two">
     <label className="form-field"><span>ลิงก์ภาพก่อนทำ (ถ้ามี)</span><input type="url" value={beforePhotoUrl} onChange={e=>setBeforePhotoUrl(e.target.value)} maxLength={500} placeholder="https://..."/></label>
     <label className="form-field"><span>ลิงก์ภาพหลังทำ (ถ้ามี)</span><input type="url" value={afterPhotoUrl} onChange={e=>setAfterPhotoUrl(e.target.value)} maxLength={500} placeholder="https://..."/></label>
    </div>
    <p className="report-form-note"><Image size={15}/> ตอนนี้รองรับลิงก์รูปภาพเท่านั้น ยังไม่มีพื้นที่อัปโหลดไฟล์ในระบบ</p>
    {actionError&&<div className="auth-error" role="alert">{actionError}</div>}
    <button className="primary-button" type="submit" disabled={submitting||!summary.trim()}>{submitting?'กำลังบันทึก...':'บันทึกรายงาน'}</button>
   </form>}
  </section>}
  <div className="report-live-layout">
   <section className="panel report-live-list"><div className="panel-heading"><div><h2>รายการรายงาน</h2><p>ข้อมูลที่ได้รับจาก API</p></div></div>
    {reports.length===0?<div className="empty-state"><FileCheck2 size={25}/><strong>ยังไม่มีรายงานบริการ</strong><span>เมื่อช่างบันทึกรายงาน รายการจะปรากฏที่นี่</span></div>:
    <div className="report-live-items">{reports.map(report=><button type="button" key={report.id} className={'report-live-item '+((selected?.id===report.id)?'active':'')} onClick={()=>setSelectedId(report.id)}>
      <span className="report-live-item-icon"><ClipboardCheck size={18}/></span>
      <span className="report-live-item-copy"><strong>{report.bookingCode}</strong><span>{report.summary}</span><small>{dateLabel(report.createdAt)}</small></span>
      <span className={'report-approval-pill '+(report.customerApproved?'approved':'')}>{report.customerApproved?'ยืนยันแล้ว':'รอยืนยัน'}</span>
    </button>)}</div>}
   </section>
   <section className="panel report-live-detail">
    {!selected?<div className="empty-state"><ShieldCheck size={25}/><strong>ยังไม่มีรายละเอียดรายงาน</strong><span>รายละเอียดและรายการตรวจจะปรากฏเมื่อมีรายงานจากบริการจริง</span></div>:<>
     <div className="report-live-detail-head"><div><div className="eyebrow">REPORT · {selected.bookingCode}</div><h2>{bookings.find(item=>item.id===selected.bookingId)?.service||'รายงานบริการ'}</h2><p>บันทึกเมื่อ {dateLabel(selected.createdAt)}</p></div><span className={'report-approval-pill '+(selected.customerApproved?'approved':'')}>{selected.customerApproved?'ลูกค้ายืนยันแล้ว':'รอลูกค้ายืนยัน'}</span></div>
     <div className="report-summary-text"><strong>สรุปงาน</strong><p>{selected.summary}</p></div>
     <div className="report-live-checks"><h3>รายการตรวจเช็ก</h3>{checklistLabels.map(item=><div key={item.key} className="report-live-check"><span>{item.label}</span><strong className={selected[item.key]?'checked':''}>{selected[item.key]?'บันทึกแล้ว':'ไม่ได้ระบุ'}</strong></div>)}</div>
     <div className="report-live-photos"><h3>ภาพประกอบ</h3><div>{selected.beforePhotoUrl?<a href={selected.beforePhotoUrl} target="_blank" rel="noreferrer">เปิดภาพก่อนทำ</a>:<span>ไม่มีภาพก่อนทำ</span>}{selected.afterPhotoUrl?<a href={selected.afterPhotoUrl} target="_blank" rel="noreferrer">เปิดภาพหลังทำ</a>:<span>ไม่มีภาพหลังทำ</span>}</div></div>
     {role==='customer'&&!selected.customerApproved&&<button type="button" className="primary-button full-width" onClick={()=>void approve()}><ShieldCheck size={16}/> ยืนยันรายงานบริการ</button>}
    </>}
    {actionError&&!showForm&&<div className="auth-error" role="alert">{actionError}</div>}
   </section>
  </div>
 </div>;
}
