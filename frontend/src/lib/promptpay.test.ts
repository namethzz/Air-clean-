import { describe, expect, it } from 'vitest';
import { promptPayPayload } from './promptpay';

// Expected payloads were produced by the widely used promptpay-qr npm package for the same inputs.
describe('promptPayPayload', () => {
  it('builds a phone-number QR with the amount filled in', () => {
    expect(promptPayPayload('0812345678', 398)).toBe('00020101021229370016A000000677010111011300668123456785802TH53037645406398.006304B906');
  });
  it('builds a reusable QR when there is no amount', () => {
    expect(promptPayPayload('0812345678')).toBe('00020101021129370016A000000677010111011300668123456785802TH530376463045D82');
  });
  it('builds a national-ID QR', () => {
    expect(promptPayPayload('1234567890123', 199.5)).toBe('00020101021229370016A000000677010111021312345678901235802TH53037645406199.50630463B8');
  });
  it('ignores dashes and spaces in the number', () => {
    expect(promptPayPayload('081-234-5678', 398)).toBe(promptPayPayload('0812345678', 398));
  });
});
