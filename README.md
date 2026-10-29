<p align="center"><img src="docs/brand/airclean-logo.png" width="200" alt="โลโก้ AirClean"></p>

# AirClean

**ภาษาไทย** · [English](README.en.md)

**แพลตฟอร์มจับคู่คนที่อยากล้างแอร์กับช่างแอร์ใกล้บ้าน**
ลูกค้าส่งคำขอครั้งเดียว ช่างในพื้นที่เสนอราคาเข้ามา ลูกค้าเปรียบเทียบแล้วเลือกเอง และช่างจะเห็นที่อยู่จริงก็ต่อเมื่อลูกค้าเลือกช่างคนนั้นแล้วเท่านั้น

[![Build](https://github.com/namethzz/Air-clean-/actions/workflows/build.yml/badge.svg)](https://github.com/namethzz/Air-clean-/actions/workflows/build.yml)

ใช้งานจริงที่ **[aircare-connect-web.onrender.com](https://aircare-connect-web.onrender.com)** (เซิร์ฟเวอร์ฟรีจะหลับเมื่อไม่มีคนใช้ เปิดครั้งแรกอาจรอ 30–60 วินาที)

Full stack: React + TypeScript, ASP.NET Core 8, MongoDB · เก็บค่าสมาชิกจริงผ่าน PromptPay และตรวจสลิปกับธนาคารอัตโนมัติ

<table>
  <tr>
    <td><img src="docs/screenshots/05-customer-offers.png" alt="ลูกค้าเปรียบเทียบข้อเสนอพร้อมเวลานับถอยหลัง" width="190"></td>
    <td><img src="docs/screenshots/06-customer-job.png" alt="งานที่ยืนยันแล้ว พร้อมปุ่มโทรหาช่าง" width="190"></td>
    <td><img src="docs/screenshots/07-technician-schedule.png" alt="ตารางงานของช่างแยกตามวัน" width="190"></td>
    <td><img src="docs/screenshots/08-technician-membership.png" alt="ช่างต่ออายุสมาชิกด้วย QR พร้อมเพย์" width="190"></td>
  </tr>
  <tr>
    <td align="center">ลูกค้าเลือกช่างภายใน 1 ชม.</td>
    <td align="center">งานที่ยืนยันแล้ว</td>
    <td align="center">ตารางงานของช่าง</td>
    <td align="center">ต่ออายุสมาชิกด้วย QR</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/09-booking-form.png" alt="ฟอร์มขอช่าง พร้อมราคากลางของงาน" width="190"></td>
    <td><img src="docs/screenshots/12-nearby-jobs.png" alt="งานใกล้ช่าง พร้อมราคาจากใบราคาของช่าง" width="190"></td>
    <td><img src="docs/screenshots/10-building-rooms.png" alt="ผู้ดูแลอาคารจัดการรายห้อง" width="190"></td>
    <td><img src="docs/screenshots/04-sign-up.png" alt="สมัครแยกตามบทบาท" width="190"></td>
  </tr>
  <tr>
    <td align="center">ฟอร์มขอช่าง</td>
    <td align="center">งานใกล้ช่าง</td>
    <td align="center">อาคารแบบรายห้อง</td>
    <td align="center">สมัครตามบทบาท</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/13-technician-services.png" alt="ช่างใหม่เลือกแอร์ที่รับล้าง" width="190"></td>
    <td><img src="docs/screenshots/14-technician-prices.png" alt="ช่างตั้งราคาต่อเครื่องเทียบกับราคาที่ช่างส่วนใหญ่คิด" width="190"></td>
    <td><img src="docs/screenshots/06-customer-job.png" alt="งานที่ยืนยันแล้ว" width="190"></td>
    <td><img src="docs/screenshots/01-landing.png" alt="หน้าแรก" width="190"></td>
  </tr>
  <tr>
    <td align="center">ช่างเลือกงานที่รับ</td>
    <td align="center">ช่างตั้งราคาเอง</td>
    <td align="center">งานที่ยืนยันแล้ว</td>
    <td align="center">หน้าแรก</td>
  </tr>
</table>

<img src="docs/screenshots/11-admin-membership.png" alt="หน้าแอดมิน: ค่าสมาชิกช่างและการตรวจสลิป" width="780">

ภาพจากหน้าจอจริงที่ความกว้างมือถือ (390 px) และเดสก์ท็อป ด้วยข้อมูลทดสอบ

## ทำอะไรได้บ้าง

- **ผู้ใช้ 4 บทบาท** ลูกค้า ช่างแอร์ ผู้ดูแลอาคาร (จัดการทั้งตึกแบบรายห้อง) และแอดมิน แต่ละบทบาทมีหน้าของตัวเอง
- **ราคาที่ลูกค้าเข้าใจได้** ลูกค้าบอกแค่สิ่งที่เห็น (ชนิดแอร์ จำนวน อาการ) ราคามาจากใบราคาของช่างแต่ละคน พร้อมช่วงราคากลางจากช่างทุกคนในระบบ ราคาล็อกเมื่อเลือกช่าง ถ้าหน้างานต้องปรับ ช่างขอในแอปพร้อมเหตุผลและลูกค้ากดอนุมัติก่อน
- **ช่างเสนอราคาแทนราคาตายตัว** ช่างเห็นงานใกล้ตัวเรียงตามระยะทางแล้วเสนอราคา ลูกค้ามีเวลาเลือก 1 ชั่วโมงนับจากข้อเสนอแรก ถ้าหมดเวลา ข้อเสนอหมดอายุและเปิดรับใหม่ได้ในปุ่มเดียว
- **ติดตามงานจริง** หลังยืนยันแล้ว ลูกค้าเห็นตำแหน่งช่างบนแผนที่ โทรหากันได้ เลื่อนวันนัดได้ ช่างติ๊กห้องที่ล้างเสร็จ แนบรูปก่อนและหลังล้าง แล้วปิดงานในขั้นตอนเดียว
- **ตารางงานของช่าง** แยกตามวันพร้อมแถบ 7 วัน และเตือนเมื่อเวลานัดชนกัน
- **เก็บเงินปลายทาง** ลูกค้าจ่ายช่างโดยตรง แพลตฟอร์มไม่ถือเงิน ทั้งสองฝ่ายยืนยัน (ถ้าลูกค้าไม่กดยืนยันและไม่แจ้งปัญหาภายใน 3 วัน งานปิดเอง) และถ้ามีข้อโต้แย้งจะเข้าคิวให้แอดมินตัดสิน มีใบเสร็จพร้อมจำนวนเงินเป็นตัวอักษร และออกในนามบริษัทพร้อมเลขผู้เสียภาษีได้
- **รับช่างเข้าระบบ** หลังสมัคร ช่างตั้งค่างานของตัวเองทีละขั้น: แอร์แบบไหนที่รับล้าง รับล้างใหญ่ไหม งานอื่นที่ทำได้ ราคาต่อเครื่อง (เทียบกับที่ช่างส่วนใหญ่คิด) พื้นที่และเวลา และรูปบัตรประชาชน แล้วกดส่งให้แอดมินตรวจ ช่างเห็นเฉพาะงานที่ตรงกับที่ตัวเองรับ หลังอนุมัติใช้ฟรีช่วงทดลอง จากนั้นจ่ายค่าสมาชิกรายเดือนด้วย QR พร้อมเพย์ ระบบตรวจสลิปกับธนาคารผ่าน Slip2Go และต่ออายุให้ทันที
- **แจ้งเตือน** กระดิ่งในแอปและ Web Push รวมถึง iPhone เมื่อเพิ่มแอปไว้ที่หน้าจอหลัก มีเตือนล่วงหน้าวันนัด ครบรอบล้าง 6 เดือน และสมาชิกใกล้หมดอายุ
- **เข้าสู่ระบบ** อีเมลและรหัสผ่าน หรือ Google (ดึงรูปโปรไฟล์จาก Google ให้ด้วย) ลิงก์ตั้งรหัสผ่านใหม่ใช้ได้ครั้งเดียวและออกจากระบบเครื่องอื่นทั้งหมด
- **ลบบัญชีเอง** ที่หน้าบัญชี ยืนยันด้วยรหัสผ่าน (หรือพิมพ์ “ลบบัญชี” สำหรับบัญชี Google) งานที่ยังไม่เริ่มถูกยกเลิกและแจ้งอีกฝ่าย งานที่กำลังทำต้องปิดก่อน ข้อมูลส่วนตัวถูกลบ ประวัติงานและใบเสร็จเก็บไว้โดยไม่มีชื่อและเบอร์

รายการฟีเจอร์ทั้งหมดและการตั้งค่าทุกตัวอยู่ใน [docs/REFERENCE.md](docs/REFERENCE.md) และคำอธิบายผลิตภัณฑ์แบบละเอียดอยู่ใน [docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md)

## สถาปัตยกรรม

```mermaid
flowchart LR
  subgraph Client["เบราว์เซอร์ / PWA ที่ติดตั้งในมือถือ"]
    SPA["React 18 + TypeScript + Vite<br/>แผนที่ Leaflet, service worker"]
  end
  subgraph Render["Render (Docker)"]
    API["ASP.NET Core 8 Web API<br/>JWT, rate limit, 19 controllers"]
    BG["ReminderService<br/>รันเบื้องหลังทุก 5 นาที"]
  end
  DB[("MongoDB Atlas")]
  SPA -- "HTTPS + JWT" --> API
  API --> DB
  BG --> DB
  API -- "ตรวจ ID token" --> OIDC["Google sign-in"]
  API -- "Web Push" --> PUSH["บริการ push ของเบราว์เซอร์<br/>FCM, Mozilla, Apple, Windows"]
  PUSH -.-> SPA
  API -- "HTTPS API" --> MAIL["Brevo<br/>อีเมลรีเซ็ตรหัสผ่าน"]
  API -- "ตรวจสลิป" --> SLIP["Slip2Go<br/>สลิปพร้อมเพย์"]
  GHA["GitHub Actions<br/>CI + cron ทุก 30 นาที"] -- "POST /api/cron/reminders" --> API
  SPA --> OSM["OpenStreetMap<br/>แผนที่และค้นหาที่อยู่"]
```

### เส้นทางของงานหนึ่งงาน

```mermaid
stateDiagram-v2
  [*] --> OpenForTechnicians: ลูกค้าส่งคำขอ
  OpenForTechnicians --> AwaitingCustomerSelection: ช่างคนแรกเสนอราคา
  AwaitingCustomerSelection --> Confirmed: ลูกค้าเลือกช่าง
  AwaitingCustomerSelection --> OffersExpired: ครบ 1 ชม. หลังข้อเสนอแรก
  OffersExpired --> OpenForTechnicians: ลูกค้าเปิดรับใหม่
  OpenForTechnicians --> Cancelled: ลูกค้ายกเลิก
  AwaitingCustomerSelection --> Cancelled: ลูกค้ายกเลิก
  OffersExpired --> Cancelled: ลูกค้ายกเลิก
  Confirmed --> Cancelled: ลูกค้าหรือช่างยกเลิก
  Confirmed --> Traveling: ช่างออกเดินทาง
  Traveling --> Arrived: GPS ถึงหน้างาน
  Arrived --> InProgress
  InProgress --> AwaitingPayment: ล้างเสร็จ
  AwaitingPayment --> Completed: ยืนยันการจ่ายเงินครบสองฝ่าย หรือครบ 3 วันโดยไม่มีข้อโต้แย้ง
  AwaitingPayment --> PaymentIssue: มีข้อโต้แย้ง
  PaymentIssue --> Completed: แอดมินตัดสินว่าจ่ายแล้ว
  PaymentIssue --> Cancelled: แอดมินยกเลิก
  Completed --> [*]
  Cancelled --> [*]
```

ช่างกด “งานเสร็จและได้รับเงินแล้ว” ปุ่มเดียว (`POST /api/bookings/{id}/complete` กดได้ทุกสถานะตั้งแต่ยืนยันแล้วจนถึงรอชำระเงิน) ระบบบันทึกรายงานบริการและวิธีจ่ายเงิน แล้วรอลูกค้ากดยืนยัน ถ้าลูกค้าไม่กดและไม่แจ้งปัญหาภายใน 3 วัน ระบบปิดงานให้เอง (`JobClosing.AutoCloseAsync`) ช่างจึงไม่ต้องรอลูกค้าที่ลืมกด ส่วนลูกค้าที่ไม่ได้จ่ายจริงยังมีเวลา 3 วันในการแจ้งปัญหา ถ้ายังมีคำขอปรับราคาหน้างานที่ลูกค้ายังไม่ตอบ ระบบไม่ให้ปิดงาน

## ปัญหาที่น่าสนใจและเหตุผลที่เลือกวิธีนี้

### 1. ให้ช่างเห็นงานใกล้ตัวโดยไม่เผยว่าลูกค้าอยู่ที่ไหน

หน้างานใกล้ฉันต้องแสดงระยะทาง แต่ถ้าวัดจากหมุดจริง ช่างลองค้นจากหลายจุดก็คำนวณย้อนหาบ้านลูกค้าได้ ระบบจึงวัดระยะจากจุดที่ห่างจากหมุด 300–700 เมตรในทิศใดก็ได้ (`FuzzPoint` และ `BlurredDistanceKm`) แล้วปัดขึ้นเป็นกิโลเมตรเต็ม จุดนี้สุ่มด้วย `RandomNumberGenerator` ครั้งเดียวตอนสร้างงานแล้วเก็บไว้ใน `FuzzLatitude`/`FuzzLongitude` ทุกการค้นจึงวัดจากจุดเดิม ค้นซ้ำกี่ครั้งก็เฉลี่ยหาบ้านจริงไม่ได้ และเดาจุดจากรหัสงานก็ไม่ได้ ส่วน `OpenJobView` ตัดชื่อ ที่อยู่ พิกัด เบอร์โทร รายการห้อง และราคาของช่างคนอื่นออกจากข้อมูลที่ส่งให้ช่าง ข้อมูลเต็มจะเปิดให้หลังลูกค้ายืนยันช่างคนนั้นแล้วเท่านั้น
ดู `ApiHelpers.cs` และ `BookingOffersController.cs` มีทั้ง unit test และ smoke test ตรวจเรื่องนี้

### 2. สองคนแก้งานเดียวกันพร้อมกัน โดยไม่ใช้ transaction

ระบบไม่ใช้ multi-document transaction แต่ใช้การอัปเดตทีละเอกสารแบบ atomic และ unique index แต่ละกรณีชนกันจึงมีคำตอบชัดเจน

- **สถานะงาน** การเปลี่ยนสถานะ การเสนอราคา และการยืนยันช่าง จะเขียนได้ก็ต่อเมื่อ `UpdatedAt` ยังเป็นค่าที่อ่านมา คำขอที่ช้ากว่าจะได้ `409` ให้โหลดใหม่ แทนที่จะเขียนทับอีกฝ่าย
- **ลิงก์รีเซ็ตรหัสผ่าน** เงื่อนไขอัปเดตรวม hash ของ token ไว้ด้วย ลิงก์จึงใช้ได้ครั้งเดียวแม้มีสองคำขอมาพร้อมกัน
- **ใบเสร็จ** ต้องเป็น `ReceiptNo == null` เท่านั้น กดสองครั้งก็ได้เลขเดียว
- **ค่าสมาชิก** partial unique index ให้หนึ่งรายการโอนต่ออายุได้ครั้งเดียว และช่างหนึ่งคนมีสลิปรอตรวจได้ใบเดียว การต่ออายุเป็น update เดียวด้วย `$max` + `$dateAdd` ทำให้การอนุมัติกับการแจกวันฟรีที่เกิดพร้อมกันนับครบทั้งคู่

### 3. Web Push โดยไม่ใช้ไลบรารี

เขียนตามมาตรฐานโดยตรง RFC 8030 (ส่งข้อความ), RFC 8291 (เข้ารหัส `aes128gcm`) และ RFC 8292 (VAPID) ด้วย cryptography ที่มากับ .NET เท่านั้น (`WebPushSender.cs`) คู่กุญแจสร้างครั้งเดียวแล้วเก็บในฐานข้อมูล deploy ใหม่จึงไม่ต้องตั้งค่าอะไร และในโหมด production รับ endpoint เฉพาะโดเมนของบริการ push ที่รู้จัก กันไม่ให้ URL ที่ผู้ใช้ส่งมาสั่งให้เซิร์ฟเวอร์ยิงไปที่อื่น
การตรวจการเข้ารหัสด้วยโค้ดของตัวเองพิสูจน์อะไรได้ไม่มาก `tests/fake_push.py` จึงทำตัวเป็นเบราว์เซอร์และบริการ push ที่ตรวจลายเซ็น VAPID และถอดรหัสข้อความแยกจากโค้ดหลัก

### 4. กฎที่ขึ้นกับเวลา บนเซิร์ฟเวอร์ที่หลับได้

ข้อเสนอต้องหมดอายุหลัง 1 ชั่วโมง และการแจ้งเตือนต้องออกตรงเวลา แต่เซิร์ฟเวอร์ฟรีหลับเมื่อไม่มีคนใช้ ระบบจึงไม่พึ่งตัวตั้งเวลาตัวเดียว

- การหมดอายุถูกตรวจทุกครั้งที่มีการอ่านข้อมูลงาน (`OfferTimer.ExpireDueAsync`)
- `ReminderService` รันทุก 5 นาทีระหว่างที่เซิร์ฟเวอร์ตื่น
- GitHub Actions เรียก `POST /api/cron/reminders` ทุก 30 นาทีช่วง 07:00–21:30 เวลาไทย ซึ่งปลุกเซิร์ฟเวอร์ไปด้วย endpoint นี้เทียบ key แบบ constant time และไม่มีอยู่เลยถ้าไม่ได้ตั้ง `CRON_KEY` ฝั่ง repository ต้องตั้ง secret `AIRCLEAN_API_URL` และ `AIRCLEAN_CRON_KEY` (ค่าเดียวกับ `CRON_KEY`) ถ้าไม่ตั้ง workflow จะข้ามไปเฉยๆ
- รอบเดียวกันนี้ปิดงานที่ช่างกดรับเงินแล้วครบ 3 วัน ตรวจสลิปที่ค้าง และเตือนสมาชิกใกล้หมดอายุ

การแจ้งเตือนทุกรายการ "จอง" ในฐานข้อมูลด้วย conditional update ก่อนส่ง รันซ้อนกันก็ส่งแค่ครั้งเดียว

### 5. ตรวจสลิปค่าสมาชิกให้แน่ใจว่าเงินเข้าจริง

ช่างโอนผ่าน QR พร้อมเพย์ที่ระบบสร้างเองตามมาตรฐาน EMVCo (ตรวจกับไลบรารี `promptpay-qr` แล้วได้ผลตรงกัน) แล้วแนบสลิป เซิร์ฟเวอร์ส่งรูปไปที่ Slip2Go พร้อมเงื่อนไขครบชุด ได้แก่ ต้องเป็นรายการโอนจริง, เข้าพร้อมเพย์ของ AirClean, ยอดตรงทุกสตางค์, โอนไม่เกิน 2 วัน และไม่เคยใช้มาก่อน
ผลแยกเป็น 3 แบบ: ผ่าน (ต่ออายุทันที), ไม่ผ่าน (บอกเหตุผล เช่น สลิปซ้ำ หรือโอนผิดบัญชี) และยังตัดสินไม่ได้ (ธนาคารยังไม่ยืนยัน หรือบริการล่ม) แบบสุดท้ายระบบตรวจซ้ำเองทุกไม่กี่นาที และแจ้งแอดมินเฉพาะเมื่อจำเป็น นอกจากนี้ยังเก็บ hash ของรูปและเลขรายการไว้กันสลิปซ้ำแม้แอดมินจะเป็นคนอนุมัติเอง
ถ้าไม่ได้ตั้ง `SLIP2GO_API_SECRET` สลิปทุกใบจะรอแอดมินตรวจเอง ค่าสมาชิกรายเดือน (ตั้งต้น 299 บาท) จำนวนวันทดลองฟรี (ตั้งต้น 30 วัน) และบัญชีพร้อมเพย์ที่รับเงิน แอดมินตั้งได้ในหน้าค่าสมาชิกช่าง

### 6. ราคาที่ลูกค้าไม่ต้องรู้ราคาตลาดก่อน

ลูกค้าส่วนใหญ่ไม่รู้ว่าล้างแอร์ราคาเท่าไร และไม่รู้ว่าแอร์ตัวเองกี่ BTU ฟอร์มจึงถามแค่สิ่งที่มองเห็น: แอร์ติดผนัง แขวน/ตั้งพื้น หรือฝังฝ้า กี่เครื่อง ตัวใหญ่กี่เครื่อง ล้างธรรมดาหรือล้างใหญ่ และคอยล์ร้อนที่ต้องปีนกี่ตัว (`JobItem`, `Deep`, `HardAccessUnits`)

- **ใบราคาของช่าง** ช่างแต่ละคนตั้งราคาต่อเครื่องแยกตามชนิดและแบบล้าง บวกค่าเครื่องใหญ่และค่าจุดเข้าถึงยาก (`PriceSheet`) ข้อเสนอทุกใบคำนวณจากใบนี้เป็นรายบรรทัด ช่างพิมพ์ยอดรวมเองไม่ได้ ลูกค้าจึงเห็นว่าเงินแต่ละบาทมาจากอะไร
- **ราคากลาง** ระบบคิดราคางานเดียวกันจากใบราคาของช่างที่อนุมัติแล้วทุกคน ช่วงที่ลูกค้าเห็นคือเปอร์เซ็นไทล์ที่ 20 ถึง 80 และค่ากลางคือมัธยฐานของแต่ละบรรทัด (`Pricing.Range`) ถ้ามีช่างไม่ถึง 3 คน ระบบใช้ราคาอ้างอิงของ AirClean แทน (ติดผนัง 600 บาท ล้างใหญ่ 1,200 บาท ฯลฯ) และบอกลูกค้าว่าเป็นราคาอ้างอิง
- **ราคาล็อกเมื่อเลือกช่าง** ใบราคาที่ใช้ตอนเสนอถูกเก็บไว้กับข้อเสนอ ช่างแก้ใบราคาทีหลังก็ไม่กระทบงานที่ตกลงแล้ว
- **ปรับราคาหน้างาน** ถ้าแอร์จริงไม่ตรงกับที่ลูกค้าบอก ช่างส่งคำขอแก้รายการ ระบบคิดราคาใหม่จากใบราคาเดิม ช่างตั้งราคาเองไม่ได้ ส่วนงานเพิ่ม (เติมน้ำยา เปลี่ยนอะไหล่) ช่างระบุราคาและเหตุผลเอง ทั้งสองแบบมีผลเมื่อลูกค้ากดอนุมัติเท่านั้น และมีคำขอค้างได้ครั้งละหนึ่งรายการ (`PriceChangesController`)
- **ช่างเห็นเฉพาะงานที่ตัวเองรับ** ถ้าช่างไม่รับแอร์ฝังฝ้าหรือไม่รับล้างใหญ่ งานแบบนั้นจะไม่ขึ้นในหน้างานใกล้ฉัน (`Pricing.Takes`)

## เทคโนโลยี

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React 18, TypeScript, Vite, Leaflet + OpenStreetMap, PWA ที่ติดตั้งได้พร้อม service worker |
| Backend | ASP.NET Core 8 Web API, JWT, ASP.NET Identity password hashing, rate limit แบบ sliding window ต่อผู้ใช้ |
| Database | MongoDB (Atlas ใน production) กับ .NET driver ทางการ |
| บริการภายนอก | Google sign-in, Brevo (อีเมล), Web Push (VAPID), Slip2Go (ตรวจสลิป) |
| Deploy | Render: Docker สำหรับ API (กำหนดใน `render.yaml`) และ static site สำหรับ frontend |
| CI | GitHub Actions: build ทั้งสองฝั่ง, unit test (xUnit + Vitest) และ smoke test กับ MongoDB ชั่วคราว |

## โครงสร้างโปรเจกต์

```
backend/AirClean.Api
  Controllers/   หนึ่ง controller ต่อหนึ่งเรื่อง ทั้งหมดอยู่ใต้ /api:
                 Auth, AccountDeletion, Notifications, Addresses, ProfilePhotos,
                 Technicians, Bookings, BookingOffers, Pricing, PriceChanges,
                 JobCompletion, Issues, Receipts, JobPhotos, Dashboard, AirConditioners,
                 ServiceReports, Reviews, Membership
                 AirCleanControllerBase เก็บสิ่งที่ใช้ร่วมกัน (ฐานข้อมูล ผู้ใช้ที่ล็อกอิน การแจ้งเตือนสถานะ)
                 ApiHelpers เก็บกฎที่เป็น pure function (ระยะทาง จุดเบลอ ช่วงเวลา ตรวจรูป)
  Services/      Pricing (ใบราคาและราคากลาง), JobClosing (ปิดงานและปิดอัตโนมัติ 3 วัน),
                 OfferTimer, ReminderService, Membership, SlipVerifier,
                 Notifier, WebPushSender, EmailSender, ExternalIdentityValidator,
                 ProfilePhotoService, TechnicianViewFilter, DtoMapper
  Models/ DTOs/ Data/   entity, สัญญา request/response, MongoStore และ index
backend/AirClean.Api.Tests   unit test (xUnit)
frontend/src
  pages/         หนึ่งโฟลเดอร์ต่อหนึ่งหน้า แต่ละหน้าโหลดแยกเมื่อเปิด (ดู pages/README.md)
  components/    ส่วนที่ใช้ร่วมกัน: shell/ กรอบแอป, booking/ ฟอร์มขอช่าง, job/ ชิ้นส่วนของงาน
  lib/           API client, QR พร้อมเพย์, จำนวนเงินเป็นตัวอักษร, ตรวจเวลานัดชน,
                 ขั้นของงานแต่ละบทบาท (jobFlow), ราคา (+ unit test)
tests/           smoke test แบบ end-to-end และตัวจำลอง Google, push, Brevo, Slip2Go
DESIGN.md        ระบบดีไซน์ (โทเคน คอมโพเนนต์ ui-* และกติกาการใช้สี)
docs/            REFERENCE.md (การตั้งค่า), PROJECT-SUMMARY.md, redesign/PLAN.md, screenshots/
```

## รันบนเครื่องตัวเอง

ต้องมี .NET 8 SDK, Node 20 และ MongoDB (ใช้ container สะดวกที่สุด)

```bash
# 1. ฐานข้อมูล
docker run -d --name airclean-mongo -p 27017:27017 mongo:7

# 2. API ที่ http://localhost:5080 พร้อมข้อมูลตัวอย่าง
cd backend/AirClean.Api
MONGODB_URI=mongodb://localhost:27017 MONGODB_DATABASE=airclean_demo \
JWT_KEY="any-random-string-of-at-least-32-characters" \
SEED_DEMO_DATA=true dotnet run

# 3. Frontend ที่ http://localhost:5173 (อีกหน้าต่าง)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

บัญชีตัวอย่างมีเฉพาะในฐานข้อมูลที่ seed แบบนี้ รหัสผ่านทุกบัญชีคือ `Aircare123!`

| บทบาท | อีเมล |
|---|---|
| ลูกค้า | `customer@aircare.demo` |
| ช่าง | `technician@aircare.demo` (และ `technician2@…`, `technician3@…`) |
| ผู้ดูแลอาคาร | `manager@aircare.demo` |
| แอดมิน | `admin@aircare.demo` |

การ seed ทำเฉพาะเมื่อฐานข้อมูลยังไม่มีผู้ใช้ และไม่ทำเลยเมื่อ `ASPNETCORE_ENVIRONMENT` เป็น `Production`

## การทดสอบ

รันทุก pull request ใน CI มี 3 ชั้น

| ชั้น | อยู่ที่ | ทดสอบอะไร | คำสั่ง |
|---|---|---|---|
| Unit (backend) | `backend/AirClean.Api.Tests` | 35 เมธอดทดสอบ: ตรวจสลิปกับ Slip2Go จำลอง (ทุกรหัสผลลัพธ์), ช่วงเวลานัด, ระยะทางแบบเบลอ, สถานะสมาชิก, ราคา, ชื่อย่อ | `dotnet test backend/AirClean.Api.Tests` |
| Unit (frontend) | `frontend/src/lib/*.test.ts`, `frontend/src/pages/profile/technician/*.test.ts` | 57 test ใน 11 ไฟล์: QR พร้อมเพย์, เวลานัดชน, รายการห้อง, ขั้นของงานแต่ละบทบาท, ราคาและใบราคาของช่าง, ตัวเลขไทยและจำนวนเงินเป็นตัวอักษร, รอบล้างถัดไป, ชื่อย่อและป้ายเวลา, การครอปรูป, ลิงก์ที่ปลอดภัย | `npm test` ใน `frontend/` |
| End-to-end | `tests/marketplace_smoke.py` | เรียก API จริงกับฐานข้อมูลชั่วคราว: สิทธิ์ข้อมูล, ความเป็นส่วนตัวของที่อยู่, การอนุมัติช่าง, การเขียนพร้อมกัน, รีเซ็ตรหัสผ่าน, Google sign-in, push, ข้อโต้แย้งการจ่ายเงิน, ใบเสร็จ, ค่าสมาชิก, เวลาแจ้งเตือน, การลบบัญชี | `python3 tests/marketplace_smoke.py` |

smoke test ต้องรันกับฐานข้อมูลที่ทิ้งได้เท่านั้น (ดูค่าที่ใช้ใน `.github/workflows/build.yml`) ห้ามชี้ไปที่ฐานข้อมูลจริง

## วิธีพัฒนา

โปรเจกต์นี้พัฒนาร่วมกับ AI coding assistant (Claude Code) ผู้พัฒนาเป็นคนกำหนดโจทย์และตัดสินใจเรื่องผลิตภัณฑ์ทั้งหมด เช่น บทบาทผู้ใช้ ให้ลูกค้าโทรคุยกับช่างแทนการขอเลื่อนนัดในระบบ เวลาเลือกช่าง 1 ชั่วโมง โมเดลค่าสมาชิกรายเดือน และการเลือก Slip2Go รวมถึงทดสอบกับผู้ใช้และเงินจริง ดูแล deploy และระบบที่รันอยู่ ทุกการเปลี่ยนแปลงผ่าน pull request ที่อธิบายเหตุผลไว้ และต้องผ่าน CI ก่อน merge

## ข้อจำกัดที่ยังมี

- รูปงาน รูปเอกสาร และสลิปเก็บใน MongoDB ถ้าใช้งานมากควรย้ายไป object storage (Atlas ฟรีมี 512 MB เบราว์เซอร์จึงย่อรูปก่อนอัปโหลด)
- ยังไม่มีการยืนยันอีเมลตอนสมัคร
- บทบาทผู้ดูแลอาคารเลือกเองได้ตอนสมัครโดยไม่ต้องรออนุมัติ ต่างจากช่าง
- ระยะทางในหน้างานใกล้ฉันเป็นเส้นตรง ไม่ใช่ระยะขับรถหรือเวลาเดินทาง
- JavaScript ของหน้าเว็บรวมเป็นไฟล์เดียวราว 990 kB (gzip 280 kB) ยังไม่ได้แยกโหลดตามหน้า มือถือเน็ตช้าจะเปิดครั้งแรกช้า
- เซิร์ฟเวอร์ฟรีหลับเมื่อไม่มีคนใช้ ครั้งแรกจึงช้า

รายการเต็มอยู่ใน [docs/REFERENCE.md](docs/REFERENCE.md#limitations-before-a-public-launch)

> ชื่อแรกของโปรเจกต์คือ "AirCare Connect" ชื่อบริการบน Render (`aircare-connect-api`, `aircare-connect-web`), ชื่อฐานข้อมูล, issuer ของ JWT และ key ใน localStorage ยังใช้ชื่อเดิม เพราะถ้าเปลี่ยนจะทำให้ URL ที่ใช้งานอยู่เปลี่ยน หรือทำให้ผู้ใช้ทุกคนหลุดจากระบบ
