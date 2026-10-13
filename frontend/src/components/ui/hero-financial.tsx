import { useRef } from 'react';
import { ArrowRight, ChevronRight, MapPin, ShieldCheck, Sparkles, Wind } from 'lucide-react';
import { TimelineAnimation } from '@/components/ui/hero-financial-utils/timeline-animation';
import { AirCleaningPhoto } from '@/components/ui/hero-financial-utils/assets-index';
import { useMediaQuery } from '@/components/ui/hero-financial-utils/use-media-query';
import MotionDrawer from '@/components/ui/hero-financial-utils/motion-drawer';
import './hero-financial.css';
interface Props { compact?:boolean; userName?:string; onStart:()=>void; onLogin?:()=>void; onTechnician?:()=>void; onBookings?:()=>void; }
export function HeroFinancial({compact=false,userName,onStart,onLogin,onTechnician,onBookings}:Props){
 const timelineRef=useRef<HTMLDivElement>(null);const isMobile=useMediaQuery('(max-width: 768px)');
 const nav=<nav aria-label="เมนูเว็บไซต์"><a href="#services">บริการของเรา</a><a href="#how">วิธีใช้งาน</a><button onClick={onTechnician}>สำหรับช่างแอร์</button></nav>;
 return <section ref={timelineRef} className={`ac-financial-hero relative overflow-hidden ${compact?'ac-hero-compact':''}`}>
  <div className="ac-hero-glow" aria-hidden="true"/><div className="ac-hero-grid" aria-hidden="true"/>
  {!compact&&<header className="ac-hero-nav"><a className="ac-wordmark" href="#" aria-label="AirClean หน้าหลัก"><span><Wind size={24}/></span>AirClean<i>.</i></a>{isMobile?<MotionDrawer>{nav}</MotionDrawer>:nav}<button className="ac-dark-button" onClick={onLogin}>เข้าสู่ระบบ<ChevronRight size={16}/></button></header>}
  <div className="ac-hero-copy">
   <TimelineAnimation animationNum={1} className="ac-hero-pill"><span><Sparkles size={12}/> AIRCLEAN</span>{compact?`ยินดีต้อนรับ ${userName}`:'ความสบาย เริ่มจากอากาศที่ดี'}</TimelineAnimation>
   <TimelineAnimation as="h1" animationNum={2}>แอร์สะอาดขึ้น<br/><span>บ้านก็สบายขึ้น.</span></TimelineAnimation>
   <TimelineAnimation as="p" animationNum={3} className="ac-hero-description">หาช่างล้างแอร์ใกล้บ้าน เปรียบเทียบข้อเสนอ<br className="ac-desktop-break"/>แล้วเลือกคนที่ใช่ ดูแลทุกนัดหมายได้ในที่เดียว</TimelineAnimation>
   <TimelineAnimation animationNum={4} className="ac-hero-actions"><button className="ac-blue-button" onClick={onStart}>จองช่างล้างแอร์<ArrowRight size={18}/></button>{compact?<button className="ac-light-button" onClick={onBookings}>ดูนัดหมายของฉัน<ChevronRight size={16}/></button>:<a className="ac-light-button" href="#how">ดูวิธีใช้งาน<ChevronRight size={16}/></a>}</TimelineAnimation>
   <TimelineAnimation animationNum={5} className="ac-hero-assurance"><ShieldCheck size={15}/> เลือกช่างเอง · ชำระหลังบริการ · ที่อยู่เปิดเผยเฉพาะช่างที่เลือก</TimelineAnimation>
  </div>
  <TimelineAnimation animationNum={6} className="ac-photo-frame"><img src={AirCleaningPhoto.src} alt="ช่างสวมถุงมือกำลังถอดแผ่นกรองเพื่อทำความสะอาดเครื่องปรับอากาศ" className="ac-cleaning-photo" fetchPriority="high"/><div className="ac-photo-shade"/><div className="ac-photo-caption"><span>GOOD AIR. BETTER DAYS.</span><strong>ดูแลเรื่องแอร์<br/>ให้เป็นเรื่องง่าย</strong></div><div className="ac-photo-card"><span className="ac-photo-card-icon"><MapPin size={21}/></span><div><strong>ช่างใกล้คุณ พร้อมดูแล</strong><p>ส่งคำขอ แล้วเลือกข้อเสนอด้วยตัวเอง</p></div><span className="ac-photo-card-check"><ShieldCheck size={19}/></span></div></TimelineAnimation>
 </section>;
}
export default HeroFinancial;
