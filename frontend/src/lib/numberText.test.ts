import { describe, expect, it } from 'vitest';
import { numberText } from './numberText';

describe('numberText', () => {
  it('lets the box be emptied instead of snapping back to 0', () => {
    expect(numberText('')).toBe('');
  });
  it('drops the zero left in front of what was typed', () => {
    expect(numberText('05')).toBe('5');
    expect(numberText('0550')).toBe('550');
    expect(numberText('0')).toBe('0');
    expect(numberText('00')).toBe('0');
  });
  it('keeps digits only', () => {
    expect(numberText('5 ปี')).toBe('5');
    expect(numberText('1,200')).toBe('1200');
    expect(numberText('-3')).toBe('3');
  });
  it('reads Thai digits', () => {
    expect(numberText('๕๕๐')).toBe('550');
  });
  it('allows one decimal point when asked', () => {
    expect(numberText('549.50', { decimals: 2 })).toBe('549.50');
    expect(numberText('549.505', { decimals: 2 })).toBe('549.50');
    expect(numberText('5.4.9', { decimals: 2 })).toBe('5.49');
    expect(numberText('.5', { decimals: 2 })).toBe('0.5');
    expect(numberText('549.5')).toBe('5495');
  });
  it('caps the length', () => {
    expect(numberText('1234567', { maxLength: 3 })).toBe('123');
  });
});
