import type { Booking } from '../types';

/** Air conditioners want cleaning about every six months. */
export const CLEANING_MONTHS = 6;

/** The last finished cleaning and when the next one is due, or null before the first one. */
export function nextCleaning(bookings: Booking[], now = Date.now()): { last: Booking; next: Date; overdue: boolean } | null {
  const done = bookings.filter(item => item.status === 'เสร็จสิ้น').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!done.length) return null;
  const next = new Date(done[0].date + 'T00:00:00');
  next.setMonth(next.getMonth() + CLEANING_MONTHS);
  return { last: done[0], next, overdue: next.getTime() < now };
}
