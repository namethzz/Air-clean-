import { ArrowRight, ChevronRight, MapPin, ShieldCheck, UserCheck, Wind } from 'lucide-react';
import { AirCleaningPhoto } from '@/components/ui/hero-financial-utils/assets-index';
import { useMediaQuery } from '@/components/ui/hero-financial-utils/use-media-query';
import MotionDrawer from '@/components/ui/hero-financial-utils/motion-drawer';
import './hero-financial.css';

interface Props {
  compact?:boolean; userName?:string;
  /** Compact (signed-in) variant: override the role-neutral defaults. */
  heading?:string; description?:string; primaryLabel?:string; secondaryLabel?:string;
  /** Short label above the heading, and whether to show the photo (default true). */
  eyebrow?:string; withPhoto?:boolean;
  onStart:()=>void; onLogin?:()=>void; onTechnician?:()=>void; onBookings?:()=>void;
}

const photoAlt='ช่างสวมถุงมือสีฟ้ากำลังถอดแผ่นกรองเพื่อทำความสะอาดเครื่องปรับอากาศ';
const facts=[
  {icon:UserCheck,title:'เลือกช่างด้วยตัวเอง',text:'เปรียบเทียบโปรไฟล์และราคา แล้วกดยืนยันคนที่ใช่'},
  {icon:MapPin,title:'ช่างใกล้บ้านคุณ',text:'ส่งคำขอครั้งเดียว ถึงช่างในพื้นที่ใกล้เคียง'},
  {icon:ShieldCheck,title:'ที่อยู่ปลอดภัย',text:'เฉพาะช่างที่คุณเลือกเท่านั้นที่เห็นที่อยู่เต็ม'},
];

export function HeroFinancial({compact=false,userName,heading,description,primaryLabel,secondaryLabel,eyebrow,withPhoto=true,onStart,onLogin,onTechnician,onBookings}:Props){
  const isMobile=useMediaQuery('(max-width: 768px)');

  if(compact){
    return <section className={'acx-compact'+(withPhoto?'':' acx-compact--text')} aria-label={heading??'ขอช่างล้างแอร์'}>
      <div className="acx-compact-copy">
        {eyebrow&&<span className="acx-eyebrow">{eyebrow}</span>}
        <h1>{heading??`สวัสดี ${userName??''}`.trim()}</h1>
        <p>{description??'ส่งคำขอครั้งเดียว แล้วเลือกช่างจากข้อเสนอที่ส่งมาให้คุณ'}</p>
        <div className="acx-actions">
          <button type="button" className="acx-btn acx-btn-light" onClick={onStart}>{primaryLabel??'ขอช่างล้างแอร์'}<ArrowRight size={18}/></button>
          {onBookings&&<button type="button" className="acx-btn acx-btn-ghost-light" onClick={onBookings}>{secondaryLabel??'ดูนัดหมายของฉัน'}<ChevronRight size={16}/></button>}
        </div>
      </div>
      {withPhoto&&<div className="acx-compact-photo"><img src={AirCleaningPhoto.src} alt={photoAlt}/></div>}
    </section>;
  }

  const nav=<nav aria-label="เมนูเว็บไซต์"><a href="#services">บริการ</a><a href="#how">วิธีใช้งาน</a><button type="button" onClick={onTechnician}>สำหรับช่างแอร์</button></nav>;
  return <section className="acx-hero">
    <header className="acx-nav">
      <a className="acx-wordmark" href="#" aria-label="AirClean หน้าหลัก"><span className="acx-wordmark-mark"><Wind size={21}/></span>AirClean</a>
      {isMobile?<MotionDrawer>{nav}</MotionDrawer>:nav}
      <button type="button" className="acx-btn acx-btn-ink acx-nav-login" onClick={onLogin}>เข้าสู่ระบบ</button>
    </header>
    <div className="acx-hero-body">
      <h1>ช่างล้างแอร์ใกล้บ้าน<br/>เสนอราคาให้คุณเลือก</h1>
      <div className="acx-hero-side">
        <p>ส่งคำขอครั้งเดียว ช่างในพื้นที่ที่สนใจจะเสนอราคาและโปรไฟล์ให้คุณเปรียบเทียบ ก่อนตัดสินใจยืนยัน</p>
        <div className="acx-actions">
          <button type="button" className="acx-btn acx-btn-blue" onClick={onStart}>ขอช่างล้างแอร์<ArrowRight size={18}/></button>
          <a className="acx-link" href="#how">ดูวิธีใช้งาน</a>
        </div>
      </div>
    </div>
    <figure className="acx-photo"><img src={AirCleaningPhoto.src} alt={photoAlt} fetchPriority="high"/></figure>
    <ul className="acx-facts">{facts.map(({icon:Icon,title,text})=><li key={title}><span className="acx-fact-icon"><Icon size={20}/></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ul>
  </section>;
}
export default HeroFinancial;
