import { timeLabel } from '../lib/time';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, Navigation, RefreshCw, ShieldCheck, UserCog, Wind, Wrench } from 'lucide-react';
import type { Booking, TechnicianApplication } from '../types';
import { VerificationBanner } from '../components/TechnicianProfileSettings';
import StatusBadge from '../components/StatusBadge';
import { fetchMyMembership, fetchMyTechnicianProfile, fetchNearbyJobs } from '../lib/api';
import TechnicianDocuments from '../components/TechnicianDocuments';
import { MembershipStrip } from './MembershipPage';
import { clashesWith, sameDay } from '../lib/clash';
import type { Membership } from '../types';
import { CalendarX2 } from 'lucide-react';
import './Membership.css';
import HeroSection6 from '../components/ui/hero-section-6';
import { heroShots } from '../assets/hero';
import { ClipboardList, Search } from 'lucide-react';

interface Props { onApply:(bookingId:number)=>Promise<boolean>; onOpenProfile:()=>void; onOpenMembership:()=>void; onOpenMyJobs:()=>void; myJobs:Booking[]; }
function prettyDate(date:string) {
  return new Date(date+'T00:00:00').toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short'});
}
function messageOf(error:unknown) {
  return error instanceof Error?error.message:'โหลดงานใกล้เคียงไม่สำเร็จ';
}
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
  if(profileError)return <div className="page-stack"><div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{profileError}</span><button className="outline-button" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={15}/> ลองอีกครั้ง</button></div></div>;
  if(!profile)return <div className="page-stack"><section className="panel nearby-empty"><RefreshCw size={23}/><strong>กำลังตรวจสอบบัญชีช่าง</strong></section></div>;
  if(profile.verificationStatus!=='Approved')return <div className="page-stack">
    <div className="page-heading-row"><div><div className="eyebrow">LOCAL JOB MARKETPLACE</div><h1>งานใกล้ฉัน</h1><p className="page-subtitle">เพื่อความปลอดภัยของลูกค้า ผู้ดูแลระบบตรวจสอบช่างทุกคนก่อนเปิดให้เห็นงานและส่งข้อเสนอ</p></div></div>
    <VerificationBanner profile={profile}/>
    <TechnicianDocuments/>
    <button type="button" className="primary-button" onClick={onOpenProfile}><UserCog size={16}/> {profile.verificationStatus==='Rejected'?'แก้ไขข้อมูลและส่งตรวจอีกครั้ง':'ตรวจข้อมูลโปรไฟล์ของฉัน'}</button>
  </div>;
  return <NearbyJobs onApply={onApply} onOpenMembership={onOpenMembership} onOpenMyJobs={onOpenMyJobs} myJobs={myJobs}/>;
}

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
  const [locationLabel,setLocationLabel]=useState('กำลังขอตำแหน่ง');

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
      setLocationLabel('ค้นหางานในรัศมี '+radiusKm+' กม.');
      setJobs(found);
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
  return <div className="page-stack">
    <HeroSection6 variant="app" {...heroShots.technician}
      turn={open>0}
      badge={loading&&!jobs.length?'กำลังค้นหางานใกล้คุณ…':error?'ยังหาตำแหน่งของคุณไม่ได้':open>0?`มี ${open} งานใหม่ในระยะ ${radiusKm} กม.`:`ยังไม่มีงานใหม่ในระยะ ${radiusKm} กม.`}
      title="งานล้างแอร์ใกล้คุณ"
      text="ดูประเภทที่พัก จำนวนเครื่อง ระยะทาง และราคาประเมินก่อนตัดสินใจ ลูกค้าเป็นคนเลือกช่าง ที่อยู่เต็มจะแสดงเมื่อลูกค้ายืนยันคุณ"
      primary={{label:'ดูงานใกล้ฉัน',icon:Search,onClick:()=>document.getElementById('nearby-list')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}}
      secondary={{label:'งานของฉัน',icon:ClipboardList,onClick:onOpenMyJobs}}/>
    <div className="page-heading-row" id="nearby-list" style={{scrollMarginTop:96}}>
      <div><h1>งานใกล้ฉัน</h1><p className="page-subtitle">ดูประเภทที่พัก จำนวนเครื่อง ระยะทาง และราคาประเมินก่อนส่งความสนใจรับงาน ลูกค้าจะเป็นผู้เลือกช่างขั้นสุดท้าย</p></div>
      <button className="outline-button" onClick={()=>void loadNearby()} disabled={loading}><RefreshCw size={15}/> {loading?'กำลังค้นหา...':'ค้นหาใหม่'}</button>
    </div>
    <div className="nearby-job-toolbar">
      <div className="nearby-location-status"><MapPin size={17}/><div><strong>{locationLabel}</strong><span>ระบบใช้ตำแหน่ง GPS ของคุณเพื่อคำนวณระยะทาง</span></div></div>
      <label className="select-control"><Navigation size={15}/><span>ระยะค้นหา</span><select value={radiusKm} onChange={event=>setRadiusKm(Number(event.target.value))}><option value={5}>5 กม.</option><option value={10}>10 กม.</option><option value={25}>25 กม.</option><option value={50}>50 กม.</option><option value={100}>100 กม.</option></select></label>
    </div>
    {membership&&<MembershipStrip data={membership} onOpen={onOpenMembership}/>}
    {error&&<div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={()=>void loadNearby()}><RefreshCw size={15}/> ลองอีกครั้ง</button></div>}
    {!error&&<div className="nearby-results-line"><strong>{jobs.length} งาน</strong><span>ที่อยู่ในระยะค้นหาปัจจุบัน · เรียงจากใกล้ไปไกล</span></div>}
    {loading&&jobs.length===0?<section className="panel nearby-empty"><RefreshCw size={23}/><strong>กำลังค้นหางานในบริเวณใกล้เคียง</strong><span>โปรดอนุญาตการเข้าถึงตำแหน่งเมื่อเบราว์เซอร์ร้องขอ</span></section>:
      jobs.length===0&&!error?<section className="panel nearby-empty"><Wind size={26}/><strong>ยังไม่มีงานในระยะนี้</strong><span>ลองขยายระยะค้นหา หรือกลับมาตรวจสอบอีกครั้งเมื่อมีคำขอใหม่</span></section>:
      <div className="nearby-job-grid">{jobs.map(job=>{
        const applied=Boolean(job.currentTechnicianApplied);
        const clashes=clashesWith(job,myJobs);
        const hard=clashes.some(item=>!item.soft);
        const dayCount=sameDay(job.date,myJobs);
        return <article className="nearby-job-card" key={job.id}>
          <div className="nearby-job-card-top"><span className="booking-code">{job.code}</span><StatusBadge status={job.status}/></div>
          <h2>{job.service}</h2>
          <div className="nearby-job-distance"><MapPin size={15}/><strong>{job.distanceKm==null?'ระยะทางไม่ทราบ':'ประมาณ '+Math.round(job.distanceKm)+' กม.'}</strong><span>จากตำแหน่งคุณ</span></div>
          <div className="nearby-job-facts">
            <div><span>ประเภทที่พัก</span><strong>{job.propertyType||'ไม่ระบุ'}</strong></div>
            <div><span>จำนวนแอร์</span><strong>{job.unitCount||1} เครื่อง</strong></div>
            <div><span>วันและเวลา</span><strong>{prettyDate(job.date)} · {timeLabel(job)}</strong></div>
          </div>
          <div className="nearby-job-description"><Wrench size={15}/><span>{job.unitLabel}</span></div>
          <div className="nearby-job-privacy"><ShieldCheck size={14}/><span>แสดงเฉพาะพื้นที่โดยประมาณ ที่อยู่เต็มจะแสดงหลังลูกค้ายืนยันช่าง</span></div>
          <div className="nearby-job-price"><div><span>ราคาประเมินเริ่มต้น</span><strong>฿{job.price.toLocaleString()}</strong></div><small>{job.applicants?.length||0} ช่างสนใจแล้ว</small></div>
          {!applied&&clashes.length>0&&<p className={'clash-note'+(hard?' hard':'')}><CalendarX2 size={16}/><span><strong>{hard?'เวลาชนกับงานที่รับไว้':'อาจชนกับงานที่รับไว้'}</strong> {clashes.map(item=>`${item.job.code} ${timeLabel(item.job)}`).join(', ')}</span></p>}
          {!applied&&!clashes.length&&dayCount>0&&<p className="nearby-day-count">วันนั้นคุณมีงานแล้ว {dayCount} งาน</p>}
          {applied?<div className="nearby-applied-state"><CheckCircle2 size={17}/><div><strong>ส่งความสนใจแล้ว</strong><span>ลูกค้าจะเห็นโปรไฟล์และราคาที่คุณเสนอเพื่อใช้ตัดสินใจ</span></div></div>:
          lapsed?<button className="outline-button full-width" onClick={onOpenMembership}>ต่ออายุสมาชิกเพื่อส่งข้อเสนอ</button>:
          confirming===job.id?<div className="nearby-confirm"><span>ยืนยันส่งข้อเสนอทั้งที่เวลาชน?</span><button className="primary-button" onClick={()=>{setConfirming(null);void apply(job.id);}} disabled={applyingId!==null}>ส่งเลย</button><button className="outline-button" onClick={()=>setConfirming(null)}>ไม่ส่ง</button></div>:
          <button className="primary-button full-width" onClick={()=>hard?setConfirming(job.id):void apply(job.id)} disabled={applyingId!==null || job.status==='ยืนยันแล้ว'}>{applyingId===job.id?'กำลังส่งความสนใจ...':'สนใจรับงานนี้'} <Navigation size={15}/></button>}
        </article>;
      })}</div>}
    <div className="nearby-market-note"><ShieldCheck size={18}/><div><strong>ลูกค้าเป็นผู้ยืนยันช่างก่อนเริ่มงาน</strong><span>การส่งความสนใจยังไม่ถือว่าได้รับมอบหมายงาน และยังไม่เปิดเผยบ้านเลขที่หรือพิกัดปลายทางจนกว่าลูกค้าจะเลือกคุณ</span></div></div>
  </div>;
}