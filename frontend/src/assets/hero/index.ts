/**
 * The opening of each role's first page (hero-section-6): a photo of the work, and AirClean itself on a phone.
 * The photos were chosen by the owner; the phone screens are captured from the app.
 */
import inspect from './photo-inspect.webp';
import filter from './photo-filter.webp';
import mask from './photo-mask.webp';
import hands from './photo-hands.webp';
import landingPhone from './landing-phone.webp';
import custPhone from './cust-phone.webp';
import mgrPhone from './mgr-phone.webp';
import techPhone from './tech-phone.webp';
import adminPhone from './admin-phone.webp';

const photos = {
  inspect: { src: inspect, alt: 'ช่างแอร์ถือแฟ้มตรวจเช็กแอร์ติดผนัง', position: 'center 40%' },
  filter: { src: filter, alt: 'ช่างแอร์ใส่หมวกสีฟ้าถอดแผ่นกรองแอร์ออกมาล้าง', position: 'center 58%' },
  mask: { src: mask, alt: 'ช่างแอร์สวมหน้ากากกำลังถอดแผ่นกรองแอร์', position: 'center 42%' },
  hands: { src: hands, alt: 'มือช่างใช้ไขควงเปิดฝาแอร์ติดผนัง', position: 'center 50%' },
};

export const heroShots = {
  landing: { photo: photos.filter, phoneSide: 'right', phone: { src: landingPhone, alt: 'ข้อเสนอจากช่างบนมือถือ พร้อมเวลาที่เหลือให้เลือก' } },
  customer: { photo: photos.inspect, phoneSide: 'left', phone: { src: custPhone, alt: 'ฟอร์มขอช่างล้างแอร์บนมือถือ' } },
  manager: { photo: photos.hands, phoneSide: 'right', phone: { src: mgrPhone, alt: 'เลือกห้องที่จะล้างในอาคาร' } },
  technician: { photo: photos.mask, phoneSide: 'right', phone: { src: techPhone, alt: 'งานใกล้ฉันบนมือถือ: ราคาของคุณและระยะทางของแต่ละงาน' } },
  admin: { photo: photos.inspect, phoneSide: 'left', phone: { src: adminPhone, alt: 'หน้าตรวจสอบช่างบนมือถือ' } },
} as const;
