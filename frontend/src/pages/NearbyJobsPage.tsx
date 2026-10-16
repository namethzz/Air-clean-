import { timeLabel } from '../lib/time';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarX2, CheckCircle2, ClipboardList, MapPin, RefreshCw, Search, Send, ShieldCheck, UserCog, Wind, Wrench } from 'lucide-react';
import type { Booking, Membership, TechnicianApplication } from '../types';
import { VerificationBanner } from '../components/TechnicianProfileSettings';
import { fetchMyMembership, fetchMyTechnicianProfile, fetchNearbyJobs } from '../lib/api';
import TechnicianDocuments from '../components/TechnicianDocuments';
import { MembershipStrip } from './MembershipPage';
import { clashesWith, sameDay } from '../lib/clash';
import HeroSection6 from '../components/ui/hero-section-6';
import { heroShots } from '../assets/hero';
import { EmptyState, PageHead, Plate } from '../components/kit';
import { PriceBreakdown } from '../components/Pricing';
import { bahtRange, cleanName, conditionText, positionNames, positionOf } from '../lib/pricing';
import './Membership.css';
import './NearbyJobs.css';

interface Props { onApply:(bookingId:number)=>Promise<boolean>; onOpenProfile:()=>void; onOpenMembership:()=>void; onOpenMyJobs:()=>void; myJobs:Booking[]; }
function prettyDate(date:string) {
  return new Date(date+'T00:00:00').toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short'});
}
function messageOf(error:unknown) {
  return error instanceof Error?error.message:'โหลดงานใกล้เคียงไม่สำเร็จ';
}
const radii=[5,10,25,50,100];
const smooth=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';

/** Technicians reach the job feed only after an admin approves their application. */
export default function NearbyJobsPage({onApply,onOpenProfile,onOpenMembership,onOpenMyJobs,myJobs}:Props) {
  const [profile,setProfile]=useState<TechnicianApplication|null>(null);
  const [profileError,setProfileError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setProfileError('');
    fetchMyTechnicianProfile().then(p=>{if(active)setProfile(p);}).catch(err=>{if(active)setProfileError(messageOf(err));});
    return ()=>{active=false;};
  },[attempt]);
  if(profileError)return <div className="ui-page is-narrow"><p className="ui-alert is-problem" role="alert"><AlertCircle size={18}/><span>{profileError}</span><button type="button" className="ui-btn is-sm" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={16}/> ลองอีกครั้ง</button></p></div>;
  if(!profile)return <div className="ui-page is-narrow"><div className="ui-skeleton nj-skel" aria-label="กำลังตรวจสอบบัญชีช่าง"/></div>;
  if(profile.verificationStatus!=='Approved')return <div className="ui-page is-narrow">
    <PageHead title="งานใกล้ฉัน">เพื่อความปลอดภัยของลูกค้า ผู้ดูแลตรวจสอบช่างทุกคนก่อนเปิดให้เห็นงานและส่งข้อเสนอ</PageHead>
    <VerificationBanner profile={profile}/>
    <TechnicianDocuments/>
    <button type="button" className="ui-btn is-primary is-lg is-block" onClick={onOpenProfile}><UserCog size={20}/> {profile.verificationStatus==='Rejected'?'แก้ไขข้อมูลและส่งตรวจอีกครั้ง':'ตรวจข้อมูลโปรไฟล์ของฉัน'}</button>
  </div>;
  return <NearbyJobs onApply={onApply} onOpenMembership={onOpenMembership} onOpenMyJobs={onOpenMyJobs} myJobs={myJobs}/>;
}

/**
 * The job feed: each job is a plate with what the technician would earn and how far it is, read at arm's length,
 * then what the job is and one button to send the offer. Nearest first; the nearest open one is the blue plate.
 */
function NearbyJobs({onApply,onOpenMembership,onOpenMyJobs,myJobs}:{onApply:Props['onApply'];onOpenMembership:()=>void;onOpenMyJobs:()=>void;myJobs:Booking[]}) {
  const [membership,setMembership]=useState<Membership|null>(null);
  useEffect(()=>{fetchMyMembership().then(setMembership).catch(()=>setMembership(null));},[]);
  const lapsed=membership?.state==='Expired';
  const [confirming,setConfirming]=useState<number|null>(null);
  const [jobs,setJobs]=useState<Booking[]>([]);
  const [radiusKm,setRadiusKm]=useState(25);
  const [loading,setLoading]=useState(false);
  const [applyingId,setApplyingId]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [searched,setSearched]=useState(false);

  // Only the latest search may fill the list: an older radius answering late must not win.
  const searchNo=useRef(0);
  const loadNearby=useCallback(async()=>{
    const mine=++searchNo.current;
    setLoading(true);setError('');
    try {
      const coords=await new Promise<{latitude:number;longitude:number}>((resolve,reject)=>{
        if(!navigator.geolocation){reject(new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ GPS'));return;}
        navigator.geolocation.getCurrentPosition(
          position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude}),
          ()=>reject(new Error('ยังไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาเปิด GPS เพื่อค้นหางานใกล้ตัว')),
          {enableHighAccuracy:true,timeout:15000,maximumAge:30000},
        );
      });
      const found=await fetchNearbyJobs(coords.latitude,coords.longitude,radiusKm);
      if(mine!==searchNo.current)return;
      setJobs(found);setSearched(true);
    } catch (err) { if(mine===searchNo.current)setError(messageOf(err)); }
    finally { if(mine===searchNo.current)setLoading(false); }
  },[radiusKm]);

  useEffect(()=>{void loadNearby();},[loadNearby]);

  async function apply(jobId:number) {
    setApplyingId(jobId);
    const success=await onApply(jobId);
    setApplyingId(null);
    if(success) void loadNearby();
  }

  const open=jobs.filter(job=>!job.currentTechnicianApplied).length;
  const lead=jobs.find(job=>!job.currentTechnicianApplied)?.id;
  return <div className="nj">
    <HeroSection6 variant="app" {...heroShots.technician}
      turn={open>0}
      badge={loading&&!jobs.length?'กำลังค้นหางานใกล้คุณ…':error?'ยังหาตำแหน่งของคุณไม่ได้':open>0?`มี ${open} งานใหม่ในระยะ ${radiusKm} กม.`:`ยังไม่มีงานใหม่ในระยะ ${radiusKm} กม.`}
      title="งานล้างแอร์ใกล้คุณ"
      text="เห็นราคาของคุณ ระยะทาง และสภาพแอร์ก่อนตัดสินใจ ลูกค้าเป็นคนเลือกช่าง ที่อยู่เต็มจะแสดงเมื่อลูกค้ายืนยันคุณ"
      primary={{label:'ดูงานใกล้ฉัน',icon:Search,onClick:()=>document.getElementById('nearby-list')?.scrollIntoView({behavior:smooth(),block:'start'})}}
      secondary={{label:'งานของฉัน',icon:ClipboardList,onClick:onOpenMyJobs}}/>

    <section className="nj-feed" id="nearby-list" aria-labelledby="nj-title">
      <div className="nj-head">
        <div>
          <h1 id="nj-title">งานใกล้ฉัน</h1>
          <p aria-live="polite">{loading?'กำลังค้นหาจากตำแหน่ง GPS ของคุณ…':error?'ค้นหาไม่สำเร็จ':`${jobs.length} งานในรัศมี ${radiusKm} กม. · ใกล้ที่สุดก่อน`}</p>
        </div>
        <button type="button" className="ui-btn" onClick={()=>void loadNearby()} disabled={loading} aria-busy={loading}><RefreshCw size={18} className={loading?'ui-spin':undefined}/> {loading?'กำลังค้นหา…':'ค้นหาใหม่'}</button>
      </div>
      <div className="nj-radius" role="group" aria-label="ระยะค้นหา">
        <span>ระยะค้นหา</span>
        {radii.map(km=><button type="button" key={km} className="ui-chip" aria-pressed={radiusKm===km} onClick={()=>setRadiusKm(km)}>{km} กม.</button>)}
      </div>
      {membership&&<MembershipStrip data={membership} onOpen={onOpenMembership}/>}
      {error&&<p className="ui-alert is-problem" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" className="ui-btn is-sm" onClick={()=>void loadNearby()}><RefreshCw size={16}/> ลองอีกครั้ง</button></p>}

      {loading&&!jobs.length
        ?<div className="nj-list" aria-hidden="true"><div className="ui-skeleton nj-skel"/><div className="ui-skeleton nj-skel"/></div>
        :!jobs.length&&searched&&!error
        ?<EmptyState icon={Wind} title={`ยังไม่มีงานในระยะ ${radiusKm} กม.`}
          action={radiusKm<100?<button type="button" className="ui-btn" onClick={()=>setRadiusKm(radii.find(km=>km>radiusKm)??100)}>ขยายเป็น {radii.find(km=>km>radiusKm)} กม.</button>:undefined}>
          ลองขยายระยะค้นหา หรือกลับมาดูอีกครั้ง เมื่อมีคำขอใหม่จะแจ้งเตือนคุณ
        </EmptyState>
        :<ul className="nj-list">{jobs.map(job=>{
          const applied=Boolean(job.currentTechnicianApplied);
          const clashes=clashesWith(job,myJobs);
          const hard=clashes.some(item=>!item.soft);
          const dayCount=sameDay(job.date,myJobs);
          // What this technician would quote, from their own price list, against the going rate for the job.
          const quote=job.applicants?.[0]?.quote??job.yourQuote??job.price;
          const position=job.market?positionOf(quote,job.market):null;
          const condition=conditionText(job);
          return <li key={job.id} className={'nj-job'+(applied?' is-applied':'')}>
            <Plate quiet={job.id!==lead} num={'฿'+quote.toLocaleString()} unit={applied?'ราคาที่คุณเสนอ':'ราคาของคุณ'}
              side={<span className="nj-km" aria-label={job.distanceKm==null?'ระยะทางไม่ทราบ':`ห่างประมาณ ${Math.round(job.distanceKm)} กิโลเมตร`}>
                <b className="ui-num">{job.distanceKm==null?'–':Math.round(job.distanceKm)}</b><small>กม.</small>
              </span>}
              meta={<>
                <strong>{prettyDate(job.date)} · {timeLabel(job)}</strong>
                {position&&<span className={'pr-pos is-'+position}>{positionNames[position]}</span>}
                {job.market&&<span>ราคากลาง {bahtRange(job.market)}</span>}
              </>}/>
            <div className="nj-body">
              <h2>{job.service} · {job.unitCount||1} เครื่อง</h2>
              <ul className="nj-facts">
                <li><Wrench size={16} aria-hidden="true"/><span>{[job.propertyType||'ที่พัก',cleanName(Boolean(job.deep)),job.unitLabel,job.hardAccessUnits?`คอยล์ร้อนเข้าถึงยาก ${job.hardAccessUnits} เครื่อง`:''].filter(Boolean).join(' · ')}</span></li>
                {condition&&<li><Wind size={16} aria-hidden="true"/><span>{condition}</span></li>}
                <li><ShieldCheck size={16} aria-hidden="true"/><span>เห็นแค่พื้นที่โดยประมาณ ที่อยู่เต็มแสดงเมื่อลูกค้าเลือกคุณ</span></li>
              </ul>
              {!applied&&job.yourLines?.length?<details className="pr-details"><summary>ราคานี้คิดจากใบราคาของคุณ</summary><PriceBreakdown lines={job.yourLines}/></details>:null}
              {!applied&&clashes.length>0&&<p className={'ui-alert '+(hard?'is-problem':'is-wait')}><CalendarX2 size={18}/><span><strong>{hard?'เวลาชนกับงานที่รับไว้':'อาจชนกับงานที่รับไว้'}</strong> {clashes.map(item=>`${item.job.code} ${timeLabel(item.job)}`).join(', ')}</span></p>}
              {!applied&&!clashes.length&&dayCount>0&&<p className="jb-note">วันนั้นคุณมีงานแล้ว {dayCount} งาน</p>}
              {applied
                ?<p className="ui-alert is-done"><CheckCircle2 size={18}/><span><strong>ส่งข้อเสนอแล้ว</strong> ลูกค้าเห็นโปรไฟล์และราคาของคุณ ถ้าลูกค้าเลือกคุณจะมีแจ้งเตือนทันที</span></p>
                :lapsed?<button type="button" className="ui-btn is-lg is-block" onClick={onOpenMembership}>ต่ออายุสมาชิกเพื่อส่งข้อเสนอ</button>
                :confirming===job.id?<div className="jb-confirm" role="alertdialog" aria-label="ยืนยันส่งข้อเสนอทั้งที่เวลาชน">
                  <p>เวลาชนกับงานที่รับไว้ ยังจะส่งข้อเสนอไหม</p>
                  <div className="jb-confirm-actions"><button type="button" className="ui-btn is-primary is-lg" onClick={()=>{setConfirming(null);void apply(job.id);}} disabled={applyingId!==null}>ส่งเลย</button><button type="button" className="ui-btn is-lg" onClick={()=>setConfirming(null)}>ไม่ส่ง</button></div>
                </div>
                :<button type="button" className={'ui-btn is-lg is-block'+(job.id===lead?' is-primary':'')} onClick={()=>hard?setConfirming(job.id):void apply(job.id)} disabled={applyingId!==null||job.status==='ยืนยันแล้ว'} aria-busy={applyingId===job.id}>
                  {applyingId===job.id?'กำลังส่งข้อเสนอ…':<><Send size={19}/> ส่งข้อเสนอ <span className="ui-num">฿{quote.toLocaleString()}</span></>}
                </button>}
            </div>
          </li>;
        })}</ul>}
      <p className="nj-note"><MapPin size={16} aria-hidden="true"/><span>ระยะทางคิดจากตำแหน่ง GPS ของคุณถึงจุดใกล้บ้านลูกค้า (ไม่ใช่บ้านจริง) ส่งข้อเสนอแล้วยังไม่ใช่การรับงาน ลูกค้าเป็นผู้เลือกช่าง</span></p>
    </section>
  </div>;
}
