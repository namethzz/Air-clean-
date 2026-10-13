import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, Navigation, RefreshCw, ShieldCheck, Wind, Wrench } from 'lucide-react';
import type { Booking } from '../types';
import StatusBadge from '../components/StatusBadge';
import { fetchNearbyJobs } from '../lib/api';

interface Props { onApply:(bookingId:number)=>Promise<boolean>; }
function prettyDate(date:string) {
  return new Date(date+'T00:00:00').toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short'});
}
function messageOf(error:unknown) {
  return error instanceof Error?error.message:'โหลดงานใกล้เคียงไม่สำเร็จ';
}
export default function NearbyJobsPage({onApply}:Props) {
  const [jobs,setJobs]=useState<Booking[]>([]);
  const [radiusKm,setRadiusKm]=useState(25);
  const [loading,setLoading]=useState(false);
  const [applyingId,setApplyingId]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [locationLabel,setLocationLabel]=useState('กำลังขอตำแหน่ง');

  const loadNearby=useCallback(async()=>{
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
      setLocationLabel('ค้นหางานในรัศมี '+radiusKm+' กม.');
      setJobs(await fetchNearbyJobs(coords.latitude,coords.longitude,radiusKm));
    } catch (err) { setError(messageOf(err)); }
    finally { setLoading(false); }
  },[radiusKm]);

  useEffect(()=>{void loadNearby();},[loadNearby]);

  async function apply(jobId:number) {
    setApplyingId(jobId);
    const success=await onApply(jobId);
    setApplyingId(null);
    if(success) void loadNearby();
  }

  return <div className="page-stack">
    <div className="page-heading-row">
      <div><div className="eyebrow">LOCAL JOB MARKETPLACE</div><h1>งานใกล้ฉัน</h1><p className="page-subtitle">ดูประเภทที่พัก จำนวนเครื่อง ระยะทาง และราคาประเมินก่อนส่งความสนใจรับงาน ลูกค้าจะเป็นผู้เลือกช่างขั้นสุดท้าย</p></div>
      <button className="outline-button" onClick={()=>void loadNearby()} disabled={loading}><RefreshCw size={15}/> {loading?'กำลังค้นหา...':'ค้นหาใหม่'}</button>
    </div>
    <div className="nearby-job-toolbar">
      <div className="nearby-location-status"><MapPin size={17}/><div><strong>{locationLabel}</strong><span>ระบบใช้ตำแหน่ง GPS ของคุณเพื่อคำนวณระยะทาง</span></div></div>
      <label className="select-control"><Navigation size={15}/><span>ระยะค้นหา</span><select value={radiusKm} onChange={event=>setRadiusKm(Number(event.target.value))}><option value={5}>5 กม.</option><option value={10}>10 กม.</option><option value={25}>25 กม.</option><option value={50}>50 กม.</option><option value={100}>100 กม.</option></select></label>
    </div>
    {error&&<div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={()=>void loadNearby()}><RefreshCw size={15}/> ลองอีกครั้ง</button></div>}
    {!error&&<div className="nearby-results-line"><strong>{jobs.length} งาน</strong><span>ที่อยู่ในระยะค้นหาปัจจุบัน · เรียงจากใกล้ไปไกล</span></div>}
    {loading&&jobs.length===0?<section className="panel nearby-empty"><RefreshCw size={23}/><strong>กำลังค้นหางานในบริเวณใกล้เคียง</strong><span>โปรดอนุญาตการเข้าถึงตำแหน่งเมื่อเบราว์เซอร์ร้องขอ</span></section>:
      jobs.length===0&&!error?<section className="panel nearby-empty"><Wind size={26}/><strong>ยังไม่มีงานในระยะนี้</strong><span>ลองขยายระยะค้นหา หรือกลับมาตรวจสอบอีกครั้งเมื่อมีคำขอใหม่</span></section>:
      <div className="nearby-job-grid">{jobs.map(job=>{
        const applied=Boolean(job.currentTechnicianApplied);
        return <article className="nearby-job-card" key={job.id}>
          <div className="nearby-job-card-top"><span className="booking-code">{job.code}</span><StatusBadge status={job.status}/></div>
          <h2>{job.service}</h2>
          <div className="nearby-job-distance"><MapPin size={15}/><strong>{job.distanceKm==null?'ระยะทางไม่ทราบ':job.distanceKm.toFixed(1)+' กม.'}</strong><span>จากตำแหน่งคุณ</span></div>
          <div className="nearby-job-facts">
            <div><span>ประเภทที่พัก</span><strong>{job.propertyType||'ไม่ระบุ'}</strong></div>
            <div><span>จำนวนแอร์</span><strong>{job.unitCount||1} เครื่อง</strong></div>
            <div><span>วันและเวลา</span><strong>{prettyDate(job.date)} · {job.time} น.</strong></div>
          </div>
          <div className="nearby-job-description"><Wrench size={15}/><span>{job.unitLabel}</span></div>
          <div className="nearby-job-privacy"><ShieldCheck size={14}/><span>แสดงเฉพาะพื้นที่โดยประมาณ ที่อยู่เต็มจะแสดงหลังลูกค้ายืนยันช่าง</span></div>
          <div className="nearby-job-price"><div><span>ราคาประเมินเริ่มต้น</span><strong>฿{job.price.toLocaleString()}</strong></div><small>{job.applicants?.length||0} ช่างสนใจแล้ว</small></div>
          {applied?<div className="nearby-applied-state"><CheckCircle2 size={17}/><div><strong>ส่งความสนใจแล้ว</strong><span>ลูกค้าจะเห็นโปรไฟล์และราคาที่คุณเสนอเพื่อใช้ตัดสินใจ</span></div></div>:
          <button className="primary-button full-width" onClick={()=>void apply(job.id)} disabled={applyingId!==null || job.status==='ยืนยันแล้ว'}>{applyingId===job.id?'กำลังส่งความสนใจ...':'สนใจรับงานนี้'} <Navigation size={15}/></button>}
        </article>;
      })}</div>}
    <div className="nearby-market-note"><ShieldCheck size={18}/><div><strong>ลูกค้าเป็นผู้ยืนยันช่างก่อนเริ่มงาน</strong><span>การส่งความสนใจยังไม่ถือว่าได้รับมอบหมายงาน และยังไม่เปิดเผยบ้านเลขที่หรือพิกัดปลายทางจนกว่าลูกค้าจะเลือกคุณ</span></div></div>
  </div>;
}