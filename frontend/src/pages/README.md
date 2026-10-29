# หน้าของแอป: แต่ละโฟลเดอร์คือหนึ่งหน้า

หนึ่งโฟลเดอร์ต่อหนึ่งหน้าในเมนู ไฟล์ที่ใช้เฉพาะหน้านั้นอยู่ในโฟลเดอร์เดียวกัน ส่วนที่หลายหน้าใช้ร่วมกันอยู่ใน `src/components/`

แต่ละหน้าเป็นไฟล์ JavaScript แยกกัน เบราว์เซอร์โหลดเมื่อเปิดหน้านั้นครั้งแรก (ดู `load` ใน `src/App.tsx`) หลังเข้าสู่ระบบ แอปจะทยอยโหลดหน้าอื่นของบทบาทนั้นไว้ตอนเครื่องว่าง จึงสลับหน้าได้ทันที

## หน้าในเมนู

| โฟลเดอร์ | หน้า (ชื่อในเมนู) | ใครเห็น | ไฟล์ |
|---|---|---|---|
| `landing/` | หน้าแรกก่อนเข้าสู่ระบบ | ทุกคน | `LandingPage.tsx`, `Landing.css` |
| `auth/` | เข้าสู่ระบบ / สมัครสมาชิก / ตั้งรหัสผ่านใหม่ | ทุกคน | `AuthPage.tsx`, `Auth.css` |
| `home/` | หน้าแรก | ลูกค้า, ผู้ดูแลอาคาร | `CustomerHome.tsx`, `Home.css` |
| `jobs/` | งานของฉัน (ผู้ดูแลอาคาร: งานของอาคาร) | ลูกค้า, ผู้ดูแลอาคาร | `CustomerJobsPage.tsx`, `CustomerJobs.css` |
| `history/` | ประวัติการล้าง | ลูกค้า, ผู้ดูแลอาคาร | `CleaningHistoryPage.tsx`, `History.css` |
| `buildings/` | อาคารของฉัน | ผู้ดูแลอาคาร | `BuildingsPage.tsx`, `Buildings.css` |
| `nearby/` | งานใกล้ฉัน | ช่าง | `NearbyJobsPage.tsx`, `NearbyJobs.css` |
| `technician-jobs/` | งานของฉัน | ช่าง | `TechnicianJobsPage.tsx`, `TechnicianJobs.css`, `PriceChangeSheet.tsx` (ขอปรับราคาที่หน้างาน) |
| `membership/` | สมาชิก AirClean (ผู้ดูแลระบบ: ค่าสมาชิกช่าง) | ช่าง, ผู้ดูแลระบบ | `MembershipPage.tsx`, `Membership.css`, `MembershipStrip.tsx` (แถบสถานะสมาชิกที่หน้าอื่นใช้) |
| `profile/` | โปรไฟล์และราคา (ช่าง) / บัญชี (บทบาทอื่น) | ทุกบทบาท | `ProfilePage.tsx`, `Profile.css`, `PhotoEditor.tsx` (ครอปรูปโปรไฟล์), `PushSettings.tsx` (เปิดแจ้งเตือนบนเครื่อง) |
| `profile/technician/` | ส่วนของช่างในหน้าโปรไฟล์ และขั้นตั้งค่าหลังสมัคร | ช่าง | `TechnicianSetup.tsx` (ขั้นตั้งค่า 5 ขั้น), `TechnicianServices.tsx` (เลือกงานที่รับ ตั้งราคา), `TechnicianProfileSettings.tsx` (แก้ข้อมูลบริการ), `TechnicianDocuments.tsx` (บัตรประชาชน ใบรับรอง), `Setup.css` |
| `admin/` | หน้าของผู้ดูแลระบบทั้งหมด | ผู้ดูแลระบบ | `AdminOverview.tsx` (ภาพรวม), `ApprovalsPage.tsx` (ตรวจสอบช่าง), `AdminTechniciansPage.tsx` (ช่างทั้งหมด), `BookingsPage.tsx` (รายการจอง), `IssuesPage.tsx` (เรื่องที่ถูกแจ้ง), `TrackingPage.tsx` (ติดตามงาน), `ReportsPage.tsx` (รายงานบริการ), `Admin.css` |

ขั้นตั้งค่าของช่าง (`profile/technician/TechnicianSetup.tsx`) แสดงทั้งที่ "งานใกล้ฉัน" และ "โปรไฟล์และราคา" จนกว่าช่างจะส่งข้อมูลให้ตรวจ

## ส่วนที่หลายหน้าใช้ร่วมกัน (`src/components/`)

| โฟลเดอร์ | ใช้ทำอะไร | ไฟล์ |
|---|---|---|
| `shell/` | กรอบแอปที่อยู่ทุกหน้า: เมนูข้าง แถบบน แถบล่างบนมือถือ กระดิ่ง | `Sidebar.tsx`, `Topbar.tsx`, `BottomNav.tsx`, `NotificationBell.tsx`, `NotificationBell.css`, `PushPrompt.tsx`, `UpdateBanner.tsx` |
| `booking/` | ฟอร์ม "ขอช่างล้างแอร์" (โหลดเมื่อกดเปิด) | `BookingModal.tsx`, `LocationPicker.tsx` (ปักหมุดที่อยู่), `VisitTimePicker.tsx` (เลือกวันเวลา), `Rooms.tsx` (เลือกห้องในอาคาร), `Request.css` |
| `job/` | ชิ้นส่วนของงานที่หลายหน้าใช้ | `Jobs.css` (โครงหน้างาน jb-), `JobStepper.tsx`, `JobPhotos.tsx`, `LocationMap.tsx` (แผนที่), `Pricing.tsx` (ราคาแยกรายการ), `ReceiptSheet.tsx` (ใบเสร็จ), `Reschedule.tsx` (เลื่อนนัด), `StatusBadge.tsx` และ CSS ของแต่ละตัว |
| `ui/` | ส่วนหัวรูปโทรศัพท์ของหน้าแรก | `hero-section-6.tsx`, `hero-section-6.css`, `animated-group.tsx` |
| (ราก) | ชิ้นพื้นฐานของระบบออกแบบ | `kit.tsx` (PageHead, Plate, Sheet …), `Avatar.tsx`, `BrandMark.tsx`, `PrivateImage.tsx` |

สไตล์ส่วนกลาง (สี ปุ่ม การ์ด กรอบแอป) อยู่ใน `src/styles/` และโหลดตั้งแต่เปิดแอป

## เพิ่มหน้าใหม่

1. สร้างโฟลเดอร์ใน `pages/` แล้ววางไฟล์หน้าและ CSS ของหน้านั้นไว้ด้วยกัน
2. เพิ่มบรรทัดใน `load` และสร้าง `lazy(...)` ใน `src/App.tsx` แล้วใส่หน้าใน `rolePages` ของบทบาทที่ใช้หน้านั้น
3. หน้าต้อง import CSS ทุกไฟล์ที่ใช้คลาสเอง อย่าพึ่ง CSS ของหน้าอื่น เพราะตอนนี้แต่ละหน้าโหลดแยกกัน
