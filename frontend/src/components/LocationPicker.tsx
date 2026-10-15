import { useEffect, useRef, useState } from 'react';
import { Building2, Check, Crosshair, Home, Loader2, MapPin, Pencil, Phone, Plus, Search, Trash2, UserRound, Wind, X } from 'lucide-react';
import type { PlaceType, SavedAddress } from '../types';
import LocationMap from './LocationMap';
import { deleteSavedAddress, fetchSavedAddresses, saveAddress as saveAddressToAccount } from '../lib/api';
import { addressAt, guessPlaceType, resolvePlace, searchPlaces, type PlaceResult } from '../lib/geocode';

export interface RememberChoice { on: boolean; label: string; }
interface Props {
  value: SavedAddress;
  onChange: (value: SavedAddress) => void;
  /** Whether to keep this address for next time, and under which name. The form saves it after sending. */
  remember: RememberChoice;
  onRememberChange: (value: RememberChoice) => void;
  /** Building managers: building types, unit count and the on-site contact instead of floor and room. */
  forBuilding?: boolean;
  /** Editing one place on its own (the buildings page): no saved list, and the name is always asked. */
  standalone?: boolean;
  /** Start with this saved place selected. */
  preferId?: string;
}
const homeTypes: PlaceType[] = ['บ้าน', 'คอนโด', 'หอพัก'];
const buildingTypes: PlaceType[] = ['คอนโด', 'หอพัก', 'สำนักงาน', 'โรงแรม', 'อาคารอื่น', 'บ้าน'];

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
export function addressSummary(item: SavedAddress) {
  return [item.address, item.building, item.floor ? `ชั้น ${item.floor}` : '', item.room ? `ห้อง ${item.room}` : ''].filter(Boolean).join(' · ');
}
const defaultLabel = (type: PlaceType, building?: string) => building?.trim() || (type === 'บ้าน' ? 'บ้าน' : type);

/**
 * Where the technician should go. Customers with saved places pick one in a tap. A new place can be found by
 * searching a condo, village or road, by the phone's location, or by tapping the map; the address text is
 * filled in from the map so only the house number and details are typed.
 */
export default function LocationPicker({ value, onChange, remember, onRememberChange, forBuilding = false, standalone = false, preferId }: Props) {
  const types = forBuilding ? buildingTypes : homeTypes;
  const word = forBuilding ? 'อาคาร' : 'ที่อยู่';
  const [saved, setSaved] = useState<SavedAddress[] | null>(null);
  const [mode, setMode] = useState<'saved' | 'new'>('new');
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  // Async lookups patch the latest value, not the one from when they started.
  const latest = useRef(value);
  latest.current = value;
  const autoAddress = useRef('');
  // Grow the address box with its text (filled from the map, or typed), on browsers without CSS field-sizing too.
  const addressBox = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const box = addressBox.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.max(92, box.scrollHeight + 2)}px`;
  }, [value.address, mode]);

  useEffect(() => {
    let active = true;
    if (standalone) return;
    loadAccountAddresses()
      .then(rows => {
        if (!active) return;
        setSaved(rows);
        // Most people book for the same place again: start with the last one used.
        if (rows.length && latest.current.id === 'new' && !latest.current.address.trim()) {
          const first = rows.find(row => row.id === preferId) ?? rows[0];
          onChange({ ...first, locationSelected: true });
          onRememberChange({ on: false, label: first.label });
          setMode('saved');
        }
      })
      .catch(error => { if (active) { setSaved([]); setLoadError(error instanceof Error ? error.message : 'โหลดที่อยู่ที่บันทึกไว้ไม่สำเร็จ'); } });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) { setResults([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchPlaces(text, latest.current.locationSelected ? latest.current : undefined, controller.signal)
        .then(rows => { setResults(rows); if (!rows.length) setMessage('ไม่พบสถานที่นี้ ลองพิมพ์ชื่อสั้นลง หรือปักหมุดบนแผนที่'); })
        .catch(error => { if ((error as Error).name !== 'AbortError') setMessage('ค้นหาไม่สำเร็จ ลองใช้ตำแหน่งปัจจุบันหรือปักหมุดบนแผนที่แทน'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 600);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  function patch(partial: Partial<SavedAddress>) { onChange({ ...latest.current, ...partial }); }

  /** Fills the address from the map when the person has not typed their own. */
  async function fillAddressAt(latitude: number, longitude: number) {
    setLookingUp(true);
    try {
      const text = await addressAt(latitude, longitude);
      const current = latest.current.address.trim();
      if (text && (!current || current === autoAddress.current)) {
        autoAddress.current = text;
        patch({ address: text });
      }
    } catch { /* the person can type the address */ }
    finally { setLookingUp(false); }
  }
  function moveTo(latitude: number, longitude: number, note: string) {
    patch({ latitude, longitude, locationSelected: true });
    setMessage(note);
    void fillAddressAt(latitude, longitude);
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setMessage('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง ค้นหาหรือปักหมุดบนแผนที่แทน'); return; }
    setLocating(true); setMessage('กำลังหาตำแหน่งของคุณ…');
    navigator.geolocation.getCurrentPosition(
      position => { setLocating(false); moveTo(position.coords.latitude, position.coords.longitude, 'ปักหมุดที่ตำแหน่งของคุณแล้ว เลื่อนหมุดได้ถ้ายังไม่ตรง'); },
      () => { setLocating(false); setMessage('เข้าถึงตำแหน่งไม่ได้ ค้นหาชื่อสถานที่หรือแตะแผนที่แทน'); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }
  async function pickResult(picked: PlaceResult) {
    let place: PlaceResult;
    try { place = await resolvePlace(picked); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'เปิดสถานที่นี้ไม่สำเร็จ ลองเลือกอีกครั้ง'); return; }
    const guessed = guessPlaceType(place.name) ?? (place.isBuilding ? 'คอนโด' : latest.current.placeType);
    const type = types.includes(guessed) ? guessed : types[0];
    autoAddress.current = place.address;
    onChange({ ...latest.current, latitude: place.latitude, longitude: place.longitude, locationSelected: true, address: place.address,
      placeType: type, building: type === 'บ้าน' ? latest.current.building : place.name });
    if (!remember.label.trim() || remember.label === defaultLabel(latest.current.placeType, latest.current.building)) onRememberChange({ ...remember, label: defaultLabel(type, type === 'บ้าน' ? '' : place.name) });
    setQuery(''); setResults([]);
    setMessage(`ปักหมุดที่ ${place.name} แล้ว ตรวจหมุดและเพิ่มบ้านเลขที่ ชั้น ห้อง`);
  }
  function choose(item: SavedAddress) { onChange({ ...item, locationSelected: true }); onRememberChange({ on: false, label: item.label }); setMessage(''); }
  function startNew() {
    autoAddress.current = '';
    onChange({ id: 'new', label: '', placeType: types[0], address: '', latitude: value.latitude, longitude: value.longitude, locationSelected: false });
    onRememberChange({ on: true, label: forBuilding ? '' : 'บ้าน' });
    setMode('new'); setMessage('');
  }
  function edit(item: SavedAddress) {
    onChange({ ...item, locationSelected: true });
    onRememberChange({ on: true, label: item.label });
    setMode('new'); setMessage('แก้ไขแล้วกดส่งคำขอ ที่อยู่ที่บันทึกไว้จะอัปเดตให้');
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteSavedAddress(id);
      const rest = (saved ?? []).filter(item => item.id !== id);
      setSaved(rest);
      if (value.id === id) { if (rest.length) choose(rest[0]); else startNew(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ลบที่อยู่ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  if (mode === 'saved' && saved?.length) {
    return <div className="location-picker lp">
      <div className="lp-head"><strong>ส่งช่างไปที่</strong><span>{forBuilding ? 'อาคารของคุณ' : 'ที่อยู่ที่บันทึกไว้ ใช้ได้ทุกเครื่อง'}</span></div>
      <div className="lp-saved" role="radiogroup" aria-label={forBuilding ? 'อาคารของคุณ' : 'ที่อยู่ที่บันทึกไว้'}>
        {saved.map(item => {
          const selected = value.id === item.id;
          return <div key={item.id} className={'lp-saved-item' + (selected ? ' selected' : '')}>
            <button type="button" role="radio" aria-checked={selected} className="lp-saved-pick" onClick={() => choose(item)}>
              <span className="lp-radio" aria-hidden="true">{selected && <Check size={14} strokeWidth={3}/>}</span>
              <span className="lp-saved-text"><strong>{item.label}</strong><small>{addressSummary(item)}</small>{(item.unitCount || item.contactName) && <small>{[item.unitCount ? `แอร์ ${item.unitCount} เครื่อง` : '', item.contactName ? `ผู้ติดต่อ ${item.contactName}` : ''].filter(Boolean).join(' · ')}</small>}{item.note && <small>จุดสังเกต: {item.note}</small>}</span>
            </button>
            {selected && <div className="lp-saved-actions">
              <button type="button" className="cj-link" onClick={() => edit(item)}><Pencil size={14}/> แก้ไข</button>
              <button type="button" className="cj-link lp-danger" disabled={busy} onClick={() => void remove(item.id)}><Trash2 size={14}/> ลบ</button>
            </div>}
          </div>;
        })}
        <button type="button" className="lp-new" onClick={startNew}><Plus size={18}/> {forBuilding ? 'อาคารอื่น / เพิ่มอาคาร' : 'ใช้ที่อยู่อื่น'}</button>
      </div>
      {message && <p className="location-feedback" role="status">{message}</p>}
    </div>;
  }

  const condo = value.placeType !== 'บ้าน';
  // A building manager books the whole building; rooms go in the notes for the technician.
  const rooms = condo && !forBuilding;
  return <div className="location-picker lp">
    <div className="lp-head">
      <strong>{value.id !== 'new' ? `แก้ไข ${value.label}` : forBuilding ? 'อาคารที่ให้ช่างไป' : 'ส่งช่างไปที่ไหน'}</strong>
      {!standalone && !!saved?.length && <button type="button" className="cj-link" onClick={() => { setMode('saved'); if (value.id === 'new') choose(saved[0]); }}>{forBuilding ? 'เลือกจากอาคารของฉัน' : 'เลือกจากที่บันทึกไว้'}</button>}
    </div>
    {standalone && <label className="form-field lp-name"><span>ชื่อเรียก{word} *</span><input value={remember.label} onChange={event => onRememberChange({ on: true, label: event.target.value })} placeholder={forBuilding ? 'เช่น คอนโด A, ออฟฟิศสาขาบางนา' : 'เช่น บ้าน'} maxLength={60} required/></label>}
    <div className="lp-search">
      <Search size={18} aria-hidden="true"/>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={forBuilding ? 'ค้นหาชื่ออาคาร โครงการ หรือถนน' : 'ค้นหาชื่อคอนโด หมู่บ้าน หรือถนน'} aria-label="ค้นหาสถานที่" enterKeyHint="search" autoComplete="off"/>
      {searching ? <Loader2 size={18} className="lp-spin" aria-label="กำลังค้นหา"/> : query && <button type="button" className="lp-clear" onClick={() => { setQuery(''); setResults([]); }} aria-label="ล้างคำค้นหา"><X size={16}/></button>}
      {results.length > 0 && <ul className="lp-results" role="listbox" aria-label="ผลการค้นหา">{results.map((place, index) => <li key={index}>
        <button type="button" role="option" aria-selected="false" onClick={() => void pickResult(place)}><MapPin size={16}/><span><strong>{place.name}</strong><small>{place.address}</small></span></button>
      </li>)}{results.some(place => place.googleId) && <li className="lp-attribution" aria-hidden="true">ผลการค้นหาจาก Google</li>}</ul>}
    </div>
    <button type="button" className="lp-locate" onClick={useMyLocation} disabled={locating}>
      {locating ? <Loader2 size={18} className="lp-spin"/> : <Crosshair size={18}/>} {locating ? 'กำลังหาตำแหน่ง…' : 'ใช้ตำแหน่งปัจจุบันของฉัน'}
    </button>
    <LocationMap center={value} destination={{ ...value, label: value.label || 'ตำแหน่งให้บริการ', kind: 'destination' }} onPick={coords => moveTo(coords.latitude, coords.longitude, 'ย้ายหมุดแล้ว')} height={200} zoom={value.locationSelected ? 17 : 12}/>
    <p className={'lp-pin-state' + (value.locationSelected ? ' ok' : '')}>{value.locationSelected ? <><Check size={14} strokeWidth={3}/> ปักหมุดแล้ว · แตะแผนที่เพื่อย้ายหมุด</> : <><MapPin size={14}/> ค้นหา ใช้ตำแหน่งปัจจุบัน หรือแตะแผนที่ตรงที่ให้ช่างไป</>}</p>
    {message && <p className="location-feedback" role="status">{message}</p>}
    {loadError && <p className="location-feedback" role="alert">{loadError}</p>}

    <div className={'place-type-picker' + (forBuilding ? ' lp-types-wide' : '')} role="group" aria-label="ประเภทสถานที่">
      {types.map(type => {
        const Icon = type === 'บ้าน' ? Home : Building2;
        return <button type="button" key={type} aria-pressed={value.placeType === type} className={`place-type-option ${value.placeType === type ? 'active' : ''}`} onClick={() => patch({ placeType: type })}><Icon size={16}/>{type}</button>;
      })}
    </div>
    {condo && <label className="form-field"><span>{forBuilding ? 'ชื่ออาคาร / โครงการ' : 'ชื่ออาคาร / คอนโด / หอพัก'}</span><input value={value.building || ''} onChange={event => patch({ building: event.target.value })} placeholder="เช่น ลุมพินี วิลล์ อาคาร B" autoComplete="off"/></label>}
    {rooms && <div className="form-grid-two lp-two">
      <label className="form-field"><span>ชั้น</span><input inputMode="numeric" value={value.floor || ''} onChange={event => patch({ floor: event.target.value })} placeholder="8"/></label>
      <label className="form-field"><span>เลขห้อง</span><input value={value.room || ''} onChange={event => patch({ room: event.target.value })} placeholder="812"/></label>
    </div>}
    <label className="form-field"><span>{condo ? 'ที่อยู่' : 'บ้านเลขที่ / ที่อยู่'} *{lookingUp && <em className="lp-hint"> กำลังเติมจากแผนที่…</em>}</span>
      <textarea ref={addressBox} rows={3} value={value.address} onChange={event => patch({ address: event.target.value })} placeholder={condo ? 'ระบบเติมให้จากหมุด' : 'เช่น 99/12 ซอยลาดพร้าว 71 (ระบบเติมถนน เขต จังหวัดให้จากหมุด)'} required autoComplete="street-address"/>
      {!condo && value.address && value.address === autoAddress.current && <small className="lp-hint">เติมจากแผนที่แล้ว เพิ่มบ้านเลขที่ด้านหน้าให้ช่างหาเจอง่าย</small>}
    </label>
    {forBuilding && <>
      {!value.rooms?.length && <label className="form-field"><span><Wind size={14}/> จำนวนแอร์ทั้งหมดในอาคาร (ไม่บังคับ)</span><input inputMode="numeric" value={value.unitCount ?? ''} onChange={event => { const n = Number.parseInt(event.target.value.replace(/[^0-9]/g, ''), 10); patch({ unitCount: Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : undefined }); }} placeholder="เช่น 48"/></label>}
      <div className="form-grid-two lp-two">
        <label className="form-field"><span><UserRound size={14}/> ผู้ติดต่อหน้างาน</span><input value={value.contactName || ''} onChange={event => patch({ contactName: event.target.value })} placeholder="เช่น คุณสมศรี (นิติบุคคล)" maxLength={80} autoComplete="off"/></label>
        <label className="form-field"><span><Phone size={14}/> เบอร์ผู้ติดต่อ</span><input type="tel" inputMode="tel" value={value.contactPhone || ''} onChange={event => patch({ contactPhone: event.target.value })} placeholder="081-234-5678" maxLength={30}/></label>
      </div>
    </>}
    <label className="form-field"><span>จุดสังเกต / วิธีเข้าพื้นที่ (ไม่บังคับ)</span><input value={value.note || ''} onChange={event => patch({ note: event.target.value })} placeholder={forBuilding ? 'เช่น จอดรถที่ลานด้านหลัง, แลกบัตรที่ รปภ.' : 'เช่น บ้านประตูสีเขียว, แลกบัตรที่ รปภ.'}/></label>
    {!standalone && <div className="lp-remember">
        <label className="lp-check"><input type="checkbox" checked={remember.on} onChange={event => onRememberChange({ ...remember, on: event.target.checked })}/> บันทึก{word}นี้ไว้ใช้ครั้งหน้า</label>
        {remember.on && <label className="form-field"><span>ชื่อเรียก</span><input value={remember.label} onChange={event => onRememberChange({ ...remember, label: event.target.value })} placeholder={forBuilding ? 'เช่น คอนโด A, ออฟฟิศสาขาบางนา' : 'เช่น บ้าน, คอนโด, บ้านแม่'} maxLength={60}/></label>}
      </div>}
  </div>;
}
