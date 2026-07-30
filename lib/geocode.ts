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

// OSM's street data for Mexico City usually omits the grammatical "de"
// after a street-type word (the way is named "Calle Colima", not "Calle
// de Colima"), but people naturally type addresses with it, which can
// make Nominatim return nothing at all. Compound articles like "de la"/
// "de los"/"de las" (e.g. "Paseo de la Reforma") are real, correct parts
// of those street names and must be left alone.
function stripSpuriousDe(query: string): string {
  return query.replace(
    /\b(calle|avenida|av\.?|boulevard|blvd\.?|paseo|calzada|privada)\s+de\s+(?!la\b|los\b|las\b)/gi,
    "$1 "
  );
}

async function runSearch(
  query: string,
  signal: AbortSignal | undefined
): Promise<GeocodeCandidate[]> {
  const params = new URLSearchParams({
    q: query,
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

export async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocodeCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const results = await runSearch(trimmed, signal);
  if (results.length > 0) return results;

  const simplified = stripSpuriousDe(trimmed);
  if (simplified !== trimmed) {
    return runSearch(simplified, signal);
  }

  return results;
}
