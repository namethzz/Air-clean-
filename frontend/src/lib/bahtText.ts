const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const places = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function underMillion(n: number): string {
  const text = String(n);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const d = Number(text[i]), place = text.length - i - 1;
    if (d === 0) continue;
    if (place === 1 && d === 1) out += 'สิบ';
    else if (place === 1 && d === 2) out += 'ยี่สิบ';
    else if (place === 0 && d === 1 && text.length > 1) out += 'เอ็ด';
    else out += digits[d] + places[place];
  }
  return out;
}
function integerText(n: number): string {
  if (n === 0) return 'ศูนย์';
  const millions = Math.floor(n / 1_000_000), rest = n % 1_000_000;
  return (millions ? integerText(millions) + 'ล้าน' : '') + (rest ? underMillion(rest) : '');
}

/** 5500.5 → "ห้าพันห้าร้อยบาทห้าสิบสตางค์", the amount in words printed on Thai receipts. */
export function bahtText(amount: number): string {
  const satang = Math.round(amount * 100) % 100;
  const baht = Math.floor(Math.round(amount * 100) / 100);
  return `${integerText(baht)}บาท${satang ? integerText(satang) + 'สตางค์' : 'ถ้วน'}`;
}
