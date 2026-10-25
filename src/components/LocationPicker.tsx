import { useState } from 'react';
import { ExternalLink, Loader2, MapPin, Navigation } from 'lucide-react';
import { googleMapsSearchUrl, googleMapsUrl, parseGoogleMapsCoordinates } from '@/lib/googleMaps';
import LocationMap from './LocationMap';

type Props = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  onAddressChange: (address: string) => void;
  onCoordinatesChange: (latitude: number | null, longitude: number | null) => void;
};

export default function LocationPicker({
  address,
  latitude,
  longitude,
  onAddressChange,
  onCoordinatesChange,
}: Props) {
  const [mapReference, setMapReference] = useState('');
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');

  const handleMapReferenceChange = (value: string) => {
    setMapReference(value);
    const coordinates = parseGoogleMapsCoordinates(value);
    if (coordinates) {
      onCoordinatesChange(coordinates.latitude, coordinates.longitude);
      setMessage('Ubicación de Google Maps detectada.');
    } else {
      onCoordinatesChange(null, null);
      setMessage('Pega el enlace completo compartido de Google Maps o las coordenadas.');
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Este navegador no permite obtener la ubicación del dispositivo.');
      return;
    }
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextLatitude = Number(coords.latitude.toFixed(6));
        const nextLongitude = Number(coords.longitude.toFixed(6));
        onCoordinatesChange(nextLatitude, nextLongitude);
        setMapReference(`${nextLatitude}, ${nextLongitude}`);
        setMessage('Ubicación del dispositivo guardada.');
        setLocating(false);
      },
      () => {
        setMessage('No se pudo obtener la ubicación. Revisa los permisos del navegador.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const mapUrl = latitude !== null && longitude !== null
    ? googleMapsUrl(latitude, longitude)
    : address.trim()
      ? googleMapsSearchUrl(address.trim())
      : null;

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Dirección o referencia</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-10"
            value={address}
            onChange={(event) => {
              onAddressChange(event.target.value);
              onCoordinatesChange(null, null);
              setMapReference('');
              setMessage('');
            }}
            placeholder="Dirección del negocio, zona o ciudad"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
            <ExternalLink className="h-4 w-4" />
            {latitude !== null && longitude !== null ? 'Ver pin en Google Maps' : 'Buscar dirección en Google Maps'}
          </a>
        )}
        <button type="button" onClick={useCurrentLocation} disabled={locating} className="btn-secondary text-xs">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          Usar ubicación actual
        </button>
      </div>

      <LocationMap
        latitude={latitude}
        longitude={longitude}
        onSelect={(nextLatitude, nextLongitude) => {
          onCoordinatesChange(nextLatitude, nextLongitude);
          setMapReference(`${nextLatitude}, ${nextLongitude}`);
          setMessage('Pin colocado en el mapa.');
        }}
      />

      <div>
        <label className="label">O pega coordenadas o un enlace completo de Google Maps</label>
        <input
          className="input"
          value={mapReference}
          onChange={(event) => handleMapReferenceChange(event.target.value)}
          placeholder="https://maps.google.com/... o -16.5, -68.15"
        />
        {message && <p className="mt-1 text-xs text-slate-400">{message}</p>}
        {latitude !== null && longitude !== null && (
          <p className="mt-1 text-xs text-cyan-300">Pin guardado: {latitude.toFixed(6)}, {longitude.toFixed(6)}</p>
        )}
      </div>
    </div>
  );
}
