import type { PlaceResult } from './geocode';

/**
 * Google Places search (the same places as Google Maps), through the Maps JavaScript API.
 * Set VITE_GOOGLE_MAPS_API_KEY at build time; restrict the key to this site and to the Places API (New) in
 * Google Cloud. One "session" covers typing and the pick, which Google bills as a single search.
 */
const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
export const googlePlacesEnabled = Boolean(KEY);

/* Only the parts of the Places library used here. */
interface LatLng { lat(): number; lng(): number }
interface GooglePlace { id: string; displayName?: string | null; formattedAddress?: string | null; location?: LatLng | null; types?: string[] | null;
  fetchFields(request: { fields: string[] }): Promise<unknown> }
interface Prediction { placeId: string; mainText?: { text: string } | null; secondaryText?: { text: string } | null; text: { text: string }; types?: string[] | null; toPlace(): GooglePlace }
interface PlacesLibrary {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(request: Record<string, unknown>): Promise<{ suggestions: { placePrediction?: Prediction | null }[] }> };
  Place: new (options: { id: string; requestedLanguage?: string }) => GooglePlace;
}
type GoogleWindow = Window & { google?: { maps?: { importLibrary(name: string): Promise<unknown> } } };

let library: Promise<PlacesLibrary> | null = null;
function loadPlaces(): Promise<PlacesLibrary> {
  library ??= new Promise<PlacesLibrary>((resolve, reject) => {
    const w = window as GoogleWindow;
    const ready = () => w.google!.maps!.importLibrary('places').then(lib => resolve(lib as PlacesLibrary), reject);
    if (w.google?.maps?.importLibrary) { void ready(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY!)}&v=weekly&loading=async&language=th&region=TH&callback=__aircleanMaps`;
    script.async = true;
    (window as unknown as Record<string, unknown>).__aircleanMaps = () => void ready();
    script.onerror = () => { library = null; reject(new Error('โหลดการค้นหาของ Google ไม่สำเร็จ')); };
    (window as unknown as Record<string, unknown>).gm_authFailure = () => reject(new Error('Google ปฏิเสธ API key (ยังไม่ได้ผูกบัญชีเรียกเก็บเงิน หรือ key ถูกจำกัด)'));
    document.head.appendChild(script);
  });
  return library;
}

let session: unknown = null;
const BUILDING = /premise|subpremise|establishment|lodging|point_of_interest|apartment|condominium/;

export async function googleSearch(query: string, near?: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<PlaceResult[]> {
  const places = await loadPlaces();
  session ??= new places.AutocompleteSessionToken();
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query, sessionToken: session, language: 'th', region: 'th', includedRegionCodes: ['th'],
    ...(near ? { locationBias: { center: { lat: near.latitude, lng: near.longitude }, radius: 50000 } } : {}),
  });
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return suggestions.flatMap(item => item.placePrediction ? [item.placePrediction] : []).slice(0, 6).map(p => ({
    name: p.mainText?.text ?? p.text.text, address: p.secondaryText?.text ?? '', latitude: 0, longitude: 0,
    isBuilding: (p.types ?? []).some(type => BUILDING.test(type)), googleId: p.placeId,
  }));
}

export async function googleResolve(result: PlaceResult): Promise<PlaceResult> {
  const places = await loadPlaces();
  const place = new places.Place({ id: result.googleId!, requestedLanguage: 'th' });
  await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types'] });
  session = null; // the pick ends this search session
  if (!place.location) throw new Error('ไม่พบตำแหน่งของสถานที่นี้');
  return {
    name: place.displayName || result.name,
    address: (place.formattedAddress || result.address).replace(/,?\s*(ประเทศไทย|Thailand)$/, ''),
    latitude: place.location.lat(), longitude: place.location.lng(),
    isBuilding: result.isBuilding || (place.types ?? []).some(type => BUILDING.test(type)),
  };
}
