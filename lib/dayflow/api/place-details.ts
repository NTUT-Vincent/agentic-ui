import type { PlaceDetails } from "../state/types";

type GeoapifyDetailsProperties = {
  place_id?: string;
  name?: string;
  opening_hours?: string;
  website?: string;
  formatted?: string;
};

type GeoapifyDetailsResponse = {
  features?: Array<{ properties?: GeoapifyDetailsProperties }>;
};

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) throw new Error("GEOAPIFY_API_KEY is not configured");

  const url = new URL("https://api.geoapify.com/v2/place-details");
  url.searchParams.set("id", placeId);
  url.searchParams.set("features", "details");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Geoapify place details failed: ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`);
  }

  const data = (await response.json()) as GeoapifyDetailsResponse;
  const properties = data.features?.find((feature) => feature.properties)?.properties;

  return {
    id: properties?.place_id ?? placeId,
    name: properties?.name,
    openingHours: properties?.opening_hours,
    website: properties?.website,
    address: properties?.formatted,
  };
}
