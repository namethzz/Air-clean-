import type { AcKind, JobItem, LastCleaned, PriceLine, PricePosition, PriceRange, PriceSheet, Symptom } from '../types';

/**
 * How AirClean prices a cleaning, mirrored from the server's Pricing (Services/Pricing.cs): the customer describes what
 * they can see, each technician quotes from their own price list, and the going rate shows whether a quote is fair.
 */
export const kindNames: Record<AcKind, string> = { wall: 'ติดผนัง', hanging: 'แขวน/ตั้งพื้น', cassette: 'ฝังฝ้า' };
export const acKinds: AcKind[] = ['wall', 'hanging', 'cassette'];
export const cleanName = (deep: boolean) => deep ? 'ล้างใหญ่' : 'ล้างธรรมดา';

/** AirClean's reference prices, the same as the server's: used until there are enough technicians, and when offline. */
export const referenceSheet: PriceSheet = { wall: 600, wallDeep: 1200, hanging: 1000, hangingDeep: 1800, cassette: 1200, cassetteDeep: 2200, large: 200, hardAccess: 300 };

export const lastCleanedOptions: { key: LastCleaned; label: string }[] = [
  { key: 'under6m', label: 'ไม่เกิน 6 เดือน' }, { key: '6to12m', label: '6–12 เดือน' }, { key: 'over1y', label: 'เกิน 1 ปี / ไม่เคยล้าง' }, { key: 'unknown', label: 'จำไม่ได้' },
];
export const symptomOptions: { key: Symptom; label: string }[] = [
  { key: 'drip', label: 'น้ำหยด' }, { key: 'warm', label: 'ไม่ค่อยเย็น' }, { key: 'smell', label: 'มีกลิ่นอับ' }, { key: 'noise', label: 'เสียงดัง / ลมออกน้อย' },
];
export const lastCleanedName = (key?: string | null) => lastCleanedOptions.find(item => item.key === key)?.label;
export const symptomName = (key: string) => symptomOptions.find(item => item.key === key)?.label ?? key;

/** "ล้างล่าสุด เกิน 1 ปี · มีกลิ่นอับ": what the customer said about the units' state, or "" when they said nothing. */
export function conditionText(job: { lastCleaned?: string | null; symptoms?: string[] | null }): string {
  return [job.lastCleaned ? 'ล้างล่าสุด ' + lastCleanedName(job.lastCleaned) : '', ...(job.symptoms ?? []).map(symptomName)].filter(Boolean).join(' · ');
}

/** What every quote includes, so offers compare like for like; work outside it must be asked for in the app. */
export const included: Record<'standard' | 'deep', string[]> = {
  standard: ['ล้างแผ่นกรองฝุ่น', 'ฉีดน้ำแรงดันล้างแผงคอยล์เย็น', 'ล้างถาดและไล่ท่อน้ำทิ้ง', 'ฉีดล้างคอยล์ร้อน (ตัวนอกบ้าน)', 'วัดแรงดันน้ำยาและทดสอบความเย็น'],
  deep: ['ทุกอย่างในล้างธรรมดา', 'ถอดฝาครอบและถาดน้ำทิ้งออกมาล้าง', 'ถอดล้างพัดลมกรงกระรอก (ต้นเหตุกลิ่นและลมอ่อน)'],
};
export const notIncluded = 'ไม่รวมเติมน้ำยา ซ่อม หรือเปลี่ยนอะไหล่';

export function perUnit(sheet: PriceSheet, kind: AcKind, deep: boolean): number {
  if (kind === 'hanging') return deep ? sheet.hangingDeep : sheet.hanging;
  if (kind === 'cassette') return deep ? sheet.cassetteDeep : sheet.cassette;
  return deep ? sheet.wallDeep : sheet.wall;
}

export const unitsOf = (items: JobItem[]) => items.reduce((sum, item) => sum + item.count, 0);

/** The same lines the server works out: one per kind of unit, then large units and hard-to-reach outdoor units. */
export function priceLines(sheet: PriceSheet, items: JobItem[], deep: boolean, hardAccessUnits: number): PriceLine[] {
  const lines: PriceLine[] = [];
  for (const kind of acKinds) {
    const count = items.filter(item => item.kind === kind).reduce((sum, item) => sum + item.count, 0);
    if (!count) continue;
    const each = perUnit(sheet, kind, deep);
    lines.push({ kind: 'clean', label: `${cleanName(deep)} · แอร์${kindNames[kind]}`, quantity: count, unitPrice: each, amount: each * count });
  }
  const large = items.reduce((sum, item) => sum + Math.min(item.large, item.count), 0);
  if (large) lines.push({ kind: 'large', label: 'เพิ่ม: แอร์ใหญ่กว่า 24,000 BTU', quantity: large, unitPrice: sheet.large, amount: sheet.large * large });
  const hard = Math.max(0, Math.min(hardAccessUnits, unitsOf(items)));
  if (hard) lines.push({ kind: 'access', label: 'เพิ่ม: คอยล์ร้อนอยู่ที่สูงหรือเข้าถึงยาก', quantity: hard, unitPrice: sheet.hardAccess, amount: sheet.hardAccess * hard });
  return lines;
}

export const total = (lines: PriceLine[]) => lines.reduce((sum, line) => sum + line.amount, 0);

/** The reference range, as the server gives it while there are too few technicians (and the fallback when offline). */
export function referenceRange(items: JobItem[], deep: boolean, hardAccessUnits: number): PriceRange {
  const mid = total(priceLines(referenceSheet, items, deep, hardAccessUnits));
  const ten = (value: number) => Math.round(value / 10) * 10;
  return { low: ten(mid * 0.85), mid, high: ten(mid * 1.25), technicians: 0, reference: true };
}

/** "ล้างธรรมดา แอร์ติดผนัง + ฝังฝ้า", as the server names the job. */
export function serviceName(items: JobItem[], deep: boolean): string {
  const kinds = acKinds.filter(kind => items.some(item => item.kind === kind && item.count > 0)).map(kind => kindNames[kind]);
  return `${cleanName(deep)} แอร์${(kinds.length ? kinds : [kindNames.wall]).join(' + ')}`;
}

/**
 * Whether a deep clean is worth it, from what the customer told us. A smell or weak airflow comes from a dirty blower,
 * which only a deep clean reaches; a year or more without cleaning usually needs it too. A drip or weak cooling is
 * mostly a blocked drain or low refrigerant: a standard clean (and the refrigerant check in it) comes first.
 */
export function recommendation(lastCleaned: LastCleaned | '', symptoms: Symptom[]): { deep: boolean; why: string } {
  if (symptoms.includes('smell')) return { deep: true, why: 'มีกลิ่นอับ มักมาจากเชื้อราที่พัดลมกรงกระรอก ต้องถอดล้างถึงจะหาย' };
  if (symptoms.includes('noise')) return { deep: true, why: 'ลมออกน้อยหรือเสียงดัง มักเพราะพัดลมกรงกระรอกสกปรก ต้องถอดล้าง' };
  if (lastCleaned === 'over1y') return { deep: true, why: 'ไม่ได้ล้างเกิน 1 ปี คราบสะสมลึก ล้างใหญ่จะสะอาดกว่า' };
  if (symptoms.includes('warm')) return { deep: false, why: 'ไม่ค่อยเย็น ช่างจะวัดแรงดันน้ำยาให้ระหว่างล้าง ถ้าต้องเติม ช่างจะขอราคาในแอปก่อน' };
  if (symptoms.includes('drip')) return { deep: false, why: 'น้ำหยดส่วนใหญ่เพราะท่อน้ำทิ้งตัน ล้างธรรมดาไล่ท่อให้แล้ว' };
  return { deep: false, why: 'ล้างทุก 6–12 เดือนตามปกติ ล้างธรรมดาเพียงพอ' };
}

export const positionNames: Record<PricePosition, string> = { low: 'ต่ำกว่าราคากลาง', typical: 'ราคากลาง', high: 'สูงกว่าราคากลาง' };
export function positionOf(quote: number, range: PriceRange): PricePosition {
  return quote < range.low ? 'low' : quote > range.high ? 'high' : 'typical';
}

export const baht = (value: number) => '฿' + Math.round(value).toLocaleString('th-TH');
export const bahtRange = (range: PriceRange) => range.low === range.high ? baht(range.mid) : `${baht(range.low)}–${Math.round(range.high).toLocaleString('th-TH')}`;
