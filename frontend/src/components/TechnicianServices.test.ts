import { describe, expect, it } from 'vitest';
import { sheetOf, toPriceText } from './TechnicianServices';
import { referenceSheet } from '../lib/pricing';

describe('sheetOf', () => {
  const services = { kinds: ['wall' as const], deep: true, others: [] };
  it('keeps a surcharge of 0 instead of falling back to the typical price', () => {
    const text = { ...toPriceText(referenceSheet), wall: '550', wallDeep: '1100', large: '0', hardAccess: '0' };
    const sheet = sheetOf(text, services);
    expect(sheet.large).toBe(0);
    expect(sheet.hardAccess).toBe(0);
    expect(sheet.wall).toBe(550);
  });
  it('uses the typical price only for an empty box', () => {
    const sheet = sheetOf({ ...toPriceText(referenceSheet), large: '' }, services);
    expect(sheet.large).toBe(referenceSheet.large);
  });
});
