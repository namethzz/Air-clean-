import { useMemo, useState } from 'react';
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { RoomEntry } from '../types';
import { byFloor, floorLabel, generateRooms, mergeRooms, parseRooms } from '../lib/rooms';

const unitsText = (rooms: RoomEntry[]) => {
  const units = rooms.reduce((sum, room) => sum + room.units, 0);
  return units === rooms.length ? `${rooms.length} ห้อง` : `${rooms.length} ห้อง · ${units} เครื่อง`;
};
const toNumber = (value: string, fallback: number) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? n : fallback; };

/**
 * The building's room list, set up once. Most buildings are "floors 2–12, 8 rooms a floor", so that is one line;
 * odd rooms (a lobby, a shop) are typed or pasted, and any room can be removed with a tap.
 */
export function RoomRosterEditor({ rooms, onChange }: { rooms: RoomEntry[]; onChange: (rooms: RoomEntry[]) => void }) {
  const [from, setFrom] = useState('2');
  const [to, setTo] = useState('8');
  const [perFloor, setPerFloor] = useState('8');
  const [units, setUnits] = useState('1');
  const [typed, setTyped] = useState('');
  const generated = useMemo(() => {
    const a = toNumber(from, 0), b = toNumber(to, 0), n = toNumber(perFloor, 0);
    return a > 0 && b > 0 && n > 0 && n <= 50 && Math.abs(b - a) < 100 ? generateRooms(a, b, n, Math.min(10, Math.max(1, toNumber(units, 1)))) : [];
  }, [from, to, perFloor, units]);
  const groups = byFloor(rooms);
  const preview = generated.length ? `${generated[0].name}–${generated[Math.min(generated.length, toNumber(perFloor, 1)) - 1].name} … ${generated[generated.length - 1].name}` : '';

  return <div className="rm-editor">
    <div className="rm-gen">
      <div className="rm-gen-row">
        <label><span>ตั้งแต่ชั้น</span><input inputMode="numeric" value={from} onChange={event => setFrom(event.target.value.replace(/\D/g, '').slice(0, 3))}/></label>
        <label><span>ถึงชั้น</span><input inputMode="numeric" value={to} onChange={event => setTo(event.target.value.replace(/\D/g, '').slice(0, 3))}/></label>
      </div>
      <div className="rm-gen-row">
        <label><span>ห้องต่อชั้น</span><input inputMode="numeric" value={perFloor} onChange={event => setPerFloor(event.target.value.replace(/\D/g, '').slice(0, 2))}/></label>
        <label><span>แอร์ห้องละ</span><input inputMode="numeric" value={units} onChange={event => setUnits(event.target.value.replace(/\D/g, '').slice(0, 2))}/></label>
      </div>
      <button type="button" className="cj-primary" disabled={!generated.length} onClick={() => onChange(mergeRooms(rooms, generated))}>
        <Sparkles size={17}/> {generated.length ? `สร้าง ${generated.length} ห้อง (${preview})` : 'กรอกชั้นและจำนวนห้อง'}
      </button>
    </div>
    <div className="rm-typed">
      <label className="form-field"><span>หรือพิมพ์เอง</span>
        <input value={typed} onChange={event => setTyped(event.target.value)} placeholder="เช่น 101-110, 215, ล็อบบี้ x3" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onChange(mergeRooms(rooms, parseRooms(typed))); setTyped(''); } }}/>
      </label>
      <button type="button" className="cj-ghost" disabled={!parseRooms(typed).length} onClick={() => { onChange(mergeRooms(rooms, parseRooms(typed))); setTyped(''); }}><Plus size={16}/> เพิ่ม</button>
    </div>
    {rooms.length > 0 && <div className="rm-list">
      <div className="rm-list-head"><strong>{unitsText(rooms)}</strong><button type="button" className="cj-link lp-danger" onClick={() => onChange([])}><Trash2 size={14}/> ล้างทั้งหมด</button></div>
      {groups.map(group => <div key={group.floor} className="rm-floor">
        <span className="rm-floor-name">{floorLabel(group.floor)}</span>
        <div className="rm-chips">{group.rooms.map(room => <button type="button" key={room.name} className="rm-chip removable" onClick={() => onChange(rooms.filter(item => item.name !== room.name))} aria-label={`ลบห้อง ${room.name}`}>
          {room.name}{room.units > 1 && <small>×{room.units}</small>}<X size={12}/>
        </button>)}</div>
      </div>)}
      <p className="rm-hint">แตะที่ห้องเพื่อลบ เช่น ห้องที่ไม่มีแอร์</p>
    </div>}
  </div>;
}

/** Which rooms this job covers: tap rooms, a whole floor, everything, or the rooms due for cleaning. */
export function RoomPicker({ rooms, selected, onChange, due }: { rooms: RoomEntry[]; selected: string[]; onChange: (names: string[]) => void; due: string[] }) {
  const chosen = new Set(selected);
  const groups = byFloor(rooms);
  const toggle = (names: string[], on: boolean) => {
    const next = new Set(chosen);
    names.forEach(name => on ? next.add(name) : next.delete(name));
    onChange(rooms.filter(room => next.has(room.name)).map(room => room.name));
  };
  const picked = rooms.filter(room => chosen.has(room.name));
  return <div className="rm-picker">
    <div className="rm-quick">
      <button type="button" className={'rm-quick-btn' + (picked.length === rooms.length ? ' active' : '')} onClick={() => onChange(rooms.map(room => room.name))}>ทุกห้อง ({rooms.length})</button>
      {due.length > 0 && due.length < rooms.length && <button type="button" className="rm-quick-btn due" onClick={() => onChange(due)}>ถึงรอบล้าง ({due.length})</button>}
      {picked.length > 0 && <button type="button" className="rm-quick-btn" onClick={() => onChange([])}>ล้างที่เลือก</button>}
    </div>
    {groups.map(group => {
      const names = group.rooms.map(room => room.name);
      const all = names.every(name => chosen.has(name));
      return <div key={group.floor} className="rm-floor">
        <button type="button" className={'rm-floor-name rm-floor-toggle' + (all ? ' active' : '')} onClick={() => toggle(names, !all)} aria-pressed={all}>{floorLabel(group.floor)}</button>
        <div className="rm-chips">{group.rooms.map(room => {
          const on = chosen.has(room.name);
          return <button type="button" key={room.name} aria-pressed={on} className={'rm-chip' + (on ? ' on' : '') + (due.includes(room.name) ? ' due' : '')} onClick={() => toggle([room.name], !on)}>
            {on && <Check size={13} strokeWidth={3}/>}{room.name}{room.units > 1 && <small>×{room.units}</small>}
          </button>;
        })}</div>
      </div>;
    })}
    <p className={'rm-summary' + (picked.length ? '' : ' empty')}>{picked.length ? `เลือก ${unitsText(picked)}` : 'ยังไม่ได้เลือกห้อง'}</p>
  </div>;
}

/** A job's rooms by floor: the technician ticks them off; the customer sees which are done. */
export function RoomBoard({ rooms, onToggle }: { rooms: { name: string; units: number; done: boolean }[]; onToggle?: (name: string) => void }) {
  const done = rooms.filter(room => room.done);
  return <div className="rm-board">
    <p className="rm-summary">ล้างแล้ว <strong>{done.length}</strong> จาก {rooms.length} ห้อง</p>
    <div className="cj-progress" aria-hidden="true"><span style={{ width: `${(done.length / Math.max(1, rooms.length)) * 100}%` }}/></div>
    {byFloor(rooms).map(group => <div key={group.floor} className="rm-floor">
      <span className="rm-floor-name">{floorLabel(group.floor)} <small>{group.rooms.filter(room => room.done).length}/{group.rooms.length}</small></span>
      <div className="rm-chips">{group.rooms.map(room => onToggle
        ? <button type="button" key={room.name} aria-pressed={room.done} className={'rm-chip big' + (room.done ? ' done' : '')} onClick={() => onToggle(room.name)}>
          {room.done && <Check size={14} strokeWidth={3}/>}{room.name}{room.units > 1 && <small>×{room.units}</small>}
        </button>
        : <span key={room.name} className={'rm-chip' + (room.done ? ' done' : '')}>{room.done && <Check size={13} strokeWidth={3}/>}{room.name}</span>)}
      </div>
    </div>)}
  </div>;
}
