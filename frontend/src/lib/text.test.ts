import { describe, expect, it } from 'vitest';
import { bahtText } from './bahtText';
import { initialsOf } from './initials';
import { timeLabel } from './time';

describe('bahtText', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [5500.5, 'ห้าพันห้าร้อยบาทห้าสิบสตางค์'],
    [1_000_001, 'หนึ่งล้านเอ็ดบาทถ้วน'],
    [2_500_000, 'สองล้านห้าแสนบาทถ้วน'],
  ])('%d → %s', (amount, words) => expect(bahtText(amount)).toBe(words));
});

describe('initialsOf', () => {
  it.each([
    ['Nameth Wongmongkol', 'NW'],
    ['สมชาย ใจดี', 'สม'],
    ['เอกชัย ศรีสุข', 'อก'],
    [null, 'ช'],
  ])('%s → %s', (name, expected) => expect(initialsOf(name)).toBe(expected));
});

describe('timeLabel', () => {
  it('names preset windows', () => expect(timeLabel({ time: '08:00', timeWindow: '08:00-12:00' })).toBe('ช่วงเช้า 08:00–12:00 น.'));
  it('shows custom windows as a range', () => expect(timeLabel({ time: '09:30', timeWindow: '09:30-11:00' })).toBe('09:30–11:00 น.'));
  it('shows an exact time', () => expect(timeLabel({ time: '14:30' })).toBe('14:30 น.'));
});
