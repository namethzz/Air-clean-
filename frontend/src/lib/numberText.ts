/**
 * Cleans what someone types into a number box, kept as text so the box can be emptied.
 * (A box bound to a number turns an empty box into 0, and the next key then reads "05".)
 * Keeps digits only, plus one decimal point when `decimals` is above 0; drops leading zeros;
 * reads Thai digits (๐–๙) as 0–9.
 */
export function numberText(input: string, { decimals = 0, maxLength = 9 }: { decimals?: number; maxLength?: number } = {}): string {
  let text = input.replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - 0x0e50)).replace(decimals ? /[^\d.]/g : /\D/g, '');
  if (decimals) {
    const point = text.indexOf('.');
    if (point >= 0) text = text.slice(0, point + 1) + text.slice(point + 1).replace(/\./g, '').slice(0, decimals);
    if (text.startsWith('.')) text = '0' + text;
  }
  return text.replace(/^0+(?=\d)/, '').slice(0, maxLength);
}
