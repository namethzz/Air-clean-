import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Building2, CheckCircle2, Clock3, ExternalLink, LocateFixed, MapPin, Navigation, RefreshCw, ShieldCheck, Smartphone, Wallet, Wrench } from 'lucide-react';
import type { Booking, BookingStatus, PaymentMethod, UserRole } from '../types';
import StatusBadge from '../components/StatusBadge';
import LocationMap, { type Coordinates } from '../components/LocationMap';

interface Props {
  bookings: Booking[];
  role: UserRole;
  onStatusChange: (id: number, status: BookingStatus) => void;
  onLocationUpdate: (id: number, latitude: number, longitude: number, accuracy?: number) => void;
  onPaymentConfirm: (id: number, method: PaymentMethod) => void;
  onPaymentIssue: (id: number, reason: string) => void;
  onRefresh: () => void;
}

const FALLBACK_DESTINATION: Coordinates = { latitude: 13.806, longitude: 100.572 };
function statusHeadline(status: BookingStatus) {
  const copy: Record<BookingStatus, string> = {
    'รอยืนยัน': 'กำลังรอช่างตอบรับ', 'ยืนยันแล้ว': 'นัดหมายได้รับการยืนยันแล้ว',
    'กำลังเดินทาง': 'ช่างกำลังเดินทางมาหาคุณ', 'ถึงหน้างาน': 'ช่างมาถึงหน้างานแล้ว',
    'กำลังดำเนินการ': 'ช่างกำลังให้บริการ', 'รอชำระเงิน': 'บริการเสร็จแล้ว รอชำระเงินหน้างาน',
    'มีปัญหาการชำระเงิน': 'รายการนี้รอผู้ดูแลช่วยตรวจสอบ', 'เสร็จสิ้น': 'ภารกิจเสร็จสมบูรณ์',
    'ยกเลิก': 'การจองถูกยกเลิก',
  };
  return copy[status] ?? status;
}
function formatUpdated(value?: string | null) {
  if (!value) return 'ยังไม่ได้รับพิกัดจากช่าง';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'มีพิกัดล่าสุดแล้ว' : `อัปเดตล่าสุด ${date.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.`;
}

export default function TrackingPage({ bookings, role, onStatusChange, onLocationUpdate, onPaymentConfirm, onPaymentIssue, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [gpsMessage, setGpsMessage] = useState('');
  const isTechnician = role === 'technician';
  const relevantBookings = useMemo(() => {
    const rows = role === 'admin' ? bookings : bookings.filter((item) => !['เสร็จสิ้น','ยกเลิก'].includes(item.status));
    return rows.length ? rows : bookings;
  }, [bookings, role]);
  const selected = relevantBookings.find((item) => item.id === selectedId) ?? relevantBookings.find((item) => isTechnician ? ['ยืนยันแล้ว','กำลังเดินทาง','ถึงหน้างาน','กำลังดำเนินการ','รอชำระเงิน'].includes(item.status) : item.status !== 'เสร็จสิ้น') ?? relevantBookings[0];
  const hasCoordinates = selected?.latitude != null && selected?.longitude != null;
  const destination = hasCoordinates ? { latitude: selected!.latitude!, longitude: selected!.longitude! } : FALLBACK_DESTINATION;
  const technicianPosition = selected?.technicianLatitude != null && selected?.technicianLongitude != null
    ? { latitude: selected.technicianLatitude, longitude: selected.technicianLongitude } : null;
  const mapCenter = technicianPosition && hasCoordinates
    ? { latitude: (technicianPosition.latitude + destination.latitude) / 2, longitude: (technicianPosition.longitude + destination.longitude) / 2 }
    : technicianPosition ?? destination;

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    if (selected.paymentMethod) setPaymentMethod(selected.paymentMethod);
  }, [selected?.id, selected?.paymentMethod]);

  useEffect(() => {
    if (!isTechnician || !selected || selected.status !== 'กำลังเดินทาง') { setGpsMessage(''); return; }
    if (!navigator.geolocation) { setGpsMessage('อุปกรณ์นี้ไม่รองรับ GPS ผ่านเบราว์เซอร์'); return; }
    let lastSentAt = 0;
    setGpsMessage('กำลังขออนุญาตใช้ตำแหน่งจากอุปกรณ์…');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
        setGpsMessage(`กำลังแชร์ตำแหน่ง · ความแม่นยำประมาณ ${Math.round(coords.accuracy)} เมตร`);
        if (now - lastSentAt >= 8000) {
          lastSentAt = now;
          void onLocationUpdate(selected.id, coords.latitude, coords.longitude, coords.accuracy);
        }
      },
      (error) => {
        setGpsMessage(error.code === 1 ? 'ยังไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS ในเบราว์เซอร์' : 'รับตำแหน่ง GPS ไม่สำเร็จ ตรวจสอบการตั้งค่าตำแหน่งและลองอีกครั้ง');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTechnician, selected?.id, selected?.status, onLocationUpdate]);

  useEffect(() => {
    const timer = window.setInterval(onRefresh, 10000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  if (!selected) {
    return <div className="page-stack"><div className="page-heading-row"><div><div className="eyebrow">LIVE SERVICE TRACKING</div><h1>แผนที่และการเดินทาง</h1><p className="page-subtitle">ติดตามงานและตำแหน่งช่างได้จากที่เดียว</p></div></div><section className="panel tracking-empty"><MapPin size={30}/><strong>ยังไม่มีงานให้แสดง</strong><p>เมื่อมีการจอง ระบบจะแสดงสถานที่ให้บริการและสถานะการเดินทางของช่างที่นี่</p></section></div>;
  }

  const mapsUrl = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selected.address)}&travelmode=driving`;
  const isAwaitingPayment = selected.status === 'รอชำระเงิน' || selected.status === 'มีปัญหาการชำระเงิน';
  const canConfirmPayment = selected.status === 'รอชำระเงิน';
  const customerConfirmed = Boolean(selected.customerConfirmedPayment);
  const technicianConfirmed = Boolean(selected.technicianConfirmedPayment);
  const hasCoordinates = selected.latitude != null && selected.longitude != null;

  function reportIssue() {
    const reason = window.prompt('อธิบายปัญหาการชำระเงิน เพื่อให้ผู้ดูแลตรวจสอบ');
    if (reason?.trim()) onPaymentIssue(selected.id, reason.trim());
  }
  return <div className="page-stack">
    <div className="page-heading-row"><div><div className="eyebrow">LIVE SERVICE TRACKING</div><h1>{isTechnician ? 'งานและเส้นทางของฉัน' : 'ช่างอยู่ที่ไหนแล้ว?'}</h1><p className="page-subtitle">{isTechnician ? 'ดูข้อมูลงาน เปิด Google Maps และแชร์ตำแหน่งระหว่างเดินทาง' : 'ติดตามสถานะนัดหมายและตำแหน่งล่าสุดของช่างที่กำลังเดินทางมา'}</p></div><button className="outline-button" onClick={onRefresh}><RefreshCw size={15}/> รีเฟรชข้อมูล</button></div>
    <div className="tracking-page-layout">
      <section className="tracking-map-panel">
        <div className="tracking-map-header"><div><h2>แผนที่การให้บริการ</h2><p>{selected.address}</p></div><StatusBadge status={selected.status}/></div>
        <LocationMap center={mapCenter} destination={hasCoordinates ? {...destination,label:'สถานที่ให้บริการ',kind:'destination'} : undefined} technician={technicianPosition ? {...technicianPosition,label:selected.technician,kind:'technician'} : undefined} height={390} zoom={technicianPosition && hasCoordinates ? 13 : 14}/>
        <div className="tracking-map-legend"><span><i className="tracking-legend-pin"/> สถานที่ให้บริการ</span>{technicianPosition && <span><i className="tracking-legend-pin tech"/> ตำแหน่งช่างล่าสุด</span>}</div>
        <div className="tracking-runtime-note">{technicianPosition ? formatUpdated(selected.locationUpdatedAt) : (selected.status === 'กำลังเดินทาง' ? 'รอพิกัดล่าสุดจากโทรศัพท์ช่าง หาก GPS ยังไม่อนุญาต ตำแหน่งอาจยังไม่แสดง' : 'ตำแหน่งช่างจะแสดงเมื่อช่างกด “กำลังเดินทาง” และอนุญาตให้เข้าถึง GPS')}</div>
      </section>

      <aside className="tracking-detail-panel">
        {relevantBookings.length > 1 && <div className="tracking-job-options"><div className="tracking-detail-header"><div><h2>{isTechnician ? 'เลือกงานที่รับไว้' : 'เลือกการจอง'}</h2><p>เปลี่ยนงานเพื่อดูรายละเอียดบนแผนที่</p></div></div>{relevantBookings.map((item) => <button type="button" className={`tracking-job-option ${item.id===selected.id?'active':''}`} key={item.id} onClick={() => setSelectedId(item.id)}><span><Wrench size={15}/></span><span><strong>{item.code} · {item.service}</strong><small>{item.address}</small></span><StatusBadge status={item.status}/></button>)}</div>}
        <div className="tracking-status-line"><div className="tracking-status-icon"><Navigation size={18}/></div><div className="tracking-status-copy"><strong>{statusHeadline(selected.status)}</strong><span>{selected.code} · {selected.technician}</span></div></div>
        <div className="tracking-info-list">
          <div className="tracking-info-row"><MapPin size={16}/><div><strong>สถานที่ให้บริการ</strong><span>{selected.address}</span>{selected.unitLabel && <span>{selected.unitLabel}</span>}</div></div>
          <div className="tracking-info-row"><Clock3 size={16}/><div><strong>วันและเวลา</strong><span>{new Date(`${selected.date}T00:00:00`).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})} · {selected.time} น.</span></div></div>
          <div className="tracking-info-row"><Wallet size={16}/><div><strong>ค่าบริการที่ตกลง</strong><span>฿{selected.price.toLocaleString()} · ชำระหน้างาน</span><span>วิธีชำระ: {selected.paymentMethod === 'PromptPay' ? 'PromptPay' : selected.paymentMethod === 'Cash' ? 'เงินสด' : 'เลือกตอนชำระเงิน'}</span></div></div>
        </div>

        <div className="tracking-actions">
          <a className="primary-button full-width" href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> {isTechnician ? 'นำทางด้วย Google Maps' : 'เปิดสถานที่ใน Google Maps'}</a>
          {isTechnician && selected.status === 'ยืนยันแล้ว' && <button className="outline-button" onClick={() => onStatusChange(selected.id,'กำลังเดินทาง')}><Navigation size={15}/> เริ่มเดินทางและแชร์ GPS</button>}
          {isTechnician && selected.status === 'กำลังเดินทาง' && <button className="outline-button" onClick={() => onStatusChange(selected.id,'ถึงหน้างาน')}><MapPin size={15}/> ยืนยันว่าถึงหน้างานแล้ว</button>}
          {isTechnician && selected.status === 'ถึงหน้างาน' && <button className="outline-button" onClick={() => onStatusChange(selected.id,'กำลังดำเนินการ')}><Wrench size={15}/> เริ่มล้างแอร์</button>}
          {isTechnician && selected.status === 'กำลังดำเนินการ' && <button className="outline-button" onClick={() => onStatusChange(selected.id,'รอชำระเงิน')}><CheckCircle2 size={15}/> งานเสร็จแล้ว · รอชำระเงิน</button>}
        </div>

        {isAwaitingPayment && <div className="tracking-payment-box">
          <h3><Banknote size={16} style={{verticalAlign:'middle',marginRight:6}}/>ชำระเงินหน้างาน</h3>
          <p>เมื่องานเสร็จ ลูกค้าเลือกวิธีชำระเงินและยืนยันว่าได้จ่ายแล้ว ส่วนช่างยืนยันว่าได้รับเงินแล้ว ระบบจึงปิดภารกิจ</p>
          {canConfirmPayment && <div className="tracking-payment-options"><button type="button" className={paymentMethod==='Cash'?'active':''} onClick={()=>setPaymentMethod('Cash')}><Banknote size={15}/> เงินสด</button><button type="button" className={paymentMethod==='PromptPay'?'active':''} onClick={()=>setPaymentMethod('PromptPay')}><Smartphone size={15}/> PromptPay</button></div>}
          <div className="tracking-payment-confirmations">
            <div className="payment-check-row"><CheckCircle2 size={15}/>{customerConfirmed?'ลูกค้ายืนยันว่าชำระแล้ว':'รอลูกค้ายืนยันการชำระเงิน'}</div>
            <div className="payment-check-row"><CheckCircle2 size={15}/>{technicianConfirmed?'ช่างยืนยันว่าได้รับเงินแล้ว':'รอช่างยืนยันว่าได้รับเงิน'}</div>
          </div>
          {canConfirmPayment && ((role==='customer' && !customerConfirmed) || (isTechnician && !technicianConfirmed)) && <button className="primary-button full-width" style={{marginTop:10}} onClick={() => onPaymentConfirm(selected.id,paymentMethod)}>{role==='customer'?'ฉันชำระเงินแล้ว':'ฉันได้รับเงินแล้ว'} <CheckCircle2 size={15}/></button>}
          {canConfirmPayment && (role === 'customer' || isTechnician) && <button className="outline-button full-width" style={{marginTop:8}} onClick={reportIssue}><AlertTriangle size={15}/> แจ้งปัญหาการชำระเงิน</button>}
          {selected.status==='มีปัญหาการชำระเงิน' && <p>รายการนี้ถูกส่งให้ผู้ดูแลตรวจสอบแล้ว โปรดติดต่อผู้ดูแลก่อนเปลี่ยนสถานะ</p>}
          <p className="tracking-disclaimer">V.2 บันทึกการยืนยันจากทั้งสองฝ่ายเท่านั้น ยังไม่ได้ตรวจสอบธุรกรรม PromptPay ผ่านธนาคารหรือผู้ให้บริการชำระเงิน</p>
        </div>}

        {selected.status === 'เสร็จสิ้น' && <div className="tracking-status-line" style={{marginTop:14}}><div className="tracking-status-icon"><CheckCircle2 size={18}/></div><div className="tracking-status-copy"><strong>ปิดภารกิจเรียบร้อย</strong><span>ลูกค้าและช่างยืนยันการชำระเงินแล้ว · ฿{selected.price.toLocaleString()}</span></div></div>}
        {selected.status === 'มีปัญหาการชำระเงิน' && <div className="tracking-status-line"><div className="tracking-status-icon"><AlertTriangle size={18}/></div><div className="tracking-status-copy"><strong>ส่งให้ผู้ดูแลตรวจสอบแล้ว</strong><span>ระบบยังไม่ถือว่ารายการนี้ชำระสำเร็จ</span></div></div>}
        {isTechnician && selected.status === 'กำลังเดินทาง' && <div className="tracking-runtime-note"><LocateFixed size={14} style={{verticalAlign:'middle',marginRight:5}}/> {gpsMessage || 'แชร์ GPS จากอุปกรณ์นี้ทุกประมาณ 8 วินาทีขณะหน้าเว็บเปิด'}</div>}
        {role==='customer' && !hasCoordinates && <div className="tracking-runtime-note"><Building2 size={13} style={{verticalAlign:'middle',marginRight:5}}/> งานตัวอย่างเดิมอาจไม่มีพิกัดที่อยู่ ให้ใช้แผนที่เลือกตำแหน่งเมื่อสร้างการจองใหม่</div>}
        {role==='admin' && <div className="tracking-runtime-note"><ShieldCheck size={14} style={{verticalAlign:'middle',marginRight:5}}/> โหมดผู้ดูแล: ใช้ตรวจสอบสถานะและข้อมูลตำแหน่งของงานที่เกี่ยวข้อง</div>}
      </aside>
    </div>
  </div>;
}