import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { loadGoogleMapsLibrary } from '@/lib/googleMaps';

type MapPoint = { lat: number; lng: number };
type GoogleLatLng = { lat: () => number; lng: () => number };
type GoogleMapClickEvent = { latLng?: GoogleLatLng | null };
type MapsListener = { remove: () => void };
type GoogleMapInstance = {
  addListener: (event: 'click' | 'dragend', listener: (event?: GoogleMapClickEvent) => void) => MapsListener;
  getCenter: () => GoogleLatLng | null;
  setCenter: (center: MapPoint) => void;
  setOptions: (options: Record<string, boolean | string>) => void;
};
type GoogleMapElement = HTMLElement & {
  innerMap: GoogleMapInstance;
};

type Props = {
  latitude: number;
  longitude: number;
  selected?: boolean;
  selectable?: boolean;
  className: string;
  onSelect?: (latitude: number, longitude: number) => void;
  onLoadError?: () => void;
};

export default function GoogleMapCanvas({
  latitude,
  longitude,
  selected = false,
  selectable = false,
  className,
  onSelect,
  onLoadError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const latestPositionRef = useRef({ latitude, longitude });
  const onSelectRef = useRef(onSelect);
  const onLoadErrorRef = useRef(onLoadError);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim();

  latestPositionRef.current = { latitude, longitude };
  onSelectRef.current = onSelect;
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    let mapElement: GoogleMapElement | null = null;
    let mapErrorListener: (() => void) | null = null;
    let mapLoadListener: (() => void) | null = null;
    let resolvePendingMapLoad: (() => void) | null = null;
    const listeners: MapsListener[] = [];
    setStatus('loading');

    const initializeMap = async () => {
      await loadGoogleMapsLibrary();
      await customElements.whenDefined('gmp-map');
      if (!active) return;

      const position = latestPositionRef.current;
      const element = document.createElement('gmp-map') as GoogleMapElement;
      mapElement = element;
      let rejectMapLoad: (error: Error) => void = () => undefined;
      const mapLoaded = new Promise<void>((resolve, reject) => {
        resolvePendingMapLoad = () => resolve();
        rejectMapLoad = reject;
        mapLoadListener = () => resolve();
        element.addEventListener('gmp-load', mapLoadListener, { once: true });
      });
      const handleMapError = () => rejectMapLoad(new Error('Google Maps no pudo cargar el mapa.'));
      mapErrorListener = handleMapError;
      element.addEventListener('gmp-error', handleMapError);
      element.setAttribute('center', `${position.latitude},${position.longitude}`);
      element.setAttribute('zoom', selectable ? '14' : '16');
      if (mapId) element.setAttribute('map-id', mapId);
      element.style.display = 'block';
      element.style.height = '100%';
      element.style.width = '100%';
      container.replaceChildren(element);

      await mapLoaded;
      element.removeEventListener('gmp-error', handleMapError);
      if (mapLoadListener) element.removeEventListener('gmp-load', mapLoadListener);
      mapErrorListener = null;
      mapLoadListener = null;
      resolvePendingMapLoad = null;
      if (!active) return;

      const map = element.innerMap;
      if (!map) throw new Error('Google Maps no pudo inicializar el mapa.');
      map.setOptions({
        clickableIcons: false,
        fullscreenControl: !selectable,
        gestureHandling: selectable ? 'greedy' : 'none',
        mapTypeControl: selectable,
        streetViewControl: false,
        zoomControl: true,
      });
      mapRef.current = map;

      if (selectable) {
        listeners.push(map.addListener('click', (event) => {
          const clickedPoint = event?.latLng;
          if (!clickedPoint) return;
          const nextLatitude = Number(clickedPoint.lat().toFixed(6));
          const nextLongitude = Number(clickedPoint.lng().toFixed(6));
          map.setCenter({ lat: nextLatitude, lng: nextLongitude });
          onSelectRef.current?.(nextLatitude, nextLongitude);
        }));

        listeners.push(map.addListener('dragend', () => {
          const center = map.getCenter();
          if (!center) return;
          onSelectRef.current?.(Number(center.lat().toFixed(6)), Number(center.lng().toFixed(6)));
        }));
      }

      setStatus('ready');
    };

    initializeMap().catch(() => {
      if (!active) return;
      setStatus('error');
      onLoadErrorRef.current?.();
    });

    return () => {
      active = false;
      resolvePendingMapLoad?.();
      if (mapElement && mapErrorListener) mapElement.removeEventListener('gmp-error', mapErrorListener);
      if (mapElement && mapLoadListener) mapElement.removeEventListener('gmp-load', mapLoadListener);
      listeners.forEach((listener) => listener.remove());
      mapRef.current = null;
      container.replaceChildren();
    };
  }, [mapId, selectable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = { lat: latitude, lng: longitude };
    map.setCenter(center);
  }, [latitude, longitude]);

  if (status === 'error') {
    return (
      <div role="alert" className={`flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-5 text-center ${className}`}>
        <MapPin className="mb-2 h-7 w-7 text-slate-500" />
        <p className="text-sm text-slate-300">No se pudo cargar Google Maps. Verifica la clave de API y las APIs habilitadas.</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={containerRef} className="h-full min-h-48 w-full" aria-label="Mapa de Google Maps" />
      {status === 'loading' && (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-sm text-slate-300">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-orange-400" /> Cargando Google Maps…
        </div>
      )}
      {(selected || selectable) && (
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow-lg">
          <MapPin className={`h-10 w-10 ${selected ? 'fill-orange-500 text-orange-300' : 'fill-slate-500 text-white'}`} />
        </div>
      )}
      {selectable && status === 'ready' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-950/85 px-3 py-1.5 text-center text-xs text-white shadow">
          Haz clic o arrastra el mapa para elegir la ubicación
        </div>
      )}
    </div>
  );
}
