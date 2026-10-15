import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Check, Minus, Plus, Wind, X } from 'lucide-react';
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

/** What a customer can tell by looking at the unit. Hanging and ceiling units take longer, so they cost more. */
const acTypes=[
  {key:'wall',label:'ติดผนัง',hint:'แบบที่พบบ่อยที่สุด',service:'ล้างแอร์มาตรฐาน'},
  {key:'hanging',label:'แขวนใต้ฝ้า / ตั้งพื้น',hint:'ตัวใหญ่ ลมออกด้านหน้า',service:'ล้างแอร์แบบแขวน'},
  {key:'cassette',label:'ฝังฝ้า 4 ทิศทาง',hint:'อยู่ในฝ้า ลมออก 4 ด้าน',service:'ล้างแอร์แบบแขวน (ฝังฝ้า)'},
] as const;
type AcType=typeof acTypes[number]['key'];
const sizes=[{key:'',label:'ไม่ทราบ'},{key:'9,000–12,000 BTU',label:'ห้องนอน (9,000–12,000)'},{key:'18,000–24,000 BTU',label:'ห้องใหญ่ (18,000–24,000)'},{key:'มากกว่า 24,000 BTU',label:'มากกว่า 24,000'}];
const brands=['Daikin','Mitsubishi','Carrier','Panasonic','Samsung','LG','Haier','Sharp','Saijo Denki','Central Air'];

const slots=[{label:'ช่วงเช้า',times:['08:00','09:00','10:00','11:00']},{label:'ช่วงบ่าย',times:['13:00','14:00','15:00','16:00','17:00']}];
function addDays(date:string,days:number){const value=new Date(date+'T00:00:00');value.setDate(value.getDate()+days);return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,10);}
/** Today only offers times at least an hour away, so the technician has time to get there. */
function timeOpen(date:string,time:string){if(date!==localDate())return true;const [h,m]=time.split(':').map(Number);const at=new Date();at.setHours(h,m,0,0);return at.getTime()-Date.now()>=60*60*1000;}
function firstFreeTime(date:string){return slots.flatMap(group=>group.times).find(time=>timeOpen(date,time));}

/** Next two weeks as day cards (plus any other date), and the visit time as buttons grouped by morning and afternoon. */
function DateTimePicker({date,time,onDate,onTime}:{date:string;time:string;onDate:(value:string)=>void;onTime:(value:string)=>void}){
  const first=localDate();
  const days=Array.from({length:14},(_,i)=>addDays(first,i)).filter(day=>day!==first||firstFreeTime(day));
  const other=!days.includes(date);
  const picker=useRef<HTMLInputElement>(null);
  function pickDay(day:string){onDate(day);if(!timeOpen(day,time))onTime(firstFreeTime(day)??time);}
  return <>
    <div className="bk-field">
      <span className="bk-label" id="bk-date-label">วันที่สะดวก</span>
      <div className="bk-days" role="radiogroup" aria-labelledby="bk-date-label">
        {days.map((day,index)=>{const value=new Date(day+'T00:00:00');const head=day===first?'วันนี้':day===addDays(first,1)?'พรุ่งนี้':value.toLocaleDateString('th-TH',{weekday:'short'});
          return <button type="button" role="radio" aria-checked={date===day} key={day} className={'bk-day'+(date===day?' active':'')+(index===0?' first':'')} onClick={()=>pickDay(day)}>
            <span>{head}</span><strong>{value.getDate()}</strong><small>{value.toLocaleDateString('th-TH',{month:'short'})}</small>
          </button>;})}
        <button type="button" className={'bk-day bk-day-other'+(other?' active':'')} onClick={()=>{const input=picker.current;if(!input)return;try{input.showPicker();}catch{input.focus();input.click();}}}>
          <CalendarDays size={20}/><small>{other?new Date(date+'T00:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short'}):'วันอื่น'}</small>
        </button>
        <input ref={picker} className="bk-date-native" type="date" min={first} value={date} onChange={event=>{if(event.target.value)pickDay(event.target.value);}} aria-label="เลือกวันอื่น" tabIndex={-1}/>
      </div>
      <p className="bk-picked">{new Date(date+'T00:00:00').toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · {time} น.</p>
    </div>
    <div className="bk-field">
      <span className="bk-label" id="bk-time-label">เวลาที่สะดวกให้ช่างมาถึง</span>
      <div className="bk-slots" role="radiogroup" aria-labelledby="bk-time-label">
        {slots.map(group=><div key={group.label} className="bk-slot-group"><small>{group.label}</small><div>
          {group.times.map(value=>{const open=timeOpen(date,value);return <button type="button" role="radio" aria-checked={time===value} key={value} disabled={!open} className={'bk-slot'+(time===value?' active':'')} onClick={()=>onTime(value)}>{value}</button>;})}
        </div></div>)}
      </div>
    </div>
  </>;
}

function AcIcon({kind}:{kind:AcType}){
  // Simple drawings so people can match what is on their wall or ceiling.
  return <svg className="bk-type-icon" viewBox="0 0 64 40" aria-hidden="true">
    {kind==='wall'&&<><rect x="6" y="10" width="52" height="18" rx="5"/><path d="M12 23h40"/></>}
    {kind==='hanging'&&<><path d="M4 6h56"/><rect x="8" y="9" width="48" height="20" rx="4"/><path d="M14 24h36M14 19h36"/></>}
    {kind==='cassette'&&<><path d="M4 8h56"/><rect x="14" y="8" width="36" height="20" rx="2"/><rect x="22" y="13" width="20" height="10" rx="1"/></>}
  </svg>;
}

export default function BookingModal({technicians,units=[],initialUnitId,onClose,onSubmit}:BookingModalProps) {
  const initialUnit=units.find(unit=>unit.id===initialUnitId);
  const [unitId,setUnitId]=useState<number|undefined>(initialUnit?.id);
  const [acType,setAcType]=useState<AcType>('wall');
  const [size,setSize]=useState('');
  const [brand,setBrand]=useState('');
  const [checkUp,setCheckUp]=useState(false);
  const [unitNote,setUnitNote]=useState('');
  // Held as text so the field can be emptied while typing; it becomes a number between 1 and 30 on leaving it.
  const [countText,setCountText]=useState('1');
  const unitCount=Math.max(1,Math.min(30,Number.parseInt(countText,10)||1));
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
    id:'new',label:'สถานที่ให้บริการ',placeType:'บ้าน',address:'',
    latitude:13.7563,longitude:100.5018,locationSelected:false,
  });
  const [remember,setRemember]=useState<RememberChoice>({on:true,label:'บ้าน'});
  const [date,setDate]=useState(()=>firstFreeTime(today)?today:addDays(today,1));
  const [time,setTime]=useState(()=>firstFreeTime(today)??'10:00');
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
        <div className="bk-field">
          <span className="bk-label" id="bk-count-label">จำนวนแอร์ที่จะล้าง</span>
          <div className="bk-stepper" role="group" aria-labelledby="bk-count-label">
            <button type="button" aria-label="ลดจำนวน" disabled={unitCount<=1} onClick={()=>setCountText(String(unitCount-1))}><Minus size={20}/></button>
            <input inputMode="numeric" pattern="[0-9]*" aria-label="จำนวนเครื่อง" value={countText} onChange={event=>setCountText(event.target.value.replace(/[^0-9]/g,'').slice(0,2))} onBlur={()=>setCountText(String(unitCount))} onFocus={event=>event.currentTarget.select()}/>
            <button type="button" aria-label="เพิ่มจำนวน" disabled={unitCount>=30} onClick={()=>setCountText(String(unitCount+1))}><Plus size={20}/></button>
            <span className="bk-stepper-unit">เครื่อง</span>
          </div>
        </div>
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
        <label className="form-field"><span>บอกช่างเพิ่มเติม (ไม่บังคับ)</span><input value={unitNote} onChange={event=>setUnitNote(event.target.value)} maxLength={80} placeholder="เช่น น้ำหยด มีกลิ่น ห้องนอน 2 ห้องนั่งเล่น 1"/></label>
        <DateTimePicker date={date} time={time} onDate={setDate} onTime={setTime}/>
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