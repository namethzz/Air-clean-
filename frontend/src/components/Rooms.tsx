import { useMemo, useState } from 'react';
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import './Request.css';
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
  const addTyped = () => { onChange(mergeRooms(rooms, parseRooms(typed))); setTyped(''); };
  const field = (label: string, value: string, set: (value: string) => void, digits: number) => <label className="ui-field">
    <span className="ui-label">{label}</span>
    <input className="ui-input ui-num" inputMode="numeric" value={value} onFocus={event => event.currentTarget.select()} onChange={event => set(event.target.value.replace(/\D/g, '').slice(0, digits))}/>
  </label>;

  return <div className="rp rp-editor">
    <div className="rp-gen">
      <div className="rp-gen-fields">
        {field('ตั้งแต่ชั้น', from, setFrom, 3)}
        {field('ถึงชั้น', to, setTo, 3)}
        {field('ห้องต่อชั้น', perFloor, setPerFloor, 2)}
        {field('แอร์ห้องละ', units, setUnits, 2)}
      </div>
      <button type="button" className="ui-btn is-primary is-block" disabled={!generated.length} onClick={() => onChange(mergeRooms(rooms, generated))}>
        <Sparkles size={18}/> {generated.length ? `สร้าง ${generated.length} ห้อง (${preview})` : 'กรอกชั้นและจำนวนห้อง'}
      </button>
    </div>
    <label className="ui-field">
      <span className="ui-label">หรือพิมพ์เอง</span>
      <span className="rp-typed">
        <input className="ui-input" value={typed} onChange={event => setTyped(event.target.value)} placeholder="เช่น 101-110, 215, ล็อบบี้ x3" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTyped(); } }}/>
        <button type="button" className="ui-btn" disabled={!parseRooms(typed).length} onClick={addTyped}><Plus size={17}/> เพิ่ม</button>
      </span>
    </label>
    {rooms.length > 0 && <div className="rp-list">
      <div className="rp-list-head"><strong>{unitsText(rooms)}</strong><button type="button" className="ui-btn is-ghost is-sm rp-remove-all" onClick={() => onChange([])}><Trash2 size={15}/> ลบทั้งหมด</button></div>
      {groups.map(group => <div key={group.floor} className="rp-floor">
        <span className="rp-floor-name">{floorLabel(group.floor)}</span>
        <div className="rp-rooms">{group.rooms.map(room => <button type="button" key={room.name} className="rp-room is-removable" onClick={() => onChange(rooms.filter(item => item.name !== room.name))} aria-label={`ลบห้อง ${room.name}`}>
          {room.name}{room.units > 1 && <small>×{room.units}</small>}<X size={13} aria-hidden="true"/>
        </button>)}</div>
      </div>)}
      <p className="rp-hint">แตะที่ห้องเพื่อลบ เช่น ห้องที่ไม่มีแอร์</p>
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
  const showDue = due.length > 0 && due.length < rooms.length;
  return <div className="rp">
    <div className="rp-quick">
      <button type="button" className="ui-chip" aria-pressed={picked.length === rooms.length} onClick={() => onChange(rooms.map(room => room.name))}>ทุกห้อง <b>{rooms.length}</b></button>
      {showDue && <button type="button" className="ui-chip rp-due-chip" aria-pressed={picked.length === due.length && due.every(name => chosen.has(name))} onClick={() => onChange(due)}><span className="rp-dot" aria-hidden="true"/>ถึงรอบล้าง <b>{due.length}</b></button>}
      {picked.length > 0 && <button type="button" className="ui-btn is-ghost is-sm" onClick={() => onChange([])}>ยกเลิกที่เลือก</button>}
    </div>
    {groups.map(group => {
      const names = group.rooms.map(room => room.name);
      const all = names.every(name => chosen.has(name));
      return <div key={group.floor} className="rp-floor">
        <button type="button" className="rp-floor-name is-toggle" onClick={() => toggle(names, !all)} aria-pressed={all}>{floorLabel(group.floor)}</button>
        <div className="rp-rooms">{group.rooms.map(room => {
          const on = chosen.has(room.name);
          const isDue = showDue && due.includes(room.name);
          return <button type="button" key={room.name} aria-pressed={on} className={'rp-room' + (isDue ? ' is-due' : '')} onClick={() => toggle([room.name], !on)}
            aria-label={`ห้อง ${room.name}${room.units > 1 ? ` ${room.units} เครื่อง` : ''}${isDue ? ' ถึงรอบล้าง' : ''}`}>
            {on && <Check size={14} strokeWidth={3} aria-hidden="true"/>}{room.name}{room.units > 1 && <small>×{room.units}</small>}{isDue && <span className="rp-dot" aria-hidden="true"/>}
          </button>;
        })}</div>
      </div>;
    })}
    <p className={'rp-summary' + (picked.length ? '' : ' is-empty')} aria-live="polite">{picked.length ? `เลือก ${unitsText(picked)}` : 'ยังไม่ได้เลือกห้อง'}{showDue && <span className="rp-legend"><span className="rp-dot" aria-hidden="true"/> ถึงรอบล้าง</span>}</p>
  </div>;
}

/** A job's rooms by floor: the technician ticks them off; the customer sees which are done. */
export function RoomBoard({ rooms, onToggle }: { rooms: { name: string; units: number; done: boolean }[]; onToggle?: (name: string) => void }) {
  const done = rooms.filter(room => room.done);
  return <div className="rp rp-board">
    <p className="rp-summary">ล้างแล้ว <strong className="ui-num">{done.length}</strong> จาก <span className="ui-num">{rooms.length}</span> ห้อง</p>
    <div className="rp-bar" aria-hidden="true"><span style={{ width: `${(done.length / Math.max(1, rooms.length)) * 100}%` }}/></div>
    {byFloor(rooms).map(group => <div key={group.floor} className="rp-floor">
      <span className="rp-floor-name">{floorLabel(group.floor)} <small className="ui-num">{group.rooms.filter(room => room.done).length}/{group.rooms.length}</small></span>
      <div className="rp-rooms">{group.rooms.map(room => onToggle
        ? <button type="button" key={room.name} aria-pressed={room.done} className="rp-room is-big is-tick" onClick={() => onToggle(room.name)}>
          {room.done && <Check size={15} strokeWidth={3} aria-hidden="true"/>}{room.name}{room.units > 1 && <small>×{room.units}</small>}
        </button>
        : <span key={room.name} className={'rp-room is-static' + (room.done ? ' is-done' : '')}>{room.done && <Check size={14} strokeWidth={3} aria-hidden="true"/>}{room.name}</span>)}
      </div>
    </div>)}
  </div>;
}
