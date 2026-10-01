import type { GeocodeResult } from "../state/types";

type NominatimGeocode = {
  place_id: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    country?: string;
  };
};

export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "agentic-ui/1.0 (https://github.com/NTUT-Vincent/agentic-ui)",
      "Accept-Language": "en",
    },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);

  const data = (await response.json()) as NominatimGeocode[];

  return data.map((item) => ({
    id: item.place_id,
    name: item.name ?? item.display_name,
    country: item.address?.country ?? "Unknown",
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  }));
}
