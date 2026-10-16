import { ArrowRight, BadgeCheck, Check, MapPinned, Star, Wallet, Wrench } from 'lucide-react';
import HeroSection6 from '../components/ui/hero-section-6';
import BrandMark from '../components/BrandMark';
import { heroShots } from '../assets/hero';
import inspectPhoto from '../assets/hero/photo-inspect.webp';
import maskPhoto from '../assets/hero/photo-mask.webp';
import './Landing.css';

type Start = (mode: 'login' | 'register', role?: 'customer' | 'technician' | 'manager') => void;
type AcKind = 'wall' | 'hanging' | 'cassette';

const services: { kind: AcKind; name: string; description: string }[] = [
  { kind: 'wall', name: 'ล้างแอร์มาตรฐาน', description: 'แอร์ติดผนังแบบที่บ้านและคอนโดส่วนใหญ่ใช้ เหมาะกับการล้างตามรอบทุก 6 เดือน' },
  { kind: 'hanging', name: 'ล้างแอร์แบบแขวน / ตั้งพื้น', description: 'แอร์ตัวใหญ่ในร้านหรือห้องโถง ช่างเตรียมอุปกรณ์ให้ตรงกับชนิดแอร์ก่อนเข้างาน' },
  { kind: 'cassette', name: 'ล้างแอร์ฝังฝ้า 4 ทิศทาง', description: 'แอร์ที่อยู่ในฝ้าเพดาน ลมออก 4 ด้าน บอกจำนวนเครื่องตอนส่งคำขอ ช่างประเมินราคาให้' },
];

const steps = [
  { title: 'บอกสิ่งที่ต้องการ', detail: 'ปักหมุดที่อยู่ เลือกชนิดแอร์ จำนวนเครื่อง และวันเวลาที่สะดวก ใช้เวลาไม่ถึงนาที' },
  { title: 'เลือกข้อเสนอที่ใช่', detail: 'ช่างใกล้บ้านส่งราคาและโปรไฟล์มาให้ คุณเปรียบเทียบคะแนนและราคาก่อนยืนยัน' },
  { title: 'ติดตามช่าง', detail: 'ดูสถานะงาน และตำแหน่งช่างระหว่างเดินทางเมื่อช่างแชร์ GPS' },
  { title: 'จ่ายเมื่อล้างเสร็จ', detail: 'จ่ายเงินสดหรือโอนให้ช่างโดยตรง ไม่ต้องจ่ายล่วงหน้า แล้วให้คะแนนช่าง' },
];

const trust = [
  { icon: BadgeCheck, title: 'ช่างผ่านการตรวจก่อนรับงาน', text: 'ผู้ดูแลระบบตรวจเอกสารยืนยันตัวตนของช่างทุกคนก่อนเปิดให้เห็นงานและเสนอราคา' },
  { icon: Star, title: 'เห็นคะแนนก่อนเลือก', text: 'ทุกข้อเสนอมีคะแนนและจำนวนงานของช่างจากลูกค้าที่ใช้บริการจริง' },
  { icon: MapPinned, title: 'ที่อยู่เปิดเผยเมื่อคุณเลือกแล้ว', text: 'ระหว่างรอข้อเสนอ ช่างเห็นแค่ย่านและระยะห่าง ไม่เห็นบ้านเลขที่' },
  { icon: Wallet, title: 'จ่ายให้ช่างเมื่อเสร็จงาน', text: 'เก็บเงินปลายทาง เลือกจ่ายเงินสดหรือโอน และขอใบเสร็จได้ในแอป' },
];

const technicianPoints = [
  'กำหนดราคาเริ่มต้นของคุณเอง',
  'เห็นจำนวนเครื่อง ระยะทาง และวันนัดก่อนเสนอราคา',
  'ที่อยู่เต็มแสดงหลังลูกค้ายืนยันคุณ',
  'ดูตารางงานแต่ละวันในมือถือเครื่องเดียว',
];

/** Simple drawings so people can match the unit on their wall or ceiling (the same as the request form). */
function AcIcon({ kind }: { kind: AcKind }) {
  return <svg className="ld-ac" viewBox="0 0 64 40" aria-hidden="true">
    {kind === 'wall' && <><rect x="6" y="10" width="52" height="18" rx="5"/><path d="M12 23h40"/></>}
    {kind === 'hanging' && <><path d="M4 6h56"/><rect x="8" y="9" width="48" height="20" rx="4"/><path d="M14 24h36M14 19h36"/></>}
    {kind === 'cassette' && <><path d="M4 8h56"/><rect x="14" y="8" width="36" height="20" rx="2"/><rect x="22" y="13" width="20" height="10" rx="1"/></>}
  </svg>;
}

/** A small street map: the area only before a technician is chosen, the exact pin after. */
function PrivacyMap({ exact }: { exact?: boolean }) {
  return <svg className="ld-map" viewBox="0 0 320 200" role="img" aria-label={exact ? 'แผนที่แสดงหมุดบ้านที่แน่นอน' : 'แผนที่แสดงเฉพาะพื้นที่โดยประมาณ ไม่มีหมุดบ้าน'}>
    <rect width="320" height="200" className="ld-map-ground"/>
    <g className="ld-map-streets"><path d="M0 58 H320 M0 120 H320 M0 172 H320"/><path d="M56 0 V200 M130 0 V200 M212 0 V200 M274 0 V200"/></g>
    <path className="ld-map-main" d="M0 150 C90 140 130 84 210 78 S300 36 320 28"/>
    {exact
      ? <><circle cx="170" cy="104" r="24" className="ld-map-halo"/><path className="ld-map-pin" d="M170 126 C158 110 150 102 150 90 a20 20 0 0 1 40 0 c0 12 -8 20 -20 36z"/><circle cx="170" cy="90" r="7" fill="#fff"/></>
      : <><circle cx="170" cy="100" r="58" className="ld-map-area"/><text x="170" y="105" textAnchor="middle" className="ld-map-label">พื้นที่โดยประมาณ</text></>}
  </svg>;
}

export default function LandingPage({ onStart }: { onStart: Start }) {
  const book = () => onStart('register', 'customer');
  return <div className="ld">
    <HeroSection6 {...heroShots.landing}
      nav={<header className="hx-nav">
        <a className="hx-brand" href="#" aria-label="AirClean หน้าหลัก"><span className="hx-brand-mark"><BrandMark className="w-[82%] h-auto"/></span>AirClean</a>
        <nav className="hx-links" aria-label="เมนูหลัก"><a href="#services">บริการ</a><a href="#how">วิธีใช้งาน</a><a href="#partner">สำหรับช่างแอร์</a></nav>
        <div className="hx-nav-actions">
          <button type="button" className="hx-btn" onClick={() => onStart('login')}>เข้าสู่ระบบ</button>
          <button type="button" className="hx-btn is-primary" onClick={book}>สมัครใช้งาน</button>
        </div>
      </header>}
      badge="จ่ายเงินเมื่อล้างเสร็จ ไม่ต้องจ่ายล่วงหน้า"
      title={<>ช่างล้างแอร์ใกล้บ้าน<br/>เสนอราคาให้คุณเลือก</>}
      text="ส่งคำขอครั้งเดียว ช่างในพื้นที่ที่สนใจจะเสนอราคาและโปรไฟล์ให้คุณเปรียบเทียบ ก่อนตัดสินใจยืนยัน"
      primary={{ label: 'ขอช่างล้างแอร์', onClick: book, icon: ArrowRight, trailing: true }}
      secondary={{ label: 'สมัครเป็นช่าง', onClick: () => onStart('register', 'technician'), icon: Wrench }}/>

    <main>
      <section id="services" className="ld-section" aria-labelledby="ld-services">
        <header className="ld-head">
          <h2 id="ld-services">เลือกบริการให้ตรงกับแอร์ของคุณ</h2>
          <p>ไม่แน่ใจว่าแอร์เป็นแบบไหน ดูจากรูปได้เลย ราคาสุดท้ายคือข้อเสนอจากช่างที่คุณเลือกเอง</p>
        </header>
        <ul className="ld-services">
          {services.map(item => <li key={item.kind}>
            <button type="button" className="ld-service" onClick={book}>
              <span className="ld-service-art"><AcIcon kind={item.kind}/></span>
              <strong>{item.name}</strong>
              <span className="ld-service-text">{item.description}</span>
              <span className="ld-service-go">ขอช่างสำหรับบริการนี้ <ArrowRight size={18} aria-hidden="true"/></span>
            </button>
          </li>)}
        </ul>
      </section>

      <section id="how" className="ld-section ld-how" aria-labelledby="ld-how">
        <header className="ld-head">
          <h2 id="ld-how">จากคำขอ ถึงแอร์ที่เย็นสบาย</h2>
          <p>ไม่ต้องหาช่างเอง ไม่ต้องโทรถามราคาทีละร้าน</p>
        </header>
        <ol className="ld-steps">
          {steps.map((step, index) => <li key={step.title}>
            <span className="ld-step-num" aria-hidden="true">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
          </li>)}
        </ol>
        <button type="button" className="hx-btn is-primary ld-center" onClick={book}>เริ่มส่งคำขอ <ArrowRight size={20} aria-hidden="true"/></button>
      </section>

      <section className="ld-section ld-trust" aria-labelledby="ld-trust">
        <figure className="ld-trust-photo"><img src={inspectPhoto} alt="ช่างแอร์ถือแฟ้มตรวจเช็กแอร์ติดผนัง" loading="lazy" decoding="async"/></figure>
        <div className="ld-trust-body">
          <h2 id="ld-trust">มั่นใจได้ ก่อนเปิดประตูให้ช่าง</h2>
          <ul className="ld-trust-list">
            {trust.map(({ icon: Icon, title, text }) => <li key={title}>
              <span className="ld-trust-icon" aria-hidden="true"><Icon size={22}/></span>
              <div><strong>{title}</strong><p>{text}</p></div>
            </li>)}
          </ul>
        </div>
      </section>

      <section className="ld-section" aria-labelledby="ld-privacy">
        <header className="ld-head">
          <h2 id="ld-privacy">ที่อยู่ของคุณเปิดเผยเมื่อคุณเลือกช่างแล้วเท่านั้น</h2>
          <p>เมื่อคุณกดยืนยันช่างหนึ่งคน ช่างคนนั้นจึงเห็นที่อยู่เต็มเพื่อเดินทางมาหา</p>
        </header>
        <div className="ld-privacy">
          <figure><PrivacyMap/><figcaption><strong>ก่อนคุณเลือกช่าง</strong><span>ช่างเห็นย่านและระยะห่าง ไม่เห็นบ้านเลขที่</span></figcaption></figure>
          <figure><PrivacyMap exact/><figcaption><strong>หลังคุณยืนยันช่าง</strong><span>ช่างที่คุณเลือกเห็นที่อยู่และตำแหน่งเต็ม</span></figcaption></figure>
        </div>
      </section>

      <section id="partner" className="ld-partner" aria-labelledby="ld-partner">
        <div className="ld-partner-inner">
          <div className="ld-partner-body">
            <h2 id="ld-partner">รับงานล้างแอร์ใกล้บ้าน<br/>ในราคาที่คุณกำหนด</h2>
            <ul>{technicianPoints.map(text => <li key={text}><Check size={20} strokeWidth={2.6} aria-hidden="true"/>{text}</li>)}</ul>
            <button type="button" className="ld-partner-cta" onClick={() => onStart('register', 'technician')}>สมัครเป็นช่าง <ArrowRight size={20} aria-hidden="true"/></button>
          </div>
          <figure className="ld-partner-photo"><img src={maskPhoto} alt="ช่างแอร์สวมหน้ากากกำลังถอดแผ่นกรองแอร์" loading="lazy" decoding="async"/></figure>
        </div>
      </section>

      <section className="ld-final" aria-labelledby="ld-final">
        <h2 id="ld-final">ให้แอร์กลับมาเย็นสบายอีกครั้ง</h2>
        <p>ส่งคำขอวันนี้ แล้วเลือกช่างจากข้อเสนอที่ส่งมาให้คุณ</p>
        <div className="hx-actions">
          <button type="button" className="hx-btn is-primary" onClick={book}>ขอช่างล้างแอร์ <ArrowRight size={20} aria-hidden="true"/></button>
          <button type="button" className="hx-btn" onClick={() => onStart('login')}>เข้าสู่ระบบ</button>
        </div>
      </section>
    </main>

    <footer className="ld-foot">
      <div className="ld-foot-inner">
        <span className="hx-brand"><span className="hx-brand-mark"><BrandMark className="w-[82%] h-auto"/></span>AirClean</span>
        <span>ช่างล้างแอร์ใกล้บ้าน เสนอราคาให้คุณเลือก</span>
        <small><a href="/privacy.html">นโยบายความเป็นส่วนตัว</a> · <a href="/terms.html">ข้อกำหนดการใช้งาน</a> · © {new Date().getFullYear()} AirClean</small>
      </div>
    </footer>
  </div>;
}
