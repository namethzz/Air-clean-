import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { timeLabel, timeWindows } from '../lib/time';

/** A day plus either a window ("12:00-17:00") or one exact time. */
export interface Visit { date: string; window: string | null; time: string; }

const DAY_MS = 86400000;
const OPEN = 7 * 60, CLOSE = 20 * 60;
const toMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export function isoDay(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const addDays = (day: string, days: number) => isoDay(new Date(new Date(day + 'T00:00:00').getTime() + days * DAY_MS + 3600000));
const today = () => isoDay(new Date());

/** Earliest start on that day: an hour from now (rounded up to half an hour) for today, otherwise opening time. */
function earliest(day: string) {
  if (day !== today()) return OPEN;
  const now = new Date();
  return Math.max(OPEN, Math.ceil((now.getHours() * 60 + now.getMinutes() + 60) / 30) * 30);
}
/** A window shortened to what is still possible today, or null when less than an hour of it is left. */
export function windowOn(day: string, key: string): string | null {
  const [from, to] = key.split('-').map(toMinutes);
  const start = Math.max(from, earliest(day));
  return to - start >= 60 ? `${toTime(start)}-${toTime(to)}` : null;
}
const exactOk = (day: string, time: string) => /^\d{2}:\d{2}$/.test(time) && toMinutes(time) >= earliest(day) && toMinutes(time) <= CLOSE;
const dayOpen = (day: string) => timeWindows.some(item => windowOn(day, item.key));

/** The first sensible choice: this morning if there is still time, otherwise the next possible window. */
export function defaultVisit(): Visit {
  const day = dayOpen(today()) ? today() : addDays(today(), 1);
  const key = timeWindows.find(item => windowOn(day, item.key))!.key;
  return { date: day, window: key, time: windowOn(day, key)!.split('-')[0] };
}
/** What gets sent: the start time, and the window when one was chosen. Null when the exact time is not valid. */
export function visitPayload(visit: Visit): { time: string; timeWindow?: string } | null {
  if (visit.window) { const span = windowOn(visit.date, visit.window); return span ? { time: span.split('-')[0], timeWindow: span } : null; }
  return exactOk(visit.date, visit.time) ? { time: visit.time } : null;
}

const weekdays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/** A month grid in a sheet, so "another day" works the same on every phone and computer. */
function CalendarSheet({ value, min, max, onPick, onClose }: { value: string; min: string; max: string; onPick: (day: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(() => value.slice(0, 7));
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const first = new Date(month + '-01T00:00:00');
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (step: number) => setMonth(isoDay(new Date(first.getFullYear(), first.getMonth() + step, 15)).slice(0, 7));
  return <div className="vt-sheet-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="vt-sheet" role="dialog" aria-modal="true" aria-label="เลือกวัน">
      <header>
        <button type="button" onClick={() => shift(-1)} disabled={month <= min.slice(0, 7)} aria-label="เดือนก่อนหน้า"><ChevronLeft size={20}/></button>
        <strong>{first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" onClick={() => shift(1)} disabled={month >= max.slice(0, 7)} aria-label="เดือนถัดไป"><ChevronRight size={20}/></button>
        <button type="button" className="vt-sheet-close" onClick={onClose} aria-label="ปิด"><X size={20}/></button>
      </header>
      <div className="vt-grid" role="grid">
        {weekdays.map(day => <span key={day} className="vt-weekday">{day}</span>)}
        {cells.map((day, index) => day
          ? <button type="button" key={day} disabled={day < min || day > max || !dayOpen(day)} className={'vt-cell' + (day === value ? ' active' : '') + (day === today() ? ' today' : '')} onClick={() => onPick(day)}>{Number(day.slice(8))}</button>
          : <span key={'e' + index}/>)}
      </div>
    </section>
  </div>;
}

/** Day cards for the coming week plus a calendar, and a time window (or an exact time) for the visit. */
export default function VisitTimePicker({ value, onChange }: { value: Visit; onChange: (value: Visit) => void }) {
  const [calendar, setCalendar] = useState(false);
  const start = dayOpen(today()) ? today() : addDays(today(), 1);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const max = addDays(today(), 90);
  const other = !days.includes(value.date);

  function pickDay(day: string) {
    // Keep the chosen window or time when it still works on the new day; otherwise take the first that does.
    if (value.window ? windowOn(day, value.window) : exactOk(day, value.time)) { onChange({ ...value, date: day }); return; }
    const key = timeWindows.find(item => windowOn(day, item.key))!.key;
    onChange({ date: day, window: key, time: windowOn(day, key)!.split('-')[0] });
  }
  const payload = visitPayload(value);
  const label = (day: string) => day === today() ? 'วันนี้' : day === addDays(today(), 1) ? 'พรุ่งนี้' : new Date(day + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short' });

  return <>
    <div className="bk-field">
      <span className="bk-label" id="vt-day-label">วันที่สะดวก</span>
      <div className="vt-days" role="radiogroup" aria-labelledby="vt-day-label">
        {days.map(day => <button type="button" role="radio" aria-checked={value.date === day} key={day} className={'vt-day' + (value.date === day ? ' active' : '')} onClick={() => pickDay(day)}>
          <span>{label(day)}</span><strong>{Number(day.slice(8))}</strong><small>{new Date(day + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</small>
        </button>)}
        <button type="button" className={'vt-day vt-day-other' + (other ? ' active' : '')} onClick={() => setCalendar(true)} aria-haspopup="dialog">
          <CalendarDays size={20}/><small>{other ? new Date(value.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'วันอื่น'}</small>
        </button>
      </div>
    </div>
    {calendar && <CalendarSheet value={value.date} min={start} max={max} onClose={() => setCalendar(false)} onPick={day => { pickDay(day); setCalendar(false); }}/>}

    <div className="bk-field">
      <span className="bk-label" id="vt-time-label">ช่วงเวลาที่สะดวก</span>
      <div className="vt-windows" role="radiogroup" aria-labelledby="vt-time-label">
        {timeWindows.map(item => {
          const span = windowOn(value.date, item.key);
          return <button type="button" role="radio" key={item.key} aria-checked={value.window === item.key} disabled={!span}
            className={'vt-window' + (value.window === item.key ? ' active' : '')} onClick={() => onChange({ ...value, window: item.key, time: span!.split('-')[0] })}>
            <strong>{item.label}</strong><small>{span ? span.replace('-', '–') : 'เลยเวลาแล้ว'}</small>
          </button>;
        })}
        <button type="button" role="radio" aria-checked={!value.window} className={'vt-window' + (!value.window ? ' active' : '')}
          onClick={() => onChange({ ...value, window: null, time: exactOk(value.date, value.time) ? value.time : toTime(Math.max(earliest(value.date), 9 * 60)) })}>
          <strong><Clock3 size={15}/> ระบุเวลาเอง</strong><small>เลือกเวลาที่แน่นอน</small>
        </button>
      </div>
      {!value.window && <label className="vt-exact">
        <span>ให้ช่างมาถึงเวลา</span>
        <input type="time" min={toTime(earliest(value.date))} max={toTime(CLOSE)} step={900} value={value.time} onChange={event => onChange({ ...value, time: event.target.value })}/>
      </label>}
      {!value.window && !payload && <p className="vt-error" role="alert">เลือกเวลาระหว่าง {toTime(earliest(value.date))}–20:00 น.</p>}
      <p className="bk-picked">
        {new Date(value.date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
        {payload && <> · {timeLabel({ time: payload.time, timeWindow: payload.timeWindow })}</>}
        {payload?.timeWindow && <><br/><span>ช่างจะโทรนัดเวลาที่แน่นอนในช่วงนี้ก่อนเข้า</span></>}
      </p>
    </div>
  </>;
}
