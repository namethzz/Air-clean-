/**
 * Place search and "what address is at this pin" from OpenStreetMap's Nominatim, in Thai, limited to Thailand.
 * Free and keyless; its usage policy allows light use (about one request a second), so callers debounce.
 */
const BASE = 'https://nominatim.openstreetmap.org';

export interface PlaceResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isBuilding: boolean;
}

interface NominatimAddress { [part: string]: string | undefined }
interface NominatimPlace { name?: string; display_name: string; lat: string; lon: string; category?: string; type?: string; address?: NominatimAddress }

const PARTS = ['house_number', 'road', 'neighbourhood', 'quarter', 'suburb', 'city_district', 'district', 'town', 'city', 'county', 'state', 'postcode'];

/** A short Thai address: house number, road, sub-district, district, province and postcode, without repeats. */
function shortAddress(place: NominatimPlace): string {
  const address = place.address;
  if (!address) return place.display_name.split(',').slice(0, 5).map(part => part.trim()).join(' ');
  const seen = new Set<string>();
  return PARTS.map(key => address[key]?.trim()).filter((part): part is string => {
    if (!part || seen.has(part)) return false;
    seen.add(part);
    return true;
  }).join(' ');
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}format=jsonv2&addressdetails=1&accept-language=th`, { signal });
  if (!response.ok) throw new Error('ค้นหาที่อยู่ไม่สำเร็จ');
  return response.json() as Promise<T>;
}

function toResult(place: NominatimPlace): PlaceResult {
  const kind = `${place.category ?? ''}:${place.type ?? ''}`;
  return {
    name: place.name?.trim() || place.display_name.split(',')[0].trim(),
    address: shortAddress(place),
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    isBuilding: /building|apartments|residential|hotel|dormitory|tourism/.test(kind),
  };
}

export async function searchPlaces(query: string, near?: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query, countrycodes: 'th', limit: '6' });
  // Prefer results around the person (about 50 km) without excluding the rest of the country.
  if (near) params.set('viewbox', [near.longitude - 0.5, near.latitude + 0.5, near.longitude + 0.5, near.latitude - 0.5].join(','));
  return (await get<NominatimPlace[]>(`/search?${params}`, signal)).map(toResult);
}

export async function addressAt(latitude: number, longitude: number, signal?: AbortSignal): Promise<string> {
  const place = await get<NominatimPlace & { error?: string }>(`/reverse?lat=${latitude}&lon=${longitude}&zoom=18`, signal);
  return place.error ? '' : shortAddress(place);
}

/** Guesses the place type from a name, so a condo search result fills in "คอนโด". */
export function guessPlaceType(name: string): 'บ้าน' | 'คอนโด' | 'หอพัก' | null {
  if (/หอพัก|dorm|อพาร์ท|apartment|แมนชั่น|mansion/i.test(name)) return 'หอพัก';
  if (/คอนโด|condo|residence|เรสซิเดนซ์|tower|ทาวเวอร์|ไลฟ์|ลุมพินี|lumpini|ศุภาลัย|supalai|the /i.test(name)) return 'คอนโด';
  return null;
}
