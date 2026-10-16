import HeroSection6 from '../components/ui/hero-section-6';
import BrandMark from '../components/BrandMark';
import { heroShots } from '../assets/hero';
import './CustomerExperience.css';
import { ArrowRight, Check, Wrench } from 'lucide-react';

type Start = (mode: 'login' | 'register', role?: 'customer' | 'technician' | 'manager') => void;

const services = [
  { name: 'ล้างแอร์มาตรฐาน', description: 'สำหรับการดูแลแอร์เป็นประจำ ระบุรายละเอียดเครื่องและวันเวลาที่สะดวก' },
  { name: 'ล้างแอร์ + ตรวจเช็ก', description: 'เพิ่มการตรวจเช็กระบบ แจ้งอาการหรือรายละเอียดให้ช่างทราบก่อนรับงาน' },
  { name: 'ล้างแอร์แบบแขวน', description: 'เลือกบริการให้ตรงกับชนิดแอร์ เพื่อให้ช่างประเมินราคาและเตรียมอุปกรณ์' },
];

const steps = [
  { title: 'บอกสิ่งที่ต้องการ', detail: 'ปักหมุด ระบุบริการ จำนวนเครื่อง และวันเวลาที่สะดวก' },
  { title: 'เลือกข้อเสนอที่ใช่', detail: 'ช่างใกล้เคียงส่งความสนใจ คุณเปรียบเทียบโปรไฟล์และราคาก่อนยืนยัน' },
  { title: 'ติดตามและรับบริการ', detail: 'ดูสถานะงานและตำแหน่งช่างขณะเดินทางเมื่อช่างแชร์ GPS' },
  { title: 'ยืนยันเมื่อจบงาน', detail: 'เก็บเงินปลายทาง จ่ายช่างเมื่อล้างเสร็จ ไม่ต้องจ่ายล่วงหน้า' },
];

const technicianPoints = [
  'กำหนดราคาเริ่มต้นของคุณเอง',
  'ดูจำนวนเครื่องและวันนัดก่อนสนใจงาน',
  'เห็นที่อยู่เต็มหลังลูกค้ายืนยัน',
  'บันทึกรายงานบริการหลังทำงาน',
];

/* Street grid shared by both privacy panels. */
function StreetGrid() {
  return <g className="acl-map-streets">
    <path d="M0 62 H320 M0 128 H320 M0 186 H320"/>
    <path d="M58 0 V220 M132 0 V220 M214 0 V220 M276 0 V220"/>
    <path className="acl-map-main" d="M0 160 C90 150 130 90 210 84 S300 40 320 30"/>
  </g>;
}

function PrivacyBefore() {
  return <svg viewBox="0 0 320 220" role="img" aria-label="แผนที่ที่แสดงเฉพาะพื้นที่โดยประมาณเป็นวงกลม ไม่มีหมุดบ้านเลขที่">
    <rect width="320" height="220" className="acl-map-ground"/>
    <StreetGrid/>
    <circle cx="170" cy="112" r="64" className="acl-map-area"/>
    <text x="170" y="116" textAnchor="middle" className="acl-map-label">พื้นที่โดยประมาณ</text>
  </svg>;
}

function PrivacyAfter() {
  return <svg viewBox="0 0 320 220" role="img" aria-label="แผนที่ที่แสดงหมุดตำแหน่งบ้านที่แน่นอน">
    <rect width="320" height="220" className="acl-map-ground"/>
    <StreetGrid/>
    <circle cx="170" cy="112" r="22" className="acl-map-pulse"/>
    <path className="acl-map-pin" d="M170 132 C158 116 150 108 150 96 a20 20 0 0 1 40 0 c0 12 -8 20 -20 36z"/>
    <circle cx="170" cy="96" r="7" className="acl-map-pin-dot"/>
  </svg>;
}

export default function LandingPage({ onStart }: { onStart: Start }) {
  return <div className="acl">
    <main>
      <HeroSection6 {...heroShots.landing}
        nav={<header className="hx-nav">
          <a className="hx-brand" href="#" aria-label="AirClean หน้าหลัก"><span className="hx-brand-mark"><BrandMark className="w-[82%] h-auto"/></span>AirClean</a>
          <nav className="hx-links" aria-label="เมนูหลัก"><a href="#services">บริการ</a><a href="#how">วิธีใช้งาน</a><a href="#partner">สำหรับช่างแอร์</a></nav>
          <div className="hx-nav-actions">
            <button type="button" className="hx-btn" onClick={() => onStart('login')}>เข้าสู่ระบบ</button>
            <button type="button" className="hx-btn is-primary" onClick={() => onStart('register', 'customer')}>สมัครใช้งาน</button>
          </div>
        </header>}
        badge="จ่ายเงินเมื่อล้างเสร็จ ไม่ต้องจ่ายล่วงหน้า"
        title={<>ช่างล้างแอร์ใกล้บ้าน<br/>เสนอราคาให้คุณเลือก</>}
        text="ส่งคำขอครั้งเดียว ช่างในพื้นที่ที่สนใจจะเสนอราคาและโปรไฟล์ให้คุณเปรียบเทียบ ก่อนตัดสินใจยืนยัน"
        primary={{ label: 'ขอช่างล้างแอร์', onClick: () => onStart('register', 'customer'), icon: ArrowRight, trailing: true }}
        secondary={{ label: 'สมัครเป็นช่าง', onClick: () => onStart('register', 'technician'), icon: Wrench }}/>

      <section id="services" className="acl-section acl-services" aria-labelledby="services-title">
        <div className="acl-head">
          <h2 id="services-title">เลือกบริการให้ตรงกับแอร์ของคุณ</h2>
          <p>ระบุจำนวนเครื่องและรายละเอียดตอนส่งคำขอ ราคาสุดท้ายคือข้อเสนอจากช่างที่คุณเลือก</p>
        </div>
        <ul className="acl-service-list">
          {services.map(({ name, description }) => <li key={name}>
            <button type="button" onClick={() => onStart('register', 'customer')}>
              <span className="acl-service-name">{name}</span>
              <span className="acl-service-desc">{description}</span>
              <span className="acl-service-go" aria-hidden="true"><ArrowRight size={20}/></span>
              <span className="acl-visually-hidden">ขอรับบริการนี้</span>
            </button>
          </li>)}
        </ul>
      </section>

      <section className="acl-section acl-privacy" aria-labelledby="privacy-title">
        <div className="acl-head">
          <h2 id="privacy-title">ที่อยู่ของคุณเปิดเผยเมื่อคุณเลือกช่างแล้วเท่านั้น</h2>
          <p>ระหว่างรอข้อเสนอ ช่างเห็นแค่พื้นที่โดยประมาณและระยะห่าง เมื่อคุณกดยืนยันช่างหนึ่งคน ช่างคนนั้นจึงเห็นที่อยู่เต็มเพื่อเดินทางมาหา</p>
        </div>
        <div className="acl-privacy-panels">
          <figure><PrivacyBefore/><figcaption><strong>ก่อนคุณเลือกช่าง</strong><span>ช่างเห็นย่านและระยะห่าง ไม่เห็นบ้านเลขที่</span></figcaption></figure>
          <figure><PrivacyAfter/><figcaption><strong>หลังคุณยืนยันช่าง</strong><span>ช่างที่คุณเลือกเห็นที่อยู่และตำแหน่งเต็ม</span></figcaption></figure>
        </div>
      </section>

      <section id="how" className="acl-section acl-how" aria-labelledby="how-title">
        <div className="acl-head">
          <h2 id="how-title">จากคำขอ ถึงแอร์ที่สะอาด</h2>
          <p>เริ่มได้เลยโดยไม่ต้องเลือกช่างล่วงหน้า หรือสร้างทะเบียนเครื่องแอร์ก่อน</p>
        </div>
        <ol className="acl-steps">
          {steps.map(({ title, detail }, index) => <li key={title}>
            <span className="acl-step-node">{index + 1}</span>
            <h3>{title}</h3>
            <p>{detail}</p>
          </li>)}
        </ol>
      </section>

      <section id="partner" className="acl-partner" aria-labelledby="partner-title">
        <div className="acl-partner-inner">
          <div>
            <h2 id="partner-title">คุณเป็นช่างแอร์?<br/>รับงานใกล้บ้านผ่าน AirClean</h2>
            <p>สร้างโปรไฟล์ กำหนดราคาและพื้นที่บริการ ค้นหางานใกล้ตัว แล้วส่งความสนใจให้ลูกค้าเลือก</p>
            <button type="button" className="hx-btn" onClick={() => onStart('register', 'technician')}>สมัครเป็นช่าง<ArrowRight size={18}/></button>
          </div>
          <ul>{technicianPoints.map(text => <li key={text}><Check size={20}/>{text}</li>)}</ul>
        </div>
      </section>
    </main>
    <footer className="acl-footer"><strong>AirClean</strong><span>ดูแลแอร์ ดูแลความสบายของคุณ</span><small><a href="/privacy.html">นโยบายความเป็นส่วนตัว</a> · <a href="/terms.html">ข้อกำหนดการใช้งาน</a> · © {new Date().getFullYear()} AirClean</small></footer>
  </div>;
}
