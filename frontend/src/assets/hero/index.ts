/** Screens of AirClean itself, shown in the opening of each role's first page (hero-section-6). */
import landingDesk from './landing-desk.webp';
import landingPhone from './landing-phone.webp';
import custDesk from './cust-desk.webp';
import custPhone from './cust-phone.webp';
import mgrDesk from './mgr-desk.webp';
import mgrPhone from './mgr-phone.webp';
import techDesk from './tech-desk.webp';
import techPhone from './tech-phone.webp';
import adminDesk from './admin-desk.webp';
import adminPhone from './admin-phone.webp';

export const heroShots = {
  landing: { desktop: { src: landingDesk, alt: 'หน้าขอช่างล้างแอร์บนคอมพิวเตอร์' }, phone: { src: landingPhone, alt: 'ข้อเสนอจากช่างบนมือถือ พร้อมเวลาที่เหลือให้เลือก' } },
  customer: { desktop: { src: custDesk, alt: 'หน้างานของฉัน แสดงข้อเสนอจากช่าง' }, phone: { src: custPhone, alt: 'ฟอร์มขอช่างล้างแอร์บนมือถือ' } },
  manager: { desktop: { src: mgrDesk, alt: 'หน้าอาคารของฉัน' }, phone: { src: mgrPhone, alt: 'เลือกห้องที่จะล้างในอาคาร' } },
  technician: { desktop: { src: techDesk, alt: 'งานของช่างเรียงตามวันและเวลา' }, phone: { src: techPhone, alt: 'หน้างานของช่างบนมือถือ' } },
  admin: { desktop: { src: adminDesk, alt: 'รายการจองทั้งหมดในระบบ' }, phone: { src: adminPhone, alt: 'หน้าตรวจสอบช่างบนมือถือ' } },
} as const;
