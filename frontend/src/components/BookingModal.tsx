import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import type { AirConditioner, Booking, JobItem, LastCleaned, PriceLine, PriceRange, PriceSheet, SavedAddress, Symptom, UserRole } from '../types';
import LocationPicker, { type RememberChoice } from './LocationPicker';
import { RoomPicker } from './Rooms';
import { dueRooms, lastCleaned } from '../lib/rooms';
import VisitTimePicker, { defaultVisit, visitPayload, type Visit } from './VisitTimePicker';
import { fetchPriceEstimate, fetchPriceGuide, isApiConfigured, saveAddress } from '../lib/api';
import { baht, bahtRange, kindNames, lastCleanedOptions, priceLines, recommendation, referenceRange, referenceSheet, serviceName, symptomOptions, total, unitsOf } from '../lib/pricing';
import { CleanChoice, PriceBreakdown, Stepper, UnitRows, newRow, rowsToItems, type UnitRow } from './Pricing';
import { Problem, Sheet } from './kit';
import './Request.css';

export interface BookingPayload {
  service:string; unitLabel:string; propertyType:string; unitCount:number; address:string;
  date:string; time:string; timeWindow?:string; price:number; latitude:number; longitude:number; airConditionerId?:number;
  notes?:string; placeId?:number; rooms?:string[]; contactPhone?:string;
  items:JobItem[]; deep:boolean; hardAccessUnits:number; lastCleaned?:LastCleaned; symptoms:Symptom[];
}
interface BookingModalProps { units?:AirConditioner[]; initialUnitId?:number; role?:UserRole; initialPlaceId?:string; initialRooms?:string[]; bookings?:Booking[]; phone?:string|null; onClose:()=>void; onSubmit:(payload:BookingPayload)=>Promise<boolean>; }
function unitText(unit:AirConditioner):string { return [unit.label,unit.brand,unit.type].filter(Boolean).join(' · ').slice(0,180); }

const brands=['Daikin','Mitsubishi','Carrier','Panasonic','Samsung','LG','Haier','Sharp','Saijo Denki','Central Air'];

/** "ติดผนัง 2 (ใหญ่ 1) + ฝังฝ้า 1": the units in a few words, for the technician's list. */
function itemsText(items:JobItem[]):string {
  return items.map(item=>`${kindNames[item.kind]} ${item.count}${item.large?` (ใหญ่ ${item.large})`:''}`).join(' + ');
}

/**
 * The going rate for the job as described. Typical per-line prices come once from the price guide; the range comes
 * from the server as the description changes. Offline (or before the answer) AirClean's reference prices stand in.
 */
function useEstimate(items:JobItem[],deep:boolean,hardAccessUnits:number){
  const [typical,setTypical]=useState<PriceSheet>(referenceSheet);
  const [range,setRange]=useState<PriceRange>(()=>referenceRange(items,deep,hardAccessUnits));
  const [lines,setLines]=useState<PriceLine[]>(()=>priceLines(referenceSheet,items,deep,hardAccessUnits));
  useEffect(()=>{
    if(!isApiConfigured())return;
    let live=true;
    fetchPriceGuide().then(guide=>{if(live)setTypical(guide.typical);}).catch(()=>undefined);
    return()=>{live=false;};
  },[]);
  const key=JSON.stringify([items,deep,hardAccessUnits]);
  useEffect(()=>{
    setLines(priceLines(typical,items,deep,hardAccessUnits));
    // Offline the reference is all there is; online the last range stays up until the new one arrives, so it does not flicker.
    if(!isApiConfigured()){setRange(referenceRange(items,deep,hardAccessUnits));return;}
    let live=true;
    const timer=window.setTimeout(()=>{
      fetchPriceEstimate({items,deep,hardAccessUnits}).then(answer=>{if(live){setRange(answer.range);setLines(answer.lines);}})
        .catch(()=>{if(live)setRange(referenceRange(items,deep,hardAccessUnits));});
    },250);
    return()=>{live=false;window.clearTimeout(timer);};
  },[key,typical]); // eslint-disable-line react-hooks/exhaustive-deps
  return {typical,range,lines};
}

export default function BookingModal({units=[],initialUnitId,role,initialPlaceId,initialRooms,bookings=[],phone,onClose,onSubmit}:BookingModalProps) {
  const manager=role==='manager';
  // Homes book up to 30 units; building managers book whole buildings.
  const maxUnits=manager?300:30;
  const initialUnit=units.find(unit=>unit.id===initialUnitId);
  const [unitId,setUnitId]=useState<number|undefined>(initialUnit?.id);
  // The units, one row per kind and size; homes often have a wall unit and a ceiling unit.
  const [rows,setRows]=useState<UnitRow[]>(()=>[newRow('wall',1,'unknown')]);
  const [brand,setBrand]=useState('');
  const [unitNote,setUnitNote]=useState('');
  const [details,setDetails]=useState('');
  // What the customer can tell about the units' state; it decides which clean is recommended.
  const [lastCleanedAt,setLastCleanedAt]=useState<LastCleaned|''>('');
  const [symptoms,setSymptoms]=useState<Symptom[]>([]);
  const [access,setAccess]=useState<'easy'|'hard'|'unknown'>('easy');
  const [hardText,setHardText]=useState<number|null>(null);
  const advice=recommendation(lastCleanedAt,symptoms);
  // Follows the advice until the customer picks one themselves.
  const [pickedDeep,setPickedDeep]=useState<boolean|null>(null);
  const deep=pickedDeep??advice.deep;
  const chosenUnit=units.find(unit=>unit.id===unitId);
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
  useEffect(()=>{if(manager&&place.unitCount&&!(place.rooms?.length))setRows(current=>[{...current[0],count:Math.min(place.unitCount!,maxUnits)},...current.slice(1)]);},[place.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const roomUnits=roster.length?Math.max(1,roster.filter(room=>selectedRooms.includes(room.name)).reduce((sum,room)=>sum+room.units,0)):undefined;
  // With rooms picked, the first row takes what the other rows leave, so the kinds always add up to the rooms' units.
  const items=useMemo(()=>{
    const list=rowsToItems(rows);
    if(roomUnits!=null)list[0]={...list[0],count:Math.max(1,roomUnits-unitsOf(list.slice(1))),large:list[0].large?Math.max(1,roomUnits-unitsOf(list.slice(1))):0};
    return list;
  },[rows,roomUnits]);
  const unitCount=unitsOf(items);
  const hardAccessUnits=access==='hard'?Math.min(unitCount,hardText??unitCount):0;
  const {typical,range,lines}=useEstimate(items,deep,hardAccessUnits);
  const service=serviceName(items,deep);
  // What the technician sees about the units, built from the choices above.
  const unitLabel=[
    chosenUnit?chosenUnit.label:'',itemsText(items),brand,
    access==='unknown'?'ไม่แน่ใจตำแหน่งคอยล์ร้อน':'',unitNote.trim()?'หมายเหตุ: '+unitNote.trim():'',
  ].filter(Boolean).join(' · ').slice(0,180);
  const [visit,setVisit]=useState<Visit>(defaultVisit);
  const [contactPhone,setContactPhone]=useState(phone??'');
  const phoneOk=/^\+?[\d\s-]{9,15}$/.test(contactPhone.trim())&&(contactPhone.match(/\d/g)?.length??0)>=9;
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  // What is still missing, shown next to the thing it is about.
  const [problem,setProblem]=useState<{at:'address'|'pin'|'rooms'|'phone'|'time'|'units';text:string}|null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  // The message goes once the person changes what it was about.
  useEffect(()=>setProblem(null),[place,visit,selectedRooms,contactPhone,rows]);
  useEffect(()=>{
    if(!problem)return;
    const form=formRef.current;
    const field=form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target=field??form?.querySelector<HTMLElement>('[data-problem]');
    target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    field?.focus({preventScroll:true});
  },[problem]);
  const propertyType=place.placeType==='บ้าน'?'บ้านเดี่ยว':place.placeType;
  const price=range.mid;
  const largeUnknown=rows.some(row=>row.size==='unknown');
  const fullAddress=[place.address,place.building,place.floor?'ชั้น '+place.floor:'',place.room?'ห้อง '+place.room:'',place.note?'จุดสังเกต: '+place.note:''].filter(Boolean).join(' · ');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if(!place.address.trim()) { setProblem({at:'address',text:'กรุณากรอกที่อยู่ให้ครบถ้วน'}); return; }
    if(!place.locationSelected) { setProblem({at:'pin',text:'กรุณาปักหมุดบนแผนที่หรือใช้ตำแหน่งปัจจุบันก่อนส่งคำขอ'}); return; }
    if(roster.length&&!selectedRooms.length) { setProblem({at:'rooms',text:'เลือกห้องที่จะล้างอย่างน้อย 1 ห้อง'}); return; }
    if(roomUnits!=null&&unitsOf(rowsToItems(rows.slice(1)))>=roomUnits) { setProblem({at:'units',text:`แอร์แต่ละแบบรวมกันต้องเท่ากับ ${roomUnits} เครื่องในห้องที่เลือก`}); return; }
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
      items,deep,hardAccessUnits,lastCleaned:lastCleanedAt||undefined,symptoms,
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
      <span>{range.reference?'ราคาอ้างอิงงานนี้':'ช่างส่วนใหญ่คิดงานนี้'}</span>
      <strong className="ui-num">{bahtRange(range)}</strong>
      <small>{unitCount} เครื่อง · จ่ายเมื่อล้างเสร็จ</small>
    </div>
    <button type="submit" form="rq-form" className="ui-btn is-primary is-lg rq-send" disabled={submitting} aria-busy={submitting}>
      {submitting?'กำลังส่งคำขอ…':<><span>ส่งคำขอ<span className="rq-send-more">ให้ช่างใกล้เคียง</span></span><ArrowRight size={18}/></>}
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
        {roster.length>0&&<div className="ui-field">
          <span className="ui-label">ห้องที่จะล้าง</span>
          <RoomPicker rooms={roster} selected={selectedRooms} onChange={setSelectedRooms} due={dueNames}/>
          {problem?.at==='rooms'&&<Problem>{problem.text}</Problem>}
        </div>}
        <UnitRows rows={rows} onChange={setRows} maxUnits={maxUnits} fixedTotal={roomUnits} sheet={typical}/>
        {problem?.at==='units'&&<Problem>{problem.text}</Problem>}
        {manager&&roster.length===0&&<small>จองได้สูงสุด {maxUnits} เครื่องต่อครั้ง{place.id!=='new'?' · เพิ่มรายการห้องที่หน้า “อาคารของฉัน” เพื่อเลือกและติดตามรายห้อง':''}</small>}
        {largeUnknown&&<small>ไม่ทราบขนาดไม่เป็นไร ช่างดูให้ที่หน้างาน ถ้าเป็นแอร์ใหญ่กว่า 24,000 BTU บวกเพิ่มราว {baht(typical.large)}/เครื่อง ช่างต้องขอในแอปและคุณกดอนุมัติก่อน</small>}
        <div className="ui-field">
          <span className="ui-label" id="rq-brand-label">ยี่ห้อ <em>(ไม่บังคับ)</em></span>
          <div className="rq-chips" role="radiogroup" aria-labelledby="rq-brand-label">
            {[...brands,'ไม่ทราบ'].map(item=>{const value=item==='ไม่ทราบ'?'':item;return <button type="button" role="radio" aria-checked={brand===value} key={item} className={chip(brand===value)} onClick={()=>setBrand(value)}>{item}</button>;})}
          </div>
        </div>
        {units.length>0&&<div className="ui-field"><label htmlFor="rq-unit">เครื่องจากสมุดประวัติ (ไม่บังคับ)</label><select id="rq-unit" className="ui-select" value={unitId??''} onChange={event=>pickUnit(event.target.value)}><option value="">ไม่ระบุเครื่อง</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unitText(unit)}</option>)}</select></div>}
      </section>

      <section className="rq-section" aria-labelledby="rq-state">
        <h3 id="rq-state" className="rq-title">สภาพแอร์</h3>
        <div className="ui-field">
          <span className="ui-label" id="rq-last-label">ล้างครั้งล่าสุดเมื่อไหร่</span>
          <div className="rq-chips" role="radiogroup" aria-labelledby="rq-last-label">
            {lastCleanedOptions.map(item=><button type="button" role="radio" aria-checked={lastCleanedAt===item.key} key={item.key} className={chip(lastCleanedAt===item.key)} onClick={()=>setLastCleanedAt(lastCleanedAt===item.key?'':item.key)}>{item.label}</button>)}
          </div>
        </div>
        <div className="ui-field">
          <span className="ui-label" id="rq-symptom-label">มีอาการไหม <em>(เลือกได้หลายข้อ)</em></span>
          <div className="rq-chips" role="group" aria-labelledby="rq-symptom-label">
            {symptomOptions.map(item=>{const on=symptoms.includes(item.key);return <button type="button" aria-pressed={on} key={item.key} className={chip(on)} onClick={()=>setSymptoms(on?symptoms.filter(key=>key!==item.key):[...symptoms,item.key])}>{on&&<Check size={15} aria-hidden="true"/>}{item.label}</button>;})}
          </div>
        </div>
        <div className="ui-field">
          <span className="ui-label" id="rq-access-label">คอยล์ร้อน (ตัวนอกบ้าน) อยู่ตรงไหน</span>
          <div className="rq-access" role="radiogroup" aria-labelledby="rq-access-label">
            <button type="button" role="radio" aria-checked={access==='easy'} className="ui-option" onClick={()=>setAccess('easy')}><span className="ui-option-text"><strong>เข้าถึงง่าย</strong><small>วางพื้น ระเบียง หรือยืนบนบันไดเตี้ยแล้วถึง</small></span></button>
            <button type="button" role="radio" aria-checked={access==='hard'} className="ui-option" onClick={()=>setAccess('hard')}><span className="ui-option-text"><strong>ที่สูงหรือเข้าถึงยาก</strong><small>ผนังชั้น 2 ขึ้นไป บนหลังคา ต้องใช้บันไดสูง <b className="ui-num">+{baht(typical.hardAccess)}/เครื่อง</b></small></span></button>
            <button type="button" role="radio" aria-checked={access==='unknown'} className="ui-option" onClick={()=>setAccess('unknown')}><span className="ui-option-text"><strong>ไม่แน่ใจ</strong><small>ช่างดูให้หน้างาน ถ้าเข้าถึงยากต้องขอในแอปก่อน</small></span></button>
          </div>
          {access==='hard'&&unitCount>1&&<div className="rq-access-count">
            <span className="ui-label">กี่เครื่องที่เข้าถึงยาก</span>
            <Stepper value={hardAccessUnits} min={1} max={unitCount} label="จำนวนคอยล์ร้อนที่เข้าถึงยาก" unit={`จาก ${unitCount}`} onChange={setHardText}/>
          </div>}
        </div>
      </section>

      <section className="rq-section" aria-labelledby="rq-clean">
        <h3 id="rq-clean" className="rq-title">แบบการล้าง</h3>
        <CleanChoice deep={deep} onChange={setPickedDeep} recommended={advice.deep} why={advice.why}
          standardPrice={total(priceLines(typical,items,false,hardAccessUnits))} deepPrice={total(priceLines(typical,items,true,hardAccessUnits))}/>
        {manager
          ?<div className="ui-field"><label htmlFor="rq-details">รายละเอียดสำหรับช่าง (ไม่บังคับ)</label><textarea id="rq-details" className="ui-textarea" rows={3} maxLength={800} value={details} onChange={event=>setDetails(event.target.value)} placeholder="เช่น ห้อง 101–120 และ 201–210, จอดรถชั้น B1, เข้าทำงานได้ 9:00–17:00"/></div>
          :<div className="ui-field"><label htmlFor="rq-note">บอกช่างเพิ่มเติม (ไม่บังคับ)</label><input id="rq-note" className="ui-input" value={unitNote} onChange={event=>setUnitNote(event.target.value)} maxLength={80} placeholder="เช่น ห้องนอน 2 ห้องนั่งเล่น 1, จอดรถหน้าบ้านได้"/></div>}
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

      <section className="rq-section rq-price" aria-labelledby="rq-price">
        <h3 id="rq-price" className="rq-title">ราคานี้มาจากไหน</h3>
        <div className="pr-market">
          <div className="pr-market-head"><span>{range.reference?'ราคาอ้างอิงของ AirClean':`ช่าง ${range.technicians} คนในระบบ ส่วนใหญ่คิด`}</span><strong className="ui-num">{bahtRange(range)}</strong></div>
          <p>{range.reference
            ?'ตอนนี้ช่างในระบบยังมีไม่มาก จึงใช้ราคาอ้างอิงที่ใกล้เคียงราคาช่างทั่วไป ราคาจริงคือราคาที่ช่างแต่ละคนเสนอ'
            :`ราคากลาง ${baht(range.mid)} คิดจากใบราคาของช่างทุกคนในระบบ ข้อเสนอแต่ละรายจะบอกว่าต่ำกว่า เท่ากับ หรือสูงกว่าราคากลาง`}</p>
          <details className="pr-details"><summary>ดูวิธีคิดราคากลาง</summary><PriceBreakdown lines={lines} totalLabel="ราคากลาง"/></details>
        </div>
        <div className="pr-promise">
          <strong><ShieldCheck size={18} aria-hidden="true"/>ราคาที่คุณเลือกจะล็อกไว้</strong>
          <ul>
            <li>ช่างบวกเงินเองไม่ได้ ถ้าหน้างานต้องทำเพิ่ม (เติมน้ำยา เปลี่ยนอะไหล่ หรือแอร์ไม่ตรงกับที่แจ้ง) ช่างต้องขอในแอปพร้อมเหตุผล</li>
            <li>ราคาเปลี่ยนเมื่อคุณกดอนุมัติเท่านั้น ถ้าไม่อนุมัติ ช่างทำตามรายการเดิมในราคาเดิม</li>
            <li>จ่ายให้ช่างเมื่อล้างเสร็จ ตามยอดในแอป ไม่ต้องจ่ายล่วงหน้า</li>
          </ul>
        </div>
      </section>
    </form>
  </Sheet>;
}
