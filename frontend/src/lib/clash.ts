import type { Booking } from '../types';

/** Visits that hold the technician's time: chosen and not finished. Offers still waiting on a customer don't. */
const holding = ['รอยืนยัน', 'ยืนยันแล้ว', 'กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ'];
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
/** An exact time is taken to need about two hours on site. */
const EXACT_VISIT_MINUTES = 120;

function span(job: Pick<Booking, 'time' | 'timeWindow'>): [number, number] {
  if (job.timeWindow) { const [from, to] = job.timeWindow.split('-'); return [minutes(from), minutes(to)]; }
  const start = minutes(job.time);
  return [start, start + EXACT_VISIT_MINUTES];
}

/** "Any time of day" windows fit around other work, so they are a soft clash rather than a hard one. */
const flexible = (job: Pick<Booking, 'timeWindow'>) => job.timeWindow === '08:00-20:00';

export interface Clash { job: Booking; soft: boolean }

/** The technician's own visits on the same day whose times overlap this job. */
export function clashesWith(job: Pick<Booking, 'id' | 'date' | 'time' | 'timeWindow'>, mine: Booking[]): Clash[] {
  const [a1, a2] = span(job);
  return mine.filter(other => other.id !== job.id && other.date === job.date && holding.includes(other.status))
    .filter(other => { const [b1, b2] = span(other); return a1 < b2 && b1 < a2; })
    .map(other => ({ job: other, soft: flexible(job) || flexible(other) }));
}

/** How many visits the technician already has that day. */
export const sameDay = (date: string, mine: Booking[]) => mine.filter(other => other.date === date && holding.includes(other.status)).length;
