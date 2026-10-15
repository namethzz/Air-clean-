import { useEffect, useState } from 'react';
import { Bookmark, Building2, Crosshair, Home, MapPin, Trash2 } from 'lucide-react';
import type { SavedAddress } from '../types';
import LocationMap from './LocationMap';
import { deleteSavedAddress, fetchSavedAddresses, saveAddress as saveAddressToAccount } from '../lib/api';

interface Props { value: SavedAddress; onChange: (value: SavedAddress) => void; }
/** Addresses used to live only in this browser. They move to the account the first time the picker opens. */
const LEGACY_STORAGE_KEY = 'aircare.saved.addresses';
function readLegacy(): SavedAddress[] {
  try { return JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]') as SavedAddress[]; } catch { return []; }
}
let migration: Promise<void> | null = null;
/** Runs once per page load even when several pickers mount at the same time. */
function migrateLegacyAddresses(): Promise<void> {
  migration ??= migrateOnce().finally(() => { migration = null; });
  return migration;
}
async function loadAccountAddresses(): Promise<SavedAddress[]> {
  await migrateLegacyAddresses();
  return fetchSavedAddresses();
}
async function migrateOnce(): Promise<void> {
  const legacy = readLegacy().filter(item => item.address?.trim() && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  if (legacy.length) {
    const results = await Promise.allSettled([...legacy].reverse().map(item => saveAddressToAccount({ ...item, label: item.label?.trim() || 'ที่อยู่ของฉัน' })));
    if (results.every(result => result.status === 'fulfilled')) localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}
function addressSummary(item: SavedAddress) {
  return [item.address, item.building, item.floor ? `ชั้น ${item.floor}` : '', item.room ? `ห้อง ${item.room}` : ''].filter(Boolean).join(' · ');
}

export default function LocationPicker({ value, onChange }: Props) {
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [label, setLabel] = useState('บ้านของฉัน');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    loadAccountAddresses()
      .then(rows => { if (active) setSaved(rows); })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'โหลดที่อยู่ที่บันทึกไว้ไม่สำเร็จ'); });
    return () => { active = false; };
  }, []);
  function patch(partial: Partial<SavedAddress>) { onChange({ ...value, ...partial }); }
  function useMyLocation() {
    if (!navigator.geolocation) { setMessage('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'); return; }
    setMessage('กำลังค้นหาตำแหน่งปัจจุบัน…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        patch({ latitude: position.coords.latitude, longitude: position.coords.longitude, locationSelected: true });
        setMessage('ปักหมุดจากตำแหน่งปัจจุบันแล้ว ตรวจสอบที่อยู่ก่อนยืนยัน');
      },
      () => setMessage('เข้าถึงตำแหน่งไม่ได้ กรุณาอนุญาตตำแหน่งหรือปักหมุดบนแผนที่'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }
  async function saveAddress() {
    if (!value.address.trim()) { setMessage('กรุณากรอกบ้านเลขที่หรือที่อยู่ก่อนบันทึก'); return; }
    if (!value.locationSelected) { setMessage('กรุณาปักหมุดหรือใช้ตำแหน่งปัจจุบันก่อนบันทึกที่อยู่'); return; }
    setBusy(true);
    try {
      const entry = await saveAddressToAccount({ ...value, label: label.trim() || 'ที่อยู่ของฉัน' });
      setSaved(previous => [entry, ...previous.filter(item => item.id !== entry.id)]);
      setLoadError('');
      setMessage('บันทึกที่อยู่แล้ว ใช้ได้ทุกเครื่องที่เข้าสู่ระบบบัญชีนี้');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกที่อยู่ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function deleteAddress(id: string) {
    setBusy(true);
    try { await deleteSavedAddress(id); setSaved(previous => previous.filter(item => item.id !== id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'ลบที่อยู่ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <div className="location-picker">
    <div className="location-picker-heading"><div><strong>ตำแหน่งให้บริการ</strong><span>ปักหมุดให้ตรงจุด แล้วแก้ไขรายละเอียดที่อยู่</span></div><button type="button" className="outline-button location-current-button" onClick={useMyLocation}><Crosshair size={15}/> ใช้ตำแหน่งฉัน</button></div>
    <LocationMap center={value} destination={{ ...value, label: value.label || 'ตำแหน่งให้บริการ', kind: 'destination' }} onPick={(coords) => { patch({ ...coords, locationSelected: true }); setMessage('เปลี่ยนตำแหน่งหมุดแล้ว'); }} height={210} zoom={15} />
    <div className="location-coordinate-note"><MapPin size={13}/><span>{value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</span><span>·</span><span>{value.locationSelected ? 'เลือกตำแหน่งแล้ว' : 'โปรดแตะหมุดหรือใช้ตำแหน่งฉัน'}</span></div>
    <div className="place-type-picker" role="group" aria-label="ประเภทสถานที่">
      {(['บ้าน','คอนโด','หอพัก'] as const).map((type) => {
        const Icon = type === 'บ้าน' ? Home : Building2;
        return <button type="button" key={type} className={`place-type-option ${value.placeType === type ? 'active' : ''}`} onClick={() => patch({ placeType: type })}><Icon size={16}/>{type}</button>;
      })}
    </div>
    <label className="form-field"><span>บ้านเลขที่ / ที่อยู่ *</span><input value={value.address} onChange={(event) => patch({ address: event.target.value })} placeholder="เช่น 99/12 ซอยลาดพร้าว 71" required /></label>
    {value.placeType !== 'บ้าน' && <label className="form-field"><span>ชื่ออาคาร / คอนโด / หอพัก</span><input value={value.building || ''} onChange={(event) => patch({ building: event.target.value })} placeholder="ชื่ออาคารหรือโครงการ" /></label>}
    <div className="form-grid-two">
      {value.placeType !== 'บ้าน' && <label className="form-field"><span>ชั้น</span><input value={value.floor || ''} onChange={(event) => patch({ floor: event.target.value })} placeholder="เช่น 8" /></label>}
      {value.placeType !== 'บ้าน' && <label className="form-field"><span>เลขห้อง</span><input value={value.room || ''} onChange={(event) => patch({ room: event.target.value })} placeholder="เช่น 801" /></label>}
    </div>
    <label className="form-field"><span>จุดสังเกต / วิธีเข้าพื้นที่</span><input value={value.note || ''} onChange={(event) => patch({ note: event.target.value })} placeholder="เช่น โทรก่อนถึง, แลกบัตรที่ รปภ." /></label>
    <div className="save-address-row"><label className="form-field"><span>บันทึกเป็นที่อยู่ประจำ</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="บ้านของฉัน / ที่ทำงาน" /></label><button type="button" className="outline-button save-address-button" onClick={() => void saveAddress()} disabled={busy}><Bookmark size={15}/> บันทึก</button></div>
    {message && <p className="location-feedback" role="status">{message}</p>}
    {loadError && <p className="location-feedback" role="alert">{loadError}</p>}
    {saved.length > 0 && <div className="saved-addresses"><div className="saved-address-title"><strong>ที่อยู่ที่ใช้บ่อย</strong><span>ซิงก์กับบัญชีของคุณ</span></div>{saved.map((item) => <div className="saved-address-item" key={item.id}><button type="button" className="saved-address-select" onClick={() => { onChange({ ...item, locationSelected: true }); setLabel(item.label); setMessage(`เลือก ${item.label} แล้ว`); }}><span className="saved-address-icon"><MapPin size={16}/></span><span><strong>{item.label}</strong><small>{addressSummary(item)}</small></span></button><button type="button" className="icon-button" aria-label={`ลบ ${item.label}`} disabled={busy} onClick={() => void deleteAddress(item.id)}><Trash2 size={15}/></button></div>)}</div>}
    <div className="location-privacy-note"><MapPin size={14}/><span>ตำแหน่งจะใช้เพื่อให้ช่างไปยังหน้างาน และไม่แชร์ให้ผู้ใช้อื่นที่ไม่เกี่ยวข้องกับการจอง</span></div>
  </div>;
}