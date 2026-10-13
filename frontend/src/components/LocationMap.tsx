import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './LocationMap.css';

export interface Coordinates { latitude: number; longitude: number; }
export interface MapPin extends Coordinates { label: string; kind: 'destination' | 'technician'; }
interface Props {
  center: Coordinates;
  destination?: MapPin;
  technician?: MapPin;
  onPick?: (coords: Coordinates) => void;
  height?: number;
  zoom?: number;
}

const destinationIcon = L.divIcon({
  className: 'aircare-leaflet-icon',
  html: '<span class="aircare-pin aircare-pin-destination"><i></i></span>',
  iconSize: [34, 42], iconAnchor: [17, 40],
});
const technicianIcon = L.divIcon({
  className: 'aircare-leaflet-icon',
  html: '<span class="aircare-pin aircare-pin-technician"><i></i></span>',
  iconSize: [38, 46], iconAnchor: [19, 44],
});

function MapRecenter({ center }: { center: Coordinates }) {
  const map = useMap();
  useEffect(() => { map.flyTo([center.latitude, center.longitude], map.getZoom(), { duration: 0.35 }); }, [center.latitude, center.longitude, map]);
  return null;
}
function MapPickerEvents({ onPick }: { onPick?: (coords: Coordinates) => void }) {
  useMapEvents({ click(event) { onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }); } });
  return null;
}

export default function LocationMap({ center, destination, technician, onPick, height = 220, zoom = 15 }: Props) {
  return <div className="aircare-map-frame" style={{ height }}>
    <MapContainer center={[center.latitude, center.longitude]} zoom={zoom} scrollWheelZoom={false} zoomControl={true} className="aircare-leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapRecenter center={center} />
      <MapPickerEvents onPick={onPick} />
      {destination && <Marker position={[destination.latitude, destination.longitude]} icon={destinationIcon}><Popup>{destination.label}</Popup></Marker>}
      {technician && <Marker position={[technician.latitude, technician.longitude]} icon={technicianIcon}><Popup>{technician.label}</Popup></Marker>}
    </MapContainer>
    {onPick && <div className="map-pick-hint"><span/> แตะบนแผนที่เพื่อปักหมุด</div>}
    <div className="map-attribution-note">แผนที่ © OpenStreetMap</div>
  </div>;
}