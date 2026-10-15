/** Preset windows customers can pick instead of one exact time. */
export const timeWindows = [
  { key: '08:00-12:00', label: 'ช่วงเช้า' },
  { key: '12:00-17:00', label: 'ช่วงบ่าย' },
  { key: '17:00-20:00', label: 'ช่วงเย็น' },
  { key: '08:00-20:00', label: 'เวลาไหนก็ได้' },
] as const;

/** "ช่วงบ่าย 12:00–17:00 น." for a window, "14:30 น." for an exact time. */
export function timeLabel(booking: { time: string; timeWindow?: string | null }): string {
  if (!booking.timeWindow) return `${booking.time} น.`;
  const [from, to] = booking.timeWindow.split('-');
  const name = timeWindows.find(item => item.key === booking.timeWindow)?.label;
  return `${name ? name + ' ' : ''}${from}–${to} น.`;
}
