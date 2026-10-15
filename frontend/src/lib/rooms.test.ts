import { describe, expect, it } from 'vitest';
import { byFloor, generateRooms, mergeRooms, parseRooms } from './rooms';

describe('rooms', () => {
  it('generates a floor-by-floor list', () => {
    expect(generateRooms(2, 3, 2).map(room => room.name)).toEqual(['201', '202', '301', '302']);
  });
  it('reads typed lists with ranges and units per room', () => {
    expect(parseRooms('101-103, 215, ล็อบบี้ x3')).toEqual([
      { name: '101', units: 1 }, { name: '102', units: 1 }, { name: '103', units: 1 }, { name: '215', units: 1 }, { name: 'ล็อบบี้', units: 3 },
    ]);
  });
  it('keeps leading zeros and prefixes in ranges', () => {
    expect(parseRooms('A08-A10').map(room => room.name)).toEqual(['A08', 'A09', 'A10']);
  });
  it('merges without duplicates and groups by floor', () => {
    const merged = mergeRooms(generateRooms(2, 2, 2), parseRooms('202, 301'));
    expect(merged.map(room => room.name)).toEqual(['201', '202', '301']);
    expect(byFloor(merged).map(group => group.floor)).toEqual(['2', '3']);
  });
});
