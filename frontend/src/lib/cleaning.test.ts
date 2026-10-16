import { describe, expect, it } from 'vitest';
import { nextCleaning } from './cleaning';
import type { Booking } from '../types';

const job = (id: number, date: string, status: string) => ({ id, date, time: '09:00', status }) as unknown as Booking;

describe('nextCleaning', () => {
  it('is null before the first finished cleaning', () => {
    expect(nextCleaning([job(1, '2026-01-10', 'ยืนยันแล้ว')])).toBeNull();
  });
  it('counts six months from the latest finished cleaning', () => {
    const result = nextCleaning([job(1, '2026-01-10', 'เสร็จสิ้น'), job(2, '2026-03-05', 'เสร็จสิ้น')], new Date('2026-05-01').getTime());
    expect(result?.last.id).toBe(2);
    expect(result?.next.getMonth()).toBe(8);
    expect(result?.overdue).toBe(false);
  });
  it('is overdue once the date has passed', () => {
    expect(nextCleaning([job(1, '2025-01-10', 'เสร็จสิ้น')], new Date('2026-01-01').getTime())?.overdue).toBe(true);
  });
});
