import type { Booking, RoomEntry } from '../types';

/** Room numbers like 201–208 on floors 2–12, each with the same number of air conditioners. */
export function generateRooms(fromFloor: number, toFloor: number, perFloor: number, units = 1): RoomEntry[] {
  const rooms: RoomEntry[] = [];
  for (let floor = Math.min(fromFloor, toFloor); floor <= Math.max(fromFloor, toFloor); floor++)
    for (let i = 1; i <= perFloor; i++) rooms.push({ name: `${floor}${String(i).padStart(2, '0')}`, units });
  return rooms;
}

/**
 * Rooms typed or pasted: "101-110, 215, Lobby x3". Ranges expand (keeping leading zeros), "x3" means three
 * air conditioners in that room. Separators can be commas, spaces or new lines.
 */
export function parseRooms(text: string, units = 1): RoomEntry[] {
  const rooms: RoomEntry[] = [];
  for (const raw of text.split(/[,\n،;]+|\s{2,}/).map(part => part.trim()).filter(Boolean)) {
    const multi = raw.match(/^(.*?)\s*[x×*]\s*(\d{1,2})$/i);
    const body = (multi ? multi[1] : raw).trim();
    const count = multi ? Math.min(10, Math.max(1, Number(multi[2]))) : units;
    const range = body.match(/^([^\d]*)(\d+)\s*[-–]\s*\1?(\d+)$/);
    if (range) {
      const [, prefix, a, b] = range;
      const start = Number(a), end = Number(b);
      if (end >= start && end - start < 500) {
        for (let n = start; n <= end; n++) rooms.push({ name: prefix + String(n).padStart(a.length, '0'), units: count });
        continue;
      }
    }
    for (const name of body.split(/\s+/)) if (name) rooms.push({ name: name.slice(0, 20), units: count });
  }
  return rooms;
}

/** Adds rooms not already in the list, keeping the order people expect (by floor, then number). */
export function mergeRooms(current: RoomEntry[], added: RoomEntry[]): RoomEntry[] {
  const byName = new Map(current.map(room => [room.name, room]));
  for (const room of added) byName.set(room.name, room);
  return sortRooms([...byName.values()]).slice(0, 500);
}

export function sortRooms<T extends { name: string }>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }));
}

/** "1205" is on floor 12, "805" on floor 8; "A-12" groups under A; anything else under "อื่น ๆ". */
export function floorOf(name: string): string {
  if (/^\d{3,}$/.test(name)) return name.slice(0, -2);
  const prefix = name.match(/^([A-Za-zก-๙]+)[-\s]?\d+/);
  return prefix ? prefix[1] : 'อื่น ๆ';
}

export function byFloor<T extends { name: string }>(rooms: T[]): { floor: string; rooms: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const room of sortRooms(rooms)) {
    const floor = floorOf(room.name);
    groups.set(floor, [...(groups.get(floor) ?? []), room]);
  }
  return [...groups.entries()].map(([floor, list]) => ({ floor, rooms: list }));
}
export const floorLabel = (floor: string) => /^\d+$/.test(floor) ? `ชั้น ${floor}` : floor;

/** When each room of a building was last cleaned, from its finished jobs. */
export function lastCleaned(placeId: string, bookings: Booking[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const job of bookings) {
    if (job.placeId !== Number(placeId) || job.status !== 'เสร็จสิ้น') continue;
    for (const room of job.rooms ?? []) if (room.done && (last.get(room.name) ?? '') < job.date) last.set(room.name, job.date);
  }
  return last;
}

/** Rooms never cleaned through AirClean, or cleaned more than 6 months ago (with two weeks' notice). */
export function dueRooms(rooms: RoomEntry[], last: Map<string, string>): RoomEntry[] {
  const limit = new Date(); limit.setMonth(limit.getMonth() - 6); limit.setDate(limit.getDate() + 14);
  return rooms.filter(room => { const date = last.get(room.name); return !date || new Date(date + 'T00:00:00') <= limit; });
}
