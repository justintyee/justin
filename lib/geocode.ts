export interface GeocodeCandidate {
  placeId: number;
  displayName: string;
  lat: number;
  lng: number;
}

// Roughly bounds Nominatim's search to Mexico City so ambiguous street
// names resolve to the right city instead of matching elsewhere.
// left,top,right,bottom (west,north,east,south)
const CDMX_VIEWBOX = "-99.36,19.59,-98.94,19.05";

export async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocodeCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: "json",
    limit: "5",
    viewbox: CDMX_VIEWBOX,
    bounded: "1",
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
  }>;

  return data.map((item) => ({
    placeId: item.place_id,
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}
