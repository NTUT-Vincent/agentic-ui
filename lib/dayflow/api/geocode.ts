import type { GeocodeResult } from "../state/types";
type OpenMeteoGeocode = { id: number; name: string; latitude: number; longitude: number; country?: string };
export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
  const data = (await response.json()) as { results?: OpenMeteoGeocode[] };
  return (data.results ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    country: item.country ?? "Unknown",
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}
