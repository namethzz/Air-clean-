import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Info, Minus, Plus } from 'lucide-react';
import type { AirConditioner, Booking, SavedAddress, Technician, UserRole } from '../types';
import LocationPicker, { type RememberChoice } from './LocationPicker';
import { RoomPicker } from './Rooms';
import { dueRooms, lastCleaned } from '../lib/rooms';
import VisitTimePicker, { defaultVisit, visitPayload, type Visit } from './VisitTimePicker';
import { saveAddress } from '../lib/api';
import { Problem, Sheet } from './kit';
import './Request.css';

export interface BookingPayload {
  service:string; unitLabel:string; propertyType:string; unitCount:number; address:string;
  date:string; time:string; timeWindow?:string; price:number; latitude:number; longitude:number; airConditionerId?:number;
  notes?:string; placeId?:number; rooms?:string[]; contactPhone?:string;
}
interface BookingModalProps { technicians:Technician[]; units?:AirConditioner[]; initialUnitId?:number; role?:UserRole; initialPlaceId?:string; initialRooms?:string[]; bookings?:Booking[]; phone?:string|null; onClose:()=>void; onSubmit:(payload:BookingPayload)=>Promise<boolean>; }
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
  return <svg className="rq-type-icon" viewBox="0 0 64 40" aria-hidden="true">
    {kind==='wall'&&<><rect x="6" y="10" width="52" height="18" rx="5"/><path d="M12 23h40"/></>}
    {kind==='hanging'&&<><path d="M4 6h56"/><rect x="8" y="9" width="48" height="20" rx="4"/><path d="M14 24h36M14 19h36"/></>}
    {kind==='cassette'&&<><path d="M4 8h56"/><rect x="14" y="8" width="36" height="20" rx="2"/><rect x="22" y="13" width="20" height="10" rx="1"/></>}
  </svg>;
}

export default function BookingModal({technicians,units=[],initialUnitId,role,initialPlaceId,initialRooms,bookings=[],phone,onClose,onSubmit}:BookingModalProps) {
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
  const [contactPhone,setContactPhone]=useState(phone??'');
  const phoneOk=/^\+?[\d\s-]{9,15}$/.test(contactPhone.trim())&&(contactPhone.match(/\d/g)?.length??0)>=9;
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  // What is still missing, shown next to the thing it is about.
  const [problem,setProblem]=useState<{at:'address'|'pin'|'rooms'|'phone'|'time';text:string}|null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  // The message goes once the person changes what it was about.
  useEffect(()=>setProblem(null),[place,visit,selectedRooms,contactPhone]);
  useEffect(()=>{
    if(!problem)return;
    const form=formRef.current;
    const field=form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target=field??form?.querySelector<HTMLElement>('[data-problem]');
    target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    field?.focus({preventScroll:true});
  },[problem]);
  const basePrice=technicians.length?Math.min(...technicians.map(tech=>tech.basePrice)):550;
  const propertyType=place.placeType==='บ้าน'?'บ้านเดี่ยว':place.placeType;
  const price=(basePrice*unitCount)
    +(service.includes('ตรวจเช็ก')?300*unitCount:0)
    +(service.includes('แขวน')?250*unitCount:0);
  const fullAddress=[place.address,place.building,place.floor?'ชั้น '+place.floor:'',place.room?'ห้อง '+place.room:'',place.note?'จุดสังเกต: '+place.note:''].filter(Boolean).join(' · ');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if(!place.address.trim()) { setProblem({at:'address',text:'กรุณากรอกที่อยู่ให้ครบถ้วน'}); return; }
    if(!place.locationSelected) { setProblem({at:'pin',text:'กรุณาปักหมุดบนแผนที่หรือใช้ตำแหน่งปัจจุบันก่อนส่งคำขอ'}); return; }
    if(roster.length&&!selectedRooms.length) { setProblem({at:'rooms',text:'เลือกห้องที่จะล้างอย่างน้อย 1 ห้อง'}); return; }
    const when=visitPayload(visit);
    if(!phoneOk) { setProblem({at:'phone',text:'กรอกเบอร์โทรให้ช่างโทรนัดได้ เช่น 081-234-5678'}); return; }
    if(!when) { setProblem({at:'time',text:'กรุณาเลือกวันและเวลาที่ช่างมาได้'}); return; }
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
      notes,placeId:Number.isFinite(placeId)?placeId:undefined,rooms:roster.length?selectedRooms:undefined,contactPhone:contactPhone.trim(),
    });
    setSubmitting(false);
    if(success)setSubmitted(true);
  }

  const title=manager?'ขอช่างล้างแอร์ในอาคาร':'ขอช่างล้างแอร์';
  const jobsPage=manager?'งานของอาคาร':'งานของฉัน';
  if(submitted)return <Sheet title={title} onClose={onClose} wide footer={<button type="button" className="ui-btn is-primary is-lg is-block" onClick={onClose}>ดู{jobsPage} <ArrowRight size={18}/></button>}>
    <div className="rq-done" role="status">
      <span className="rq-done-mark" aria-hidden="true"><Check size={34} strokeWidth={2.6}/></span>
      <h3>ส่งคำขอแล้ว</h3>
      <p>เมื่อช่างใกล้เคียงเสนอราคา ข้อเสนอจะแสดงในหน้า “{jobsPage}” ให้คุณเปรียบเทียบก่อนเลือกช่าง</p>
    </div>
  </Sheet>;

  const chip=(on:boolean)=>'ui-chip'+(on?' is-on':'');
  return <Sheet title={title} sub="ส่งรายละเอียดงาน แล้วเลือกช่างจากคนที่สนใจรับงานของคุณ" onClose={onClose} wide footer={<div className="rq-foot">
    <div className="rq-total" aria-live="polite">
      <span>ราคาเริ่มต้นโดยประมาณ</span>
      <strong className="ui-num">฿{price.toLocaleString()}</strong>
      <small>{unitCount} เครื่อง · จ่ายเมื่อล้างเสร็จ</small>
    </div>
    <button type="submit" form="rq-form" className="ui-btn is-primary is-lg rq-send" disabled={submitting} aria-busy={submitting}>
      {submitting?'กำลังส่งคำขอ…':<>ส่งคำขอ<span className="rq-send-more">ให้ช่างใกล้เคียง</span> <ArrowRight size={18}/></>}
    </button>
  </div>}>
    <form id="rq-form" ref={formRef} onSubmit={submit} className="rq" noValidate>
      <section className="rq-section" aria-label="สถานที่ให้บริการ">
        <LocationPicker value={place} onChange={setPlace} remember={remember} onRememberChange={setRemember} forBuilding={manager} preferId={initialPlaceId}
          problem={problem&&(problem.at==='address'||problem.at==='pin')?{at:problem.at,text:problem.text}:undefined}/>
      </section>

      <section className="rq-section" aria-labelledby="rq-when">
        <h3 id="rq-when" className="rq-title">วันและเวลา</h3>
        <VisitTimePicker value={visit} onChange={setVisit}/>
        {problem?.at==='time'&&<Problem>{problem.text}</Problem>}
      </section>

      <section className="rq-section" aria-labelledby="rq-units">
        <h3 id="rq-units" className="rq-title">{manager?'ห้องและแอร์':'แอร์ที่จะล้าง'}</h3>
        {roster.length>0
          ?<div className="ui-field">
            <span className="ui-label">ห้องที่จะล้าง</span>
            <RoomPicker rooms={roster} selected={selectedRooms} onChange={setSelectedRooms} due={dueNames}/>
            {problem?.at==='rooms'&&<Problem>{problem.text}</Problem>}
          </div>
          :<div className="ui-field">
            <span className="ui-label" id="rq-count-label">จำนวนแอร์ที่จะล้าง</span>
            <div className="rq-stepper" role="group" aria-labelledby="rq-count-label">
              <button type="button" aria-label="ลดจำนวน" disabled={unitCount<=1} onClick={()=>setCountText(String(unitCount-1))}><Minus size={22}/></button>
              <input className="ui-num" inputMode="numeric" pattern="[0-9]*" aria-label="จำนวนเครื่อง" value={countText} onChange={event=>setCountText(event.target.value.replace(/[^0-9]/g,'').slice(0,3))} onBlur={()=>setCountText(String(unitCount))} onFocus={event=>event.currentTarget.select()}/>
              <button type="button" aria-label="เพิ่มจำนวน" disabled={unitCount>=maxUnits} onClick={()=>setCountText(String(unitCount+1))}><Plus size={22}/></button>
              <span className="rq-stepper-unit">เครื่อง</span>
            </div>
            {manager&&<small>จองได้สูงสุด {maxUnits} เครื่องต่อครั้ง ถ้ามีแอร์หลายแบบ เลือกแบบที่มีมากที่สุด แล้วบอกช่างในรายละเอียดด้านล่าง</small>}
            {manager&&place.id!=='new'&&<small>เพิ่มรายการห้องที่หน้า “อาคารของฉัน” เพื่อเลือกห้องและติดตามรายห้องได้</small>}
          </div>}
        <div className="ui-field">
          <span className="ui-label" id="rq-type-label">แอร์เป็นแบบไหน</span>
          <div className="rq-types" role="radiogroup" aria-labelledby="rq-type-label">
            {acTypes.map(item=><button type="button" role="radio" aria-checked={acType===item.key} key={item.key} className="ui-option rq-type" onClick={()=>setAcType(item.key)}>
              <AcIcon kind={item.key}/><span className="ui-option-text"><strong>{item.label}</strong><small>{item.hint}</small></span>
            </button>)}
          </div>
        </div>
        <div className="ui-field">
          <span className="ui-label" id="rq-brand-label">ยี่ห้อ <em>(ไม่บังคับ)</em></span>
          <div className="rq-chips" role="radiogroup" aria-labelledby="rq-brand-label">
            {[...brands,'ไม่ทราบ'].map(item=>{const value=item==='ไม่ทราบ'?'':item;return <button type="button" role="radio" aria-checked={brand===value} key={item} className={chip(brand===value)} onClick={()=>setBrand(value)}>{item}</button>;})}
          </div>
        </div>
        <div className="ui-field">
          <span className="ui-label" id="rq-size-label">ขนาด <em>(ไม่บังคับ ช่างดูให้ที่หน้างานได้)</em></span>
          <div className="rq-chips" role="radiogroup" aria-labelledby="rq-size-label">
            {sizes.map(item=><button type="button" role="radio" aria-checked={size===item.key} key={item.label} className={chip(size===item.key)} onClick={()=>setSize(item.key)}>{item.label}</button>)}
          </div>
        </div>
        <label className="ui-option rq-extra"><input type="checkbox" checked={checkUp} onChange={event=>setCheckUp(event.target.checked)}/>
          <span className="ui-option-text"><strong>ตรวจเช็กระบบเพิ่ม <b className="ui-num">+฿300/เครื่อง</b></strong><small>วัดน้ำยาและตรวจการทำงาน แนะนำถ้าแอร์ไม่ค่อยเย็น</small></span>
        </label>
        {units.length>0&&<div className="ui-field"><label htmlFor="rq-unit">เครื่องจากสมุดประวัติ (ไม่บังคับ)</label><select id="rq-unit" className="ui-select" value={unitId??''} onChange={event=>pickUnit(event.target.value)}><option value="">ไม่ระบุเครื่อง</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unitText(unit)}</option>)}</select></div>}
        {manager
          ?<div className="ui-field"><label htmlFor="rq-details">รายละเอียดสำหรับช่าง (ไม่บังคับ)</label><textarea id="rq-details" className="ui-textarea" rows={3} maxLength={800} value={details} onChange={event=>setDetails(event.target.value)} placeholder="เช่น ห้อง 101–120 และ 201–210, จอดรถชั้น B1, เข้าทำงานได้ 9:00–17:00"/></div>
          :<div className="ui-field"><label htmlFor="rq-note">บอกช่างเพิ่มเติม (ไม่บังคับ)</label><input id="rq-note" className="ui-input" value={unitNote} onChange={event=>setUnitNote(event.target.value)} maxLength={80} placeholder="เช่น น้ำหยด มีกลิ่น ห้องนอน 2 ห้องนั่งเล่น 1"/></div>}
      </section>

      <section className="rq-section" aria-labelledby="rq-phone-label">
        <div className="ui-field">
          <label id="rq-phone-label" htmlFor="rq-phone" className="rq-title">เบอร์โทรของคุณ</label>
          <small id="rq-phone-hint">ช่างโทรนัดก่อนเข้า และใช้เมื่อต้องเลื่อนนัด</small>
          <input id="rq-phone" className="ui-input rq-phone ui-num" type="tel" inputMode="tel" autoComplete="tel" value={contactPhone} onChange={event=>setContactPhone(event.target.value)} placeholder="081-234-5678" maxLength={20}
            aria-invalid={problem?.at==='phone'||undefined} aria-describedby={problem?.at==='phone'?'rq-phone-hint rq-phone-problem':'rq-phone-hint'}/>
          {problem?.at==='phone'&&<Problem id="rq-phone-problem">{problem.text}</Problem>}
        </div>
      </section>

      <p className="rq-terms"><Info size={18} aria-hidden="true"/><span>ยังไม่ใช่ราคาสุดท้าย คุณจะเห็นราคาที่ช่างแต่ละคนเสนอและเลือกยืนยันเอง · เก็บเงินปลายทางเมื่อล้างเสร็จ ไม่ต้องจ่ายล่วงหน้า</span></p>
    </form>
  </Sheet>;
}
