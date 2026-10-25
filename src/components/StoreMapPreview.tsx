import { MapPin } from 'lucide-react';
import { googleMapsUrl, googleMapsSearchUrl } from '@/lib/googleMaps';

type Props = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function StoreMapPreview({ address, latitude, longitude }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const hasCoordinates = latitude != null && longitude != null;
  const googleMapSrc = apiKey
    ? hasCoordinates || address?.trim()
      ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(address?.trim() || `${latitude},${longitude}`)}${hasCoordinates ? `&center=${latitude},${longitude}` : ''}&zoom=16&maptype=roadmap`
      : null
    : null;
  const openMapUrl = hasCoordinates
    ? googleMapsUrl(latitude, longitude)
    : address?.trim()
      ? googleMapsSearchUrl(address.trim())
      : null;
  const osmMapSrc = hasCoordinates
    ? (() => {
        const longitudeDelta = 0.018;
        const latitudeDelta = 0.012;
        const bounds = [
          longitude - longitudeDelta,
          latitude - latitudeDelta,
          longitude + longitudeDelta,
          latitude + latitudeDelta,
        ].join('%2C');
        return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${latitude}%2C${longitude}`;
      })()
    : null;

  return (
    <section className="card p-5 sm:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <MapPin className="h-4 w-4 text-orange-400" /> Ubicación en el mapa
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {address || (hasCoordinates ? 'Pin exacto de la tienda' : 'Todavía no se registró una ubicación')}
          </p>
        </div>
        {openMapUrl && (
          <a href={openMapUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
            <MapPin className="h-4 w-4" /> Abrir Google Maps
          </a>
        )}
      </div>

      {googleMapSrc ? (
        <iframe
          title="Ubicación de la tienda en Google Maps"
          src={googleMapSrc}
          className="h-64 w-full rounded-xl border border-slate-700 sm:h-80"
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : osmMapSrc ? (
        <>
          <iframe
            title="Vista de la ubicación de la tienda"
            src={osmMapSrc}
            className="h-64 w-full rounded-xl border border-slate-700 sm:h-80"
            loading="lazy"
          />
          <p className="mt-2 text-xs text-slate-500">
            Para mostrar Google Maps aquí, configura la variable VITE_GOOGLE_MAPS_API_KEY en el archivo .env.
          </p>
        </>
      ) : (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 text-center">
          <MapPin className="mb-2 h-7 w-7 text-slate-500" />
          <p className="text-sm text-slate-300">Guarda una dirección o coloca un pin para mostrar el mapa.</p>
        </div>
      )}
    </section>
  );
}
