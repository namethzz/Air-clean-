import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Building2, CalendarClock, ChevronDown, ChevronRight, Phone, Plus, RefreshCw, Trash2, Wind, X } from 'lucide-react';
import type { Booking, SavedAddress } from '../types';
import { deleteSavedAddress, fetchSavedAddresses, saveAddress } from '../lib/api';
import LocationPicker, { addressSummary, type RememberChoice } from '../components/LocationPicker';
import StatusBadge from '../components/StatusBadge';
import { guideFor, isClosed } from '../lib/jobFlow';
import { timeLabel } from '../lib/time';
import './CustomerJobs.css';

interface Props {
  bookings: Booking[];
  onBook: (placeId: string) => void;
  onOpenJob: (id: number) => void;
  onNotice: (message: string) => void;
}

const day = (date: string) => new Date(date + 'T00:00:00');
const shortDate = (date: string) => day(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const telLink = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');

interface BuildingStats { jobs: Booking[]; done: Booking[]; active?: Booking; next?: Date; due: boolean; spent: number; }
function statsFor(place: SavedAddress, bookings: Booking[]): BuildingStats {
  const jobs = bookings.filter(item => item.placeId === Number(place.id));
  const done = jobs.filter(item => item.status === 'เสร็จสิ้น').sort((a, b) => b.date.localeCompare(a.date));
  const active = jobs.filter(item => !isClosed(item)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const next = done[0] ? day(done[0].date) : undefined;
  next?.setMonth(next.getMonth() + 6);
  return { jobs, done, active, next, due: Boolean(next && next.getTime() - Date.now() < 14 * 86400000), spent: done.reduce((sum, item) => sum + item.price, 0) };
}

/** A manager's buildings: what each has, who to call on site, the job in progress, when it is next due, and its history. */
export default function BuildingsPage({ bookings, onBook, onOpenJob, onNotice }: Props) {
  const [places, setPlaces] = useState<SavedAddress[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const load = useCallback(() => {
    setError('');
    fetchSavedAddresses().then(setPlaces).catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดรายการอาคารไม่สำเร็จ'));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => (places ?? []).map(place => ({ place, stats: statsFor(place, bookings) })), [places, bookings]);
  const totalUnits = rows.reduce((sum, row) => sum + (row.place.unitCount ?? 0), 0);
  const activeCount = rows.filter(row => row.stats.active).length;
  const dueCount = rows.filter(row => !row.stats.active && row.stats.due).length;

  return <div className="bd-page">
    <div className="bd-head">
      <h1>อาคารของฉัน</h1>
      <button type="button" className="cj-primary" onClick={() => setEditing('new')}><Plus size={18}/> เพิ่มอาคาร</button>
    </div>
    {error && <div className="app-data-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="outline-button" onClick={load}><RefreshCw size={15}/> ลองใหม่</button></div>}
    {places && places.length > 0 && <dl className="bd-stats">
      <div><dt>อาคาร</dt><dd>{places.length}</dd></div>
      <div><dt>แอร์รวม</dt><dd>{totalUnits ? `${totalUnits} เครื่อง` : '—'}</dd></div>
      <div><dt>มีงานอยู่</dt><dd>{activeCount}</dd></div>
      <div className={dueCount ? 'due' : ''}><dt>ถึงรอบล้าง</dt><dd>{dueCount}</dd></div>
    </dl>}
    {places && places.length === 0 && <section className="cj-empty bd-empty">
      <span className="cj-empty-icon"><Building2 size={30}/></span>
      <h2>ยังไม่มีอาคาร</h2>
      <p>เพิ่มอาคารครั้งเดียว ปักหมุด ใส่จำนวนแอร์และผู้ติดต่อหน้างาน แล้วขอช่างล้างได้ในไม่กี่แตะทุกครั้ง</p>
      <button type="button" className="cj-primary" onClick={() => setEditing('new')}><Plus size={18}/> เพิ่มอาคารแรก</button>
    </section>}

    <ul className="bd-list">{rows.map(({ place, stats }) => <li key={place.id} className="bd-card">
      <header>
        <span className="bd-icon"><Building2 size={22}/></span>
        <div><h2>{place.label}</h2><p>{place.placeType} · {addressSummary(place)}</p></div>
      </header>
      <div className="bd-facts">
        <span><Wind size={15}/> {place.unitCount ? `แอร์ ${place.unitCount} เครื่อง` : 'ยังไม่ระบุจำนวนแอร์'}</span>
        {place.contactName && <span>ผู้ติดต่อ {place.contactName}</span>}
        {place.contactPhone && <a href={telLink(place.contactPhone)}><Phone size={14}/> {place.contactPhone}</a>}
      </div>
      {stats.active
        ? <button type="button" className="bd-status active" onClick={() => onOpenJob(stats.active!.id)}>
          <span><strong>{guideFor(stats.active).short}</strong><small>{stats.active.code} · {shortDate(stats.active.date)} {timeLabel(stats.active)} · {stats.active.unitCount} เครื่อง</small></span>
          <StatusBadge status={stats.active.status}/><ChevronRight size={18}/>
        </button>
        : <div className={'bd-status' + (stats.due ? ' due' : '')}>
          <CalendarClock size={18}/>
          <span>{stats.done[0]
            ? <><strong>{stats.due ? 'ถึงรอบล้างแอร์แล้ว' : `ล้างครั้งถัดไป ${stats.next!.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`}</strong><small>ล้างล่าสุด {shortDate(stats.done[0].date)}</small></>
            : <><strong>ยังไม่เคยล้างผ่าน AirClean</strong><small>ขอช่างครั้งแรกได้เลย</small></>}</span>
        </div>}
      <div className="bd-actions">
        <button type="button" className="cj-primary" onClick={() => onBook(place.id)}><Wind size={17}/> ขอช่างล้างอาคารนี้</button>
        <button type="button" className="cj-ghost" onClick={() => setEditing(place)}>แก้ไข</button>
      </div>
      {stats.done.length > 0 && <button type="button" className="bd-history-toggle" aria-expanded={openHistory === place.id} onClick={() => setOpenHistory(value => value === place.id ? null : place.id)}>
        ประวัติการล้าง {stats.done.length} ครั้ง · รวม ฿{stats.spent.toLocaleString()} <ChevronDown size={16}/>
      </button>}
      {openHistory === place.id && <ul className="bd-history">{stats.done.map(job => <li key={job.id}>
        <button type="button" onClick={() => onOpenJob(job.id)}>
          <span className="cj-row-date"><strong>{day(job.date).getDate()}</strong><span>{day(job.date).toLocaleDateString('th-TH', { month: 'short' })}</span></span>
          <span className="bd-history-main"><strong>{job.unitCount} เครื่อง · ฿{job.price.toLocaleString()}</strong><small>ช่าง {job.technician} · {job.code}{job.customerRating ? ` · ${job.customerRating} ดาว` : ''}</small></span>
          <ChevronRight size={16}/>
        </button>
      </li>)}</ul>}
    </li>)}</ul>

    {editing && <BuildingEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
      onSaved={message => { setEditing(null); onNotice(message); load(); }}/>}
  </div>;
}

function BuildingEditor({ initial, onClose, onSaved }: { initial: SavedAddress | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [place, setPlace] = useState<SavedAddress>(initial ?? { id: 'new', label: '', placeType: 'คอนโด', address: '', latitude: 13.7563, longitude: 100.5018, locationSelected: false });
  const [name, setName] = useState<RememberChoice>({ on: true, label: initial?.label ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const label = name.label.trim() || place.building?.trim() || '';
    if (!label) { setError('ตั้งชื่อเรียกอาคาร'); return; }
    if (!place.address.trim() || !place.locationSelected) { setError('ปักหมุดและกรอกที่อยู่อาคาร'); return; }
    setBusy(true); setError('');
    try {
      await saveAddress({ ...place, label });
      // Names are the key; renaming saves under the new name, so remove the old entry.
      if (initial && initial.label !== label) await deleteSavedAddress(initial.id).catch(() => undefined);
      onSaved(initial ? `บันทึก ${label} แล้ว` : `เพิ่ม ${label} แล้ว`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!initial) return;
    setBusy(true);
    try { await deleteSavedAddress(initial.id); onSaved(`ลบ ${initial.label} แล้ว`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ'); setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card booking-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bd-editor-title">
      <div className="modal-header">
        <div><h2 id="bd-editor-title">{initial ? `แก้ไข ${initial.label}` : 'เพิ่มอาคาร'}</h2><p>ข้อมูลนี้ใช้ทุกครั้งที่ขอช่าง ช่างเห็นผู้ติดต่อหลังคุณเลือกช่างแล้วเท่านั้น</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={19}/></button>
      </div>
      <form className="booking-form" onSubmit={save}>
        <LocationPicker value={place} onChange={setPlace} remember={name} onRememberChange={setName} forBuilding standalone/>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" className="primary-button full-width" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกอาคาร'}</button>
        {initial && (confirmDelete
          ? <div className="bd-delete"><span>ลบ {initial.label}? ประวัติงานเดิมยังอยู่ในงานของอาคาร</span><button type="button" className="cj-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={15}/> ลบ</button><button type="button" className="cj-ghost" onClick={() => setConfirmDelete(false)}>เก็บไว้</button></div>
          : <button type="button" className="cj-link lp-danger bd-delete-link" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/> ลบอาคารนี้</button>)}
      </form>
    </section>
  </div>;
}
