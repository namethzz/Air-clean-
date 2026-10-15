/**
 * The Thai PromptPay QR payload (EMVCo), with the amount filled in so the banking app shows it ready to pay.
 * The target is a mobile number (10 digits) or a national/tax ID (13 digits).
 */
export function promptPayPayload(target: string, amount?: number): string {
  const digits = target.replace(/\D/g, '');
  const field = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;
  const account = digits.length === 13
    ? field('02', digits)
    : field('01', ('66' + digits.replace(/^0/, '')).padStart(13, '0'));
  const body = [
    field('00', '01'),
    field('01', amount ? '12' : '11'),
    field('29', field('00', 'A000000677010111') + account),
    field('58', 'TH'),
    field('53', '764'),
    amount ? field('54', amount.toFixed(2)) : '',
  ].join('') + '6304';
  return body + crc16(body);
}

/** CRC-16/CCITT-FALSE, as the EMVCo QR specification requires. */
function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
