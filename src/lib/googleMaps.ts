export type Coordinates = { latitude: number; longitude: number };

type GoogleMapsNamespace = {
  importLibrary?: (libraryName: 'maps') => Promise<unknown>;
};

const googleMapsReadyCallback = '__trinirepuestoGoogleMapsReady';

type WindowWithGoogleMaps = Window & {
  google?: { maps?: GoogleMapsNamespace };
  __trinirepuestoGoogleMapsReady?: () => void;
};

let mapsScriptPromise: Promise<void> | null = null;

export async function loadGoogleMapsLibrary() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY.');

  const googleMapsWindow = window as WindowWithGoogleMaps;
  let mapsNamespace = googleMapsWindow.google?.maps;

  if (!mapsNamespace?.importLibrary) {
    if (!mapsScriptPromise) {
      mapsScriptPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        const params = new URLSearchParams({
          key: apiKey,
          v: 'weekly',
          loading: 'async',
          callback: googleMapsReadyCallback,
          language: 'es-419',
          region: 'BO',
        });
        script.id = 'google-maps-javascript-api';
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.async = true;
        script.onerror = () => {
          mapsScriptPromise = null;
          delete googleMapsWindow[googleMapsReadyCallback];
          reject(new Error('No se pudo cargar Google Maps JavaScript API.'));
        };
        googleMapsWindow[googleMapsReadyCallback] = resolve;
        document.head.appendChild(script);
      });
    }
    await mapsScriptPromise;
    delete googleMapsWindow[googleMapsReadyCallback];
    mapsNamespace = googleMapsWindow.google?.maps;
  }

  if (!mapsNamespace?.importLibrary) {
    throw new Error('Google Maps JavaScript API no expuso importLibrary.');
  }

  await mapsNamespace.importLibrary('maps');
}

export function parseGoogleMapsCoordinates(value: string): Coordinates | null {
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the original value when a pasted URL contains an incomplete escape.
  }

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}

export function googleMapsUrl(latitude: number, longitude: number) {
  const query = `${latitude},${longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
