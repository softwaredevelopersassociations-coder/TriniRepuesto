export type Coordinates = { latitude: number; longitude: number };

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
