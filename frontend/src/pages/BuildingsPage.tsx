import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Building2, CalendarClock, ChevronRight, Phone, Plus, RefreshCw, Trash2, Wind } from 'lucide-react';
import type { Booking, SavedAddress } from '../types';
import { deleteSavedAddress, fetchSavedAddresses, saveAddress } from '../lib/api';
import LocationPicker, { addressSummary, type RememberChoice } from '../components/LocationPicker';
import StatusBadge from '../components/StatusBadge';
import { RoomRosterEditor } from '../components/Rooms';
import { EmptyState, PageHead, Problem, Sheet } from '../components/kit';
import { guideFor, isClosed } from '../lib/jobFlow';
import { dueRooms, lastCleaned } from '../lib/rooms';
import { timeLabel } from '../lib/time';
import '../components/Request.css';
import './Jobs.css';
import './Buildings.css';

interface Props {
  bookings: Booking[];
  onBook: (placeId: string, rooms?: string[]) => void;
  onOpenJob: (id: number) => void;
  onNotice: (message: string) => void;
}

const day = (date: string) => new Date(date + 'T00:00:00');
const shortDate = (date: string) => day(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const telLink = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');

interface BuildingStats { jobs: Booking[]; done: Booking[]; active?: Booking; next?: Date; due: boolean; spent: number; dueRooms: string[]; }
function statsFor(place: SavedAddress, bookings: Booking[]): BuildingStats {
  const jobs = bookings.filter(item => item.placeId === Number(place.id));
  const done = jobs.filter(item => item.status === 'เสร็จสิ้น').sort((a, b) => b.date.localeCompare(a.date));
  const active = jobs.filter(item => !isClosed(item)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const next = done[0] ? day(done[0].date) : undefined;
  next?.setMonth(next.getMonth() + 6);
  // Rooms are due one by one; a building with no history yet has nothing "due", just a first cleaning to book.
  const due = done.length && place.rooms?.length ? dueRooms(place.rooms, lastCleaned(place.id, bookings)).map(room => room.name) : [];
  return { jobs, done, active, next, due: Boolean(next && next.getTime() - Date.now() < 14 * 86400000) || due.length > 0, spent: done.reduce((sum, item) => sum + item.price, 0), dueRooms: due };
}

/**
 * A manager's buildings. The band counts buildings, units, jobs running and buildings due (orange: theirs to book).
 * Each building card says what it has, who to call on site, and the one thing that matters now: the job in
 * progress, the rooms that are due, or when the next cleaning is.
 */
export default function BuildingsPage({ bookings, onBook, onOpenJob, onNotice }: Props) {
  const [places, setPlaces] = useState<SavedAddress[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const load = useCallback(() => {
    setError('');
    fetchSavedAddresses().then(setPlaces).catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดรายการอาคารไม่สำเร็จ'));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => (places ?? []).map(place => ({ place, stats: statsFor(place, bookings) })), [places, bookings]);
  const totalUnits = rows.reduce((sum, row) => sum + (row.place.unitCount ?? 0), 0);
  const activeCount = rows.filter(row => row.stats.active).length;
  const dueCount = rows.filter(row => !row.stats.active && row.stats.due).length;

  return <div className="ui-page bd">
    <PageHead title="อาคารของฉัน" actions={places?.length ? <button type="button" className="ui-btn is-primary" onClick={() => setEditing('new')}><Plus size={18}/> เพิ่มอาคาร</button> : undefined}>
      ห้องที่มีแอร์ ผู้ติดต่อหน้างาน และรอบล้างของแต่ละอาคาร
    </PageHead>
    {error && <p className="ui-alert is-problem" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" className="ui-btn is-sm" onClick={load}><RefreshCw size={16}/> ลองใหม่</button></p>}
    {!places && !error && <div className="ui-skeleton bd-skel" aria-label="กำลังโหลดรายการอาคาร"/>}

    {places && places.length > 0 && <dl className="jb-summary bd-summary">
      <div><dt>อาคาร</dt><dd className="ui-num">{places.length}</dd></div>
      <div><dt>แอร์รวม</dt><dd>{totalUnits ? <><span className="ui-num">{totalUnits}</span> เครื่อง</> : <span className="ui-num">—</span>}</dd></div>
      <div><dt>มีงานอยู่</dt><dd className="ui-num">{activeCount}</dd></div>
      <div className={dueCount ? 'is-turn' : ''}><dt>ถึงรอบล้าง</dt><dd className="ui-num">{dueCount}</dd></div>
    </dl>}

    {places && places.length === 0 && <EmptyState icon={Building2} title="ยังไม่มีอาคาร"
      action={<button type="button" className="ui-btn is-primary is-lg" onClick={() => setEditing('new')}><Plus size={20}/> เพิ่มอาคารแรก</button>}>
      เพิ่มอาคารครั้งเดียว ปักหมุด ใส่ห้องที่มีแอร์และผู้ติดต่อหน้างาน แล้วขอช่างได้ในไม่กี่แตะทุกครั้ง
    </EmptyState>}

    <ul className="bd-list">{rows.map(({ place, stats }) => <li key={place.id}>
      <article className="ui-card bd-card" aria-labelledby={`bd-${place.id}`}>
        <header className="bd-card-head">
          <span className="bd-icon" aria-hidden="true"><Building2 size={22}/></span>
          <div><h2 id={`bd-${place.id}`}>{place.label}</h2><p>{place.placeType} · {addressSummary(place)}</p></div>
        </header>
        <ul className="bd-facts">
          <li><Wind size={16} aria-hidden="true"/>{place.rooms?.length ? `${place.rooms.length} ห้อง · แอร์ ${place.unitCount ?? place.rooms.length} เครื่อง` : place.unitCount ? `แอร์ ${place.unitCount} เครื่อง` : 'ยังไม่ระบุจำนวนแอร์'}</li>
          {(place.contactName || place.contactPhone) && <li><Phone size={16} aria-hidden="true"/>
            <span>ผู้ติดต่อ {place.contactName || 'หน้างาน'}{place.contactPhone && <> · <a className="ui-link ui-num" href={telLink(place.contactPhone)}>{place.contactPhone}</a></>}</span>
          </li>}
        </ul>

        {stats.active
          ? <button type="button" className="jb-row bd-job" onClick={() => onOpenJob(stats.active!.id)}>
            <span className="jb-date"><strong>{day(stats.active.date).getDate()}</strong><small>{day(stats.active.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
            <span className="jb-row-text">
              <strong>{guideFor(stats.active).short}</strong>
              <span>{stats.active.code} · {timeLabel(stats.active)} · {stats.active.unitCount} เครื่อง</span>
              <StatusBadge status={stats.active.status}/>
            </span>
            <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
          </button>
          : stats.due
          ? <div className="ui-strip bd-due" role="status"><CalendarClock size={18} aria-hidden="true"/>
            <span><strong>{stats.dueRooms.length ? `ถึงรอบล้าง ${stats.dueRooms.length} ห้อง` : 'ถึงรอบล้างแอร์แล้ว'}</strong>
              {stats.dueRooms.length ? ` ${stats.dueRooms.slice(0, 8).join(', ')}${stats.dueRooms.length > 8 ? ' …' : ''}` : ''}</span>
          </div>
          : <p className="bd-next"><CalendarClock size={18} aria-hidden="true"/>
            <span>{stats.done[0]
              ? <><strong>ล้างครั้งถัดไป {stats.next!.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</strong> · ล้างล่าสุด {shortDate(stats.done[0].date)}</>
              : <><strong>ยังไม่เคยล้างผ่าน AirClean</strong> · ขอช่างครั้งแรกได้เลย</>}</span>
          </p>}

        <div className="bd-actions">
          {stats.dueRooms.length > 0 && !stats.active
            ? <button type="button" className="ui-btn is-primary is-lg" onClick={() => onBook(place.id, stats.dueRooms)}><Wind size={19}/> ขอช่างล้าง {stats.dueRooms.length} ห้องที่ถึงรอบ</button>
            : <button type="button" className={'ui-btn is-lg' + (stats.active ? '' : ' is-primary')} onClick={() => onBook(place.id)}><Wind size={19}/> ขอช่างล้างอาคารนี้</button>}
          <button type="button" className="ui-btn is-lg" onClick={() => setEditing(place)}>แก้ไข</button>
        </div>

        {stats.done.length > 0 && <details className="bd-history">
          <summary>ประวัติการล้าง {stats.done.length} ครั้ง · รวม <span className="ui-num">฿{stats.spent.toLocaleString()}</span></summary>
          <ul className="jb-rows">{stats.done.map(job => <li key={job.id}>
            <button type="button" className="jb-row" onClick={() => onOpenJob(job.id)}>
              <span className="jb-date"><strong>{day(job.date).getDate()}</strong><small>{day(job.date).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
              <span className="jb-row-text">
                <strong>{job.rooms?.length ? `${job.rooms.length} ห้อง · ` : ''}{job.unitCount} เครื่อง · ฿{job.price.toLocaleString()}</strong>
                <small>ช่าง {job.technician} · {job.code}{job.customerRating ? ` · ${job.customerRating} ดาว` : ''}</small>
              </span>
              <ChevronRight className="jb-row-go" size={18} aria-hidden="true"/>
            </button>
          </li>)}</ul>
        </details>}
      </article>
    </li>)}</ul>

    {editing && <BuildingEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
      onSaved={message => { setEditing(null); onNotice(message); load(); }}/>}
  </div>;
}

/** Adding or editing a building: where it is and who to call, then its rooms. Deleting asks once. */
function BuildingEditor({ initial, onClose, onSaved }: { initial: SavedAddress | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [place, setPlace] = useState<SavedAddress>(initial ?? { id: 'new', label: '', placeType: 'คอนโด', address: '', latitude: 13.7563, longitude: 100.5018, locationSelected: false });
  const [name, setName] = useState<RememberChoice>({ on: true, label: initial?.label ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const label = name.label.trim() || place.building?.trim() || '';
    if (!label) { setError('ตั้งชื่อเรียกอาคาร เช่น อาคาร A หรือชื่อหอพัก'); return; }
    if (!place.address.trim() || !place.locationSelected) { setError('ปักหมุดและกรอกที่อยู่อาคาร ช่างใช้นำทางไปหน้างาน'); return; }
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

  return <Sheet title={initial ? `แก้ไข ${initial.label}` : 'เพิ่มอาคาร'} sub="ใช้ทุกครั้งที่ขอช่าง ช่างเห็นผู้ติดต่อหลังคุณเลือกช่างแล้วเท่านั้น" onClose={onClose} wide
    footer={<button type="submit" form="bd-form" className="ui-btn is-primary is-lg is-block" disabled={busy} aria-busy={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกอาคาร'}</button>}>
    <form id="bd-form" className="rq" onSubmit={save} noValidate>
      <section className="rq-section" aria-labelledby="bd-where">
        <h3 id="bd-where" className="rq-title">ที่ตั้งและผู้ติดต่อ</h3>
        <LocationPicker value={place} onChange={setPlace} remember={name} onRememberChange={setName} forBuilding standalone/>
      </section>
      <section className="rq-section" aria-labelledby="bd-rooms">
        <div>
          <h3 id="bd-rooms" className="rq-title">ห้องที่มีแอร์</h3>
          <p className="bd-hint">แนะนำ ใส่ครั้งเดียว แล้วเลือกห้องตอนขอช่างได้ และรู้ว่าห้องไหนถึงรอบล้าง</p>
        </div>
        <RoomRosterEditor rooms={place.rooms ?? []} onChange={rooms => setPlace(previous => ({ ...previous, rooms, unitCount: rooms.length ? rooms.reduce((sum, room) => sum + room.units, 0) : previous.unitCount }))}/>
      </section>
      {error && <Problem>{error}</Problem>}
      {initial && <section className="rq-section">
        {confirmDelete
          ? <div className="jb-confirm is-danger" role="alertdialog" aria-label={`ยืนยันลบ ${initial.label}`}>
            <p>ลบ {initial.label}? ประวัติงานเดิมยังอยู่ใน “งานของอาคาร”</p>
            <div className="jb-confirm-actions"><button type="button" className="ui-btn is-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={17}/> ลบอาคาร</button><button type="button" className="ui-btn" onClick={() => setConfirmDelete(false)}>เก็บไว้</button></div>
          </div>
          : <button type="button" className="ui-btn is-danger bd-delete" onClick={() => setConfirmDelete(true)}><Trash2 size={17}/> ลบอาคารนี้</button>}
      </section>}
    </form>
  </Sheet>;
}
