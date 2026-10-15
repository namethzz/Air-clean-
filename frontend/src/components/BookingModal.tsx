import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Minus, Plus, Wind, X } from 'lucide-react';
import type { AirConditioner, Booking, SavedAddress, Technician, UserRole } from '../types';
import LocationPicker, { type RememberChoice } from './LocationPicker';
import { RoomPicker } from './Rooms';
import { dueRooms, lastCleaned } from '../lib/rooms';
import VisitTimePicker, { defaultVisit, visitPayload, type Visit } from './VisitTimePicker';
import { saveAddress } from '../lib/api';

export interface BookingPayload {
  service:string; unitLabel:string; propertyType:string; unitCount:number; address:string;
  date:string; time:string; timeWindow?:string; price:number; latitude:number; longitude:number; airConditionerId?:number;
  notes?:string; placeId?:number; rooms?:string[];
}
interface BookingModalProps { technicians:Technician[]; units?:AirConditioner[]; initialUnitId?:number; role?:UserRole; initialPlaceId?:string; initialRooms?:string[]; bookings?:Booking[]; onClose:()=>void; onSubmit:(payload:BookingPayload)=>Promise<boolean>; }
function unitText(unit:AirConditioner):string { return [unit.label,unit.brand,unit.type].filter(Boolean).join(' · ').slice(0,180); }

/** What a customer can tell by looking at the unit. Hanging and ceiling units take longer, so they cost more. */
const acTypes=[
  {key:'wall',label:'ติดผนัง',hint:'แบบที่พบบ่อยที่สุด',service:'ล้างแอร์มาตรฐาน'},
  {key:'hanging',label:'แขวนใต้ฝ้า / ตั้งพื้น',hint:'ตัวใหญ่ ลมออกด้านหน้า',service:'ล้างแอร์แบบแขวน'},
  {key:'cassette',label:'ฝังฝ้า 4 ทิศทาง',hint:'อยู่ในฝ้า ลมออก 4 ด้าน',service:'ล้างแอร์แบบแขวน (ฝังฝ้า)'},
] as const;
type AcType=typeof acTypes[number]['key'];
const sizes=[{key:'',label:'ไม่ทราบ'},{key:'9,000–12,000 BTU',label:'ห้องนอน (9,000–12,000)'},{key:'18,000–24,000 BTU',label:'ห้องใหญ่ (18,000–24,000)'},{key:'มากกว่า 24,000 BTU',label:'มากกว่า 24,000'}];
const brands=['Daikin','Mitsubishi','Carrier','Panasonic','Samsung','LG','Haier','Sharp','Saijo Denki','Central Air'];

function AcIcon({kind}:{kind:AcType}){
  // Simple drawings so people can match what is on their wall or ceiling.
  return <svg className="bk-type-icon" viewBox="0 0 64 40" aria-hidden="true">
    {kind==='wall'&&<><rect x="6" y="10" width="52" height="18" rx="5"/><path d="M12 23h40"/></>}
    {kind==='hanging'&&<><path d="M4 6h56"/><rect x="8" y="9" width="48" height="20" rx="4"/><path d="M14 24h36M14 19h36"/></>}
    {kind==='cassette'&&<><path d="M4 8h56"/><rect x="14" y="8" width="36" height="20" rx="2"/><rect x="22" y="13" width="20" height="10" rx="1"/></>}
  </svg>;
}

export default function BookingModal({technicians,units=[],initialUnitId,role,initialPlaceId,initialRooms,bookings=[],onClose,onSubmit}:BookingModalProps) {
  const manager=role==='manager';
  // Homes book up to 30 units; building managers book whole buildings.
  const maxUnits=manager?300:30;
  const initialUnit=units.find(unit=>unit.id===initialUnitId);
  const [unitId,setUnitId]=useState<number|undefined>(initialUnit?.id);
  const [acType,setAcType]=useState<AcType>('wall');
  const [size,setSize]=useState('');
  const [brand,setBrand]=useState('');
  const [checkUp,setCheckUp]=useState(false);
  const [unitNote,setUnitNote]=useState('');
  // Held as text so the field can be emptied while typing; it becomes a number within the limit on leaving it.
  const [countText,setCountText]=useState('1');
  const typedCount=Math.max(1,Math.min(maxUnits,Number.parseInt(countText,10)||1));
  const [details,setDetails]=useState('');
  const service=acTypes.find(item=>item.key===acType)!.service+(checkUp?' + ตรวจเช็ก':'');
  const chosenUnit=units.find(unit=>unit.id===unitId);
  // What the technician sees about the units, built from the choices above.
  const unitLabel=[
    chosenUnit?chosenUnit.label:'',
    acTypes.find(item=>item.key===acType)!.label,brand,size,unitNote.trim()?'หมายเหตุ: '+unitNote.trim():'',
  ].filter(Boolean).join(' · ').slice(0,180);
  function pickUnit(value:string){
    const unit=units.find(item=>String(item.id)===value);
    setUnitId(unit?.id);
  }
  const [place,setPlace]=useState<SavedAddress>({
    id:'new',label:'สถานที่ให้บริการ',placeType:manager?'คอนโด':'บ้าน',address:'',
    latitude:13.7563,longitude:100.5018,locationSelected:false,
  });
  const [remember,setRemember]=useState<RememberChoice>({on:true,label:manager?'':'บ้าน'});
  // Picking a building fills in how many units it has; the manager can still change it.
  useEffect(()=>{if(manager&&place.unitCount)setCountText(String(Math.min(place.unitCount,maxUnits)));},[place.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Buildings with a room list are booked by room: the rooms asked for (rooms due), otherwise all of them.
  const roster=manager?place.rooms??[]:[];
  const [selectedRooms,setSelectedRooms]=useState<string[]>([]);
  const firstPlace=useRef(true);
  useEffect(()=>{
    const fromLink=firstPlace.current&&place.id===initialPlaceId&&initialRooms?.length;
    if(place.id!=='new')firstPlace.current=false;
    setSelectedRooms(fromLink?initialRooms!:roster.map(room=>room.name));
  },[place.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dueNames=useMemo(()=>roster.length&&place.id!=='new'?dueRooms(roster,lastCleaned(place.id,bookings)).map(room=>room.name):[],[roster,place.id,bookings]);
  const unitCount=roster.length?Math.max(1,roster.filter(room=>selectedRooms.includes(room.name)).reduce((sum,room)=>sum+room.units,0)):typedCount;
  const [visit,setVisit]=useState<Visit>(defaultVisit);
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
    if(roster.length&&!selectedRooms.length) { setFormError('เลือกห้องที่จะล้างอย่างน้อย 1 ห้อง'); return; }
    const when=visitPayload(visit);
    if(!when) { setFormError('กรุณาเลือกวันและเวลาที่ช่างมาได้'); return; }
    setSubmitting(true);
    // Keep a new or edited place first, so the job is linked to it (a building's history); a failure here must not stop the request.
    let placeId=place.id!=='new'?Number(place.id):undefined;
    if(remember.on){
      const saved=await saveAddress({...place,label:remember.label.trim()||(place.building?.trim()||place.placeType)}).catch(()=>null);
      if(saved)placeId=Number(saved.id);
    }
    const contact=[place.contactName?.trim(),place.contactPhone?.trim()].filter(Boolean).join(' โทร ');
    const notes=[contact?'ผู้ติดต่อหน้างาน: '+contact:'',details.trim()].filter(Boolean).join('\n')||undefined;
    const success=await onSubmit({
      service,unitLabel:unitLabel.trim(),propertyType,unitCount,address:fullAddress,
      date:visit.date,time:when.time,timeWindow:when.timeWindow,price,latitude:place.latitude,longitude:place.longitude,airConditionerId:unitId,
      notes,placeId:Number.isFinite(placeId)?placeId:undefined,rooms:roster.length?selectedRooms:undefined,
    });
    setSubmitting(false);
    if(success)setSubmitted(true);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="modal-card booking-modal-wide" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
      <div className="modal-header">
        <div><span className="eyebrow">NEW SERVICE REQUEST</span><h2 id="booking-modal-title">{manager?'ขอช่างล้างแอร์ในอาคาร':'ขอช่างล้างแอร์'}</h2><p>ส่งรายละเอียดงาน แล้วเลือกช่างจากคนที่สนใจรับงานของคุณ</p></div>
        <button className="icon-button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={19}/></button>
      </div>
      {submitted ? <div className="success-state">
        <div className="success-icon"><Check size={26}/></div><h3>ส่งคำขอแล้ว</h3>
        <p>เมื่อช่างใกล้เคียงเสนอราคา ข้อเสนอจะแสดงในหน้า “{manager?'งานของอาคาร':'งานของฉัน'}” ให้คุณเปรียบเทียบก่อนเลือกช่าง</p>
        <button className="primary-button" onClick={onClose}>{manager?'ดูงานของอาคาร':'ดูงานของฉัน'} <ArrowRight size={16}/></button>
      </div> : <form onSubmit={submit} className="booking-form">
        <div className="form-section-label"><span>01</span> สถานที่ให้บริการ</div>
        <LocationPicker value={place} onChange={setPlace} remember={remember} onRememberChange={setRemember} forBuilding={manager} preferId={initialPlaceId}/>
        <div className="form-section-label"><span>02</span> วันและเวลาที่สะดวก</div>
        <VisitTimePicker value={visit} onChange={setVisit}/>
        <div className="form-section-label"><span>03</span> {manager?'ห้องและแอร์':'แอร์ที่จะล้าง'}</div>
        {roster.length>0
          ?<div className="bk-field">
            <span className="bk-label">ห้องที่จะล้าง</span>
            <RoomPicker rooms={roster} selected={selectedRooms} onChange={setSelectedRooms} due={dueNames}/>
          </div>
          :<>
        <div className="bk-field">
          <span className="bk-label" id="bk-count-label">จำนวนแอร์ที่จะล้าง</span>
          <div className="bk-stepper" role="group" aria-labelledby="bk-count-label">
            <button type="button" aria-label="ลดจำนวน" disabled={unitCount<=1} onClick={()=>setCountText(String(unitCount-1))}><Minus size={20}/></button>
            <input inputMode="numeric" pattern="[0-9]*" aria-label="จำนวนเครื่อง" value={countText} onChange={event=>setCountText(event.target.value.replace(/[^0-9]/g,'').slice(0,3))} onBlur={()=>setCountText(String(unitCount))} onFocus={event=>event.currentTarget.select()}/>
            <button type="button" aria-label="เพิ่มจำนวน" disabled={unitCount>=maxUnits} onClick={()=>setCountText(String(unitCount+1))}><Plus size={20}/></button>
            <span className="bk-stepper-unit">เครื่อง</span>
          </div>
          {manager&&<small className="bk-hint">จองได้สูงสุด {maxUnits} เครื่องต่อครั้ง ถ้ามีแอร์หลายแบบ เลือกแบบที่มีมากที่สุด แล้วบอกช่างในรายละเอียดด้านล่าง</small>}
        </div>
          {manager&&place.id!=='new'&&<small className="bk-hint">เพิ่มรายการห้องที่หน้า “อาคารของฉัน” เพื่อเลือกห้องและติดตามรายห้องได้</small>}
          </>}
        <div className="bk-field">
          <span className="bk-label" id="bk-type-label">แอร์เป็นแบบไหน</span>
          <div className="bk-types" role="radiogroup" aria-labelledby="bk-type-label">
            {acTypes.map(item=><button type="button" role="radio" aria-checked={acType===item.key} key={item.key} className={'bk-type'+(acType===item.key?' active':'')} onClick={()=>setAcType(item.key)}>
              <AcIcon kind={item.key}/><strong>{item.label}</strong><small>{item.hint}</small>
            </button>)}
          </div>
        </div>
        <div className="bk-field">
          <span className="bk-label" id="bk-brand-label">ยี่ห้อ <em>(ไม่บังคับ)</em></span>
          <div className="bk-chips" role="radiogroup" aria-labelledby="bk-brand-label">
            {[...brands,'ไม่ทราบ'].map(item=>{const value=item==='ไม่ทราบ'?'':item;return <button type="button" role="radio" aria-checked={brand===value} key={item} className={'bk-chip'+(brand===value?' active':'')} onClick={()=>setBrand(value)}>{item}</button>;})}
          </div>
        </div>
        <div className="bk-field">
          <span className="bk-label" id="bk-size-label">ขนาด <em>(ไม่บังคับ ช่างดูให้ที่หน้างานได้)</em></span>
          <div className="bk-chips" role="radiogroup" aria-labelledby="bk-size-label">
            {sizes.map(item=><button type="button" role="radio" aria-checked={size===item.key} key={item.label} className={'bk-chip'+(size===item.key?' active':'')} onClick={()=>setSize(item.key)}>{item.label}</button>)}
          </div>
        </div>
        <label className="bk-check"><input type="checkbox" checked={checkUp} onChange={event=>setCheckUp(event.target.checked)}/><span><strong>ตรวจเช็กระบบเพิ่ม</strong><small>วัดน้ำยาและตรวจการทำงาน +฿300/เครื่อง แนะนำถ้าแอร์ไม่ค่อยเย็น</small></span></label>
        {units.length>0&&<label className="form-field"><span>เครื่องจากสมุดประวัติ (ไม่บังคับ)</span><select value={unitId??''} onChange={event=>pickUnit(event.target.value)}><option value="">ไม่ระบุเครื่อง</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unitText(unit)}</option>)}</select></label>}
        {manager
          ?<label className="form-field"><span>รายละเอียดสำหรับช่าง (ไม่บังคับ)</span><textarea rows={3} maxLength={800} value={details} onChange={event=>setDetails(event.target.value)} placeholder="เช่น ห้อง 101–120 และ 201–210, จอดรถชั้น B1, เข้าทำงานได้ 9:00–17:00"/></label>
          :<label className="form-field"><span>บอกช่างเพิ่มเติม (ไม่บังคับ)</span><input value={unitNote} onChange={event=>setUnitNote(event.target.value)} maxLength={80} placeholder="เช่น น้ำหยด มีกลิ่น ห้องนอน 2 ห้องนั่งเล่น 1"/></label>}
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