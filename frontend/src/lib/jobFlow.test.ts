import { describe, expect, it } from 'vitest';
import { currentStep, guideFor, minutesToPick, needsAction } from './jobFlow';
import type { Booking } from '../types';

const booking = (fields: Partial<Booking>) => ({ id: 1, technician: '-', applicants: [], ...fields }) as Booking;

describe('job flow', () => {
  it('counts down the hour to pick a technician', () => {
    const now = Date.parse('2026-10-20T03:00:00Z');
    expect(minutesToPick(booking({ status: 'รอเลือกช่าง', offerDeadline: '2026-10-20T03:42:10Z' }), now)).toBe(43);
    expect(minutesToPick(booking({ status: 'รอเลือกช่าง', offerDeadline: '2026-10-20T02:00:00Z' }), now)).toBe(0);
    expect(minutesToPick(booking({ status: 'ยืนยันแล้ว', offerDeadline: '2026-10-20T03:42:10Z' }), now)).toBeNull();
  });
  it('asks the customer to act when offers lapsed', () => {
    const lapsed = booking({ status: 'หมดเวลาเลือกช่าง' });
    expect(needsAction(lapsed)).toBe(true);
    expect(currentStep(lapsed)).toBe(1);
  });
  it('puts spaces around a technician name in Thai sentences', () => {
    expect(guideFor(booking({ status: 'ยืนยันแล้ว', technician: 'Nameth Wongmongkol' })).title).toBe('Nameth Wongmongkol รับงานแล้ว');
    expect(guideFor(booking({ status: 'รอยืนยัน', technician: '-' })).title).toBe('รอช่างตอบรับ');
  });
});
