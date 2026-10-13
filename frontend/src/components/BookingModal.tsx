import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Check, MapPin, Wind, X } from 'lucide-react';
import type { Technician } from '../types';
export interface BookingPayload { technicianId: number; service: string; unitLabel: string; address: string; date: string; time: string; price: number; }
interface BookingModalProps { technicians: Technician[]; onClose: () => void; onSubmit: (payload: BookingPayload) => void; initialTechnicianId?: number; }

export default function BookingModal({ technicians, onClose, onSubmit, initialTechnicianId }: BookingModalProps) {
  const [technicianId, setTechnicianId] = useState(initialTechnicianId ?? technicians[0]?.id ?? 1);
  const [service, setService] = useState('ล้างแอร์มาตรฐาน');
  const [unitLabel, setUnitLabel] = useState('แอร์ห้องนอน · Daikin 12,000 BTU');
  const [address, setAddress] = useState('ลาดพร้าว 71, กรุงเทพฯ');
  const [date, setDate] = useState('2026-10-17');
  const [time, setTime] = useState('10:00');
  const [submitted, setSubmitted] = useState(false);
  const selected = technicians.find((tech) => tech.id === technicianId) ?? technicians[0];
  const price = selected ? selected.basePrice + (service === 'ล้างแอร์ + ตรวจเช็ก' ? 300 : service === 'ล้างแอร์แอร์แขวน' ? 250 : 0) : 550;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; onSubmit({ technicianId, service, unitLabel, address, date, time, price }); setSubmitted(true); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
      <div className="modal-header"><div><span className="eyebrow">NEW SERVICE REQUEST</span><h2 id="booking-modal-title">จองบริการล้างแอร์</h2><p>เลือกบริการและนัดหมายในไม่กี่ขั้นตอน</p></div><button className="icon-button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={19}/></button></div>
      {submitted ? <div className="success-state"><div className="success-icon"><Check size={26}/></div><h3>สร้างคำขอเรียบร้อยแล้ว</h3><p>เราเพิ่มรายการจองลงในหน้าการจองของคุณแล้ว</p><button className="primary-button" onClick={onClose}>กลับไปหน้าหลัก <ArrowRight size={16}/></button></div> : <form onSubmit={submit} className="booking-form">
        <div className="form-section-label"><span>01</span> รายละเอียดบริการ</div>
        <label className="form-field"><span>ประเภทบริการ</span><select value={service} onChange={(event) => setService(event.target.value)}><option>ล้างแอร์มาตรฐาน</option><option>ล้างแอร์ + ตรวจเช็ก</option><option>ล้างแอร์แอร์แขวน</option></select></label>
        <label className="form-field"><span>เครื่องปรับอากาศ</span><input value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} required/></label>
        <label className="form-field"><span>สถานที่ให้บริการ</span><div className="input-with-icon"><MapPin size={16}/><input value={address} onChange={(event) => setAddress(event.target.value)} required/></div></label>
        <div className="form-grid-two"><label className="form-field"><span>วันที่</span><div className="input-with-icon"><CalendarDays size={16}/><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></div></label><label className="form-field"><span>เวลา</span><select value={time} onChange={(event) => setTime(event.target.value)}><option>09:00</option><option>10:00</option><option>11:00</option><option>13:00</option><option>14:00</option><option>15:00</option></select></label></div>
        <div className="form-section-label"><span>02</span> ช่างที่ต้องการ</div>
        <div className="technician-select-list">{technicians.map((tech) => <button type="button" key={tech.id} className={`technician-select ${technicianId === tech.id ? 'selected' : ''}`} onClick={() => setTechnicianId(tech.id)}><span className={`avatar avatar-${tech.accent}`}>{tech.initials}</span><span className="technician-select-copy"><strong>{tech.name}</strong><small>{tech.rating.toFixed(1)} ★ · {tech.area}</small></span><strong className="select-price">฿{tech.basePrice.toLocaleString()}</strong>{technicianId === tech.id && <Check size={16} className="selected-check"/>}</button>)}</div>
        <div className="price-confirm"><div><span>ราคาประเมินเบื้องต้น</span><strong>฿{price.toLocaleString()}</strong></div><small><Wind size={14}/> ราคาสุดท้ายต้องยืนยันตามขอบเขตบริการ</small></div>
        <button type="submit" className="primary-button full-width">ยืนยันคำขอจอง <ArrowRight size={17}/></button>
      </form>}
    </section>
  </div>;
}