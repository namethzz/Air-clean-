import { describe, expect, it } from 'vitest';
import { clashesWith, sameDay } from './clash';
import type { Booking } from '../types';

const job = (id: number, date: string, time: string, timeWindow: string | null, status: Booking['status'] = 'ยืนยันแล้ว') =>
  ({ id, code: `AC-${id}`, date, time, timeWindow, status }) as Booking;

describe('clashesWith', () => {
  const mine = [job(1, '2026-10-20', '08:00', '08:00-12:00'), job(2, '2026-10-20', '13:00', null), job(3, '2026-10-21', '08:00', '08:00-12:00')];

  it('finds a visit whose window overlaps on the same day', () => {
    const found = clashesWith(job(9, '2026-10-20', '10:00', '10:00-11:00'), mine);
    expect(found.map(item => item.job.id)).toEqual([1]);
    expect(found[0].soft).toBe(false);
  });
  it('treats an exact time as about two hours on site', () => {
    expect(clashesWith(job(9, '2026-10-20', '14:30', null), mine).map(item => item.job.id)).toEqual([2]);
    expect(clashesWith(job(9, '2026-10-20', '15:00', null), mine)).toEqual([]);
  });
  it('marks "any time of day" as a soft clash', () => {
    const found = clashesWith(job(9, '2026-10-20', '08:00', '08:00-20:00'), mine);
    expect(found.length).toBe(2);
    expect(found.every(item => item.soft)).toBe(true);
  });
  it('ignores other days, the job itself, and offers not yet accepted', () => {
    expect(clashesWith(job(1, '2026-10-20', '08:00', '08:00-12:00'), mine)).toEqual([]);
    expect(clashesWith(job(9, '2026-10-20', '09:00', '09:00-10:00'), [job(5, '2026-10-20', '08:00', '08:00-12:00', 'รอเลือกช่าง')])).toEqual([]);
  });
  it('counts the visits already on a day', () => {
    expect(sameDay('2026-10-20', mine)).toBe(2);
  });
});
