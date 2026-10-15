import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Check, Wind, X } from 'lucide-react';
import type { AirConditioner, SavedAddress, Technician } from '../types';
import LocationPicker, { type RememberChoice } from './LocationPicker';
import { saveAddress } from '../lib/api';

export interface BookingPayload {
  service:string; unitLabel:string; propertyType:string; unitCount:number; address:string;
  date:string; time:string; price:number; latitude:number; longitude:number; airConditionerId?:number;
}
interface BookingModalProps { technicians:Technician[]; units?:AirConditioner[]; initialUnitId?:number; onClose:()=>void; onSubmit:(payload:BookingPayload)=>Promise<boolean>; }
function unitText(unit:AirConditioner):string { return [unit.label,unit.brand,unit.type].filter(Boolean).join(' · ').slice(0,180); }
function localDate() {
  const now=new Date();
  return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
const today=localDate();

export default function BookingModal({technicians,units=[],initialUnitId,onClose,onSubmit}:BookingModalProps) {
  const initialUnit=units.find(unit=>unit.id===initialUnitId);
  const [unitId,setUnitId]=useState<number|undefined>(initialUnit?.id);
  const [service,setService]=useState('ล้างแอร์มาตรฐาน');
  const [unitCount,setUnitCount]=useState(1);
  const [unitLabel,setUnitLabel]=useState(initialUnit?unitText(initialUnit):'แอร์ห้องนอน 12,000 BTU');
  function pickUnit(value:string){
    const unit=units.find(item=>String(item.id)===value);
    setUnitId(unit?.id);
    if(unit)setUnitLabel(unitText(unit));
  }
  const [place,setPlace]=useState<SavedAddress>({
    id:'new',label:'สถานที่ให้บริการ',placeType:'บ้าน',address:'',
    latitude:13.7563,longitude:100.5018,locationSelected:false,
  });
  const [remember,setRemember]=useState<RememberChoice>({on:true,label:'บ้าน'});
  const [date,setDate]=useState(today);
  const [time,setTime]=useState('10:00');
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [formError,setFormError]=useState('');
  const basePrice=technicians.length?Math.min(...technicians.map(tech=>tech.basePrice)):550;
  const propertyType=place.placeType==='บ้าน'?'บ้านเดี่ยว':place.placeType;
  const price=(basePrice*unitCount)
    +(service.includes('ตรวจเช็ก')?300*unitCount:0)
    +(service.includes('แขวน')?250*unitCount:0);
  const fullAddress=[place.address,place.building,place.floor?'ชั้น '+place.floor:'',place.room?'ห้อง '+place.room:'',place.note?'จุดสังเกต: '+place.note:''].filter(Boolean).join(' · ');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if(!place.address.trim()) { setFormError('กรุณากรอกที่อยู่ให้ครบถ้วน'); return; }
    if(!place.locationSelected) { setFormError('กรุณาปักหมุดบนแผนที่หรือใช้ตำแหน่งปัจจุบันก่อนส่งคำขอ'); return; }
    setSubmitting(true);
    const success=await onSubmit({
      service,unitLabel:unitLabel.trim(),propertyType,unitCount,address:fullAddress,
      date,time,price,latitude:place.latitude,longitude:place.longitude,airConditionerId:unitId,
    });
    setSubmitting(false);
    if(success){
      setSubmitted(true);
      // Keep a new or edited place for next time; a failure here must not undo the request.
      if(remember.on)void saveAddress({...place,label:remember.label.trim()||(place.building?.trim()||place.placeType)}).catch(()=>undefined);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="modal-card booking-modal-wide" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
      <div className="modal-header">
        <div><span className="eyebrow">NEW SERVICE REQUEST</span><h2 id="booking-modal-title">ขอช่างล้างแอร์</h2><p>ส่งรายละเอียดงาน แล้วเลือกช่างจากคนที่สนใจรับงานของคุณ</p></div>
        <button className="icon-button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={19}/></button>
      </div>
      {submitted ? <div className="success-state">
        <div className="success-icon"><Check size={26}/></div><h3>ส่งคำขอแล้ว</h3>
        <p>เมื่อช่างใกล้เคียงเสนอราคา ข้อเสนอจะแสดงในหน้า “งานของฉัน” ให้คุณเปรียบเทียบก่อนเลือกช่าง</p>
        <button className="primary-button" onClick={onClose}>ดูงานของฉัน <ArrowRight size={16}/></button>
      </div> : <form onSubmit={submit} className="booking-form">
        <div className="form-section-label"><span>01</span> สถานที่ให้บริการ</div>
        <LocationPicker value={place} onChange={setPlace} remember={remember} onRememberChange={setRemember}/>
        <div className="form-section-label"><span>02</span> รายละเอียดงาน</div>
        <div className="form-grid-two">
          <label className="form-field"><span>ประเภทบริการ</span><select value={service} onChange={event=>setService(event.target.value)}><option>ล้างแอร์มาตรฐาน</option><option>ล้างแอร์ + ตรวจเช็ก</option><option>ล้างแอร์แบบแขวน</option></select></label>
          <label className="form-field"><span>จำนวนเครื่อง</span><input type="number" min={1} max={30} step={1} value={unitCount} onChange={event=>setUnitCount(Math.max(1,Math.min(30,Number(event.target.value)||1)))} required/></label>
        </div>
        {units.length>0&&<label className="form-field"><span>เครื่องจากสมุดประวัติ (ไม่บังคับ)</span><select value={unitId??''} onChange={event=>pickUnit(event.target.value)}><option value="">ไม่ระบุเครื่อง</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unitText(unit)}</option>)}</select></label>}
        <label className="form-field"><span>รายละเอียดเครื่อง</span><input value={unitLabel} onChange={event=>setUnitLabel(event.target.value)} required maxLength={180} placeholder="เช่น แอร์ห้องนอน 12,000 BTU หรือแอร์ห้องนั่งเล่น 18,000 BTU"/></label>
        <div className="form-grid-two">
          <label className="form-field"><span>วันที่สะดวก</span><div className="input-with-icon"><CalendarDays size={16}/><input type="date" min={today} value={date} onChange={event=>setDate(event.target.value)} required/></div></label>
          <label className="form-field"><span>เวลา</span><select value={time} onChange={event=>setTime(event.target.value)}><option>09:00</option><option>10:00</option><option>11:00</option><option>13:00</option><option>14:00</option><option>15:00</option></select></label>
        </div>
        <div className="marketplace-estimate">
          <div><span>ราคาเริ่มต้นโดยประมาณ</span><strong>฿{price.toLocaleString()}</strong></div>
          <small><Wind size={14}/> ยังไม่ใช่ราคาสุดท้าย คุณจะเห็นราคาที่ช่างแต่ละคนเสนอและเลือกยืนยันเอง · เก็บเงินปลายทางเมื่อล้างเสร็จ ไม่ต้องจ่ายล่วงหน้า</small>
        </div>
        {formError&&<div className="auth-error" role="alert">{formError}</div>}
        <button type="submit" className="primary-button full-width" disabled={submitting}>{submitting?'กำลังส่งคำขอ...':'ส่งคำขอให้ช่างใกล้เคียง'} <ArrowRight size={17}/></button>
      </form>}
    </section>
  </div>;
}