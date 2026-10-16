import { useId, useState } from 'react';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { timeLabel, timeWindows } from '../lib/time';
import { Sheet } from './kit';
import './Request.css';

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
const longDay = (day: string) => new Date(day + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

/** A month grid in a sheet, so "another day" works the same on every phone and computer. */
function CalendarSheet({ value, min, max, onPick, onClose }: { value: string; min: string; max: string; onPick: (day: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(() => value.slice(0, 7));
  const first = new Date(month + '-01T00:00:00');
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (step: number) => setMonth(isoDay(new Date(first.getFullYear(), first.getMonth() + step, 15)).slice(0, 7));
  return <Sheet title="เลือกวัน" onClose={onClose} className="tm-calendar">
    <div className="tm-month">
      <button type="button" className="ui-icon-btn" onClick={() => shift(-1)} disabled={month <= min.slice(0, 7)} aria-label="เดือนก่อนหน้า"><ChevronLeft size={20}/></button>
      <strong aria-live="polite">{first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</strong>
      <button type="button" className="ui-icon-btn" onClick={() => shift(1)} disabled={month >= max.slice(0, 7)} aria-label="เดือนถัดไป"><ChevronRight size={20}/></button>
    </div>
    <div className="tm-grid">
      {weekdays.map(day => <span key={day} className="tm-weekday" aria-hidden="true">{day}</span>)}
      {cells.map((day, index) => day
        ? <button type="button" key={day} disabled={day < min || day > max || !dayOpen(day)} aria-pressed={day === value} aria-current={day === today() ? 'date' : undefined}
          aria-label={longDay(day)} className="tm-cell ui-num" onClick={() => onPick(day)}>{Number(day.slice(8))}</button>
        : <span key={'e' + index}/>)}
    </div>
  </Sheet>;
}

/** Day tiles for the coming week plus a calendar, and a time window (or an exact time) for the visit. */
export default function VisitTimePicker({ value, onChange }: { value: Visit; onChange: (value: Visit) => void }) {
  const id = useId();
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

  return <div className="tm">
    <div className="ui-field">
      <span className="ui-label" id={id + 'day'}>วันที่สะดวก</span>
      <div className="tm-days" role="radiogroup" aria-labelledby={id + 'day'}>
        {days.map(day => <button type="button" role="radio" aria-checked={value.date === day} key={day} className="tm-day" onClick={() => pickDay(day)} aria-label={longDay(day)}>
          <span aria-hidden="true">{label(day)}</span><strong className="ui-num" aria-hidden="true">{Number(day.slice(8))}</strong><small aria-hidden="true">{new Date(day + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short' })}</small>
        </button>)}
        <button type="button" className="tm-day is-other" aria-pressed={other} onClick={() => setCalendar(true)} aria-haspopup="dialog">
          <CalendarDays size={22} aria-hidden="true"/><small>{other ? new Date(value.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'วันอื่น'}</small>
        </button>
      </div>
    </div>
    {calendar && <CalendarSheet value={value.date} min={start} max={max} onClose={() => setCalendar(false)} onPick={day => { pickDay(day); setCalendar(false); }}/>}

    <div className="ui-field">
      <span className="ui-label" id={id + 'time'}>ช่วงเวลาที่สะดวก</span>
      <div className="tm-windows" role="radiogroup" aria-labelledby={id + 'time'}>
        {timeWindows.map(item => {
          const span = windowOn(value.date, item.key);
          return <button type="button" role="radio" key={item.key} aria-checked={value.window === item.key} disabled={!span}
            className="ui-option tm-window" onClick={() => onChange({ ...value, window: item.key, time: span!.split('-')[0] })}>
            <span className="ui-option-text"><strong>{item.label}</strong><small className="ui-num">{span ? span.replace('-', '–') : 'เลยเวลาแล้ว'}</small></span>
          </button>;
        })}
        <button type="button" role="radio" aria-checked={!value.window} className="ui-option tm-window"
          onClick={() => onChange({ ...value, window: null, time: exactOk(value.date, value.time) ? value.time : toTime(Math.max(earliest(value.date), 9 * 60)) })}>
          <span className="ui-option-text"><strong><Clock3 size={15} aria-hidden="true"/> ระบุเวลาเอง</strong><small>เลือกเวลาที่แน่นอน</small></span>
        </button>
      </div>
      {!value.window && <div className="tm-exact">
        <label htmlFor={id + 'exact'}>ให้ช่างมาถึงเวลา</label>
        <input id={id + 'exact'} className="ui-input ui-num" type="time" min={toTime(earliest(value.date))} max={toTime(CLOSE)} step={900} value={value.time}
          aria-invalid={!payload} onChange={event => onChange({ ...value, time: event.target.value })}/>
      </div>}
      {!value.window && !payload && <small className="is-error" role="alert">เลือกเวลาระหว่าง {toTime(earliest(value.date))}–20:00 น.</small>}
    </div>
    <p className="tm-picked">
      <CalendarCheck size={20} aria-hidden="true"/>
      <span><strong>{longDay(value.date)}{payload && <> · {timeLabel({ time: payload.time, timeWindow: payload.timeWindow })}</>}</strong>
        {payload?.timeWindow && <small>ช่างจะโทรนัดเวลาที่แน่นอนในช่วงนี้ก่อนเข้า</small>}</span>
    </p>
  </div>;
}
