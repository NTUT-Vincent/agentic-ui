import type { PlaceCategory, PlaceEnvironment, PlaceSummary } from "../state/types";

const GEOAPIFY_CATEGORIES = [
  "catering.cafe",
  "catering.restaurant",
  "leisure.park",
  "sport.fitness",
  "education.library",
  "commercial.supermarket",
  "healthcare.pharmacy",
  "entertainment.cinema",
  "entertainment.museum",
].join(",");

type GeoapifyProperties = {
  place_id?: string;
  name?: string;
  address_line1?: string;
  formatted?: string;
  lat?: number;
  lon?: number;
  distance?: number;
  categories?: string[];
};

type GeoapifyFeature = {
  properties?: GeoapifyProperties;
};

type GeoapifyPlacesResponse = {
  features?: GeoapifyFeature[];
};

function matchesCategory(categories: string[], prefix: string) {
  return categories.some((value) => value === prefix || value.startsWith(`${prefix}.`));
}

function category(categories: string[]): PlaceCategory | null {
  if (matchesCategory(categories, "catering.cafe")) return "cafe";
  if (matchesCategory(categories, "catering.restaurant")) return "restaurant";
  if (matchesCategory(categories, "leisure.park")) return "park";
  if (matchesCategory(categories, "sport.fitness")) return "gym";
  if (matchesCategory(categories, "education.library")) return "library";
  if (matchesCategory(categories, "commercial.supermarket")) return "supermarket";
  if (matchesCategory(categories, "healthcare.pharmacy")) return "pharmacy";
  if (matchesCategory(categories, "entertainment.cinema")) return "cinema";
  if (matchesCategory(categories, "entertainment.museum")) return "museum";
  return null;
}

function environment(placeCategory: PlaceCategory): PlaceEnvironment {
  return placeCategory === "park" ? "outdoor" : "indoor";
}

function distanceMeters(latitude: number, longitude: number, placeLatitude: number, placeLongitude: number) {
  const earthRadius = 6_371_000;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(placeLatitude - latitude);
  const longitudeDelta = radians(placeLongitude - longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(placeLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    earthRadius *
      2 *
      Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

export async function getPlaces(
  latitude: number,
  longitude: number,
  radiusKm: 1 | 2 | 5,
): Promise<PlaceSummary[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    throw new Error("GEOAPIFY_API_KEY is not configured");
  }

  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set("categories", GEOAPIFY_CATEGORIES);
  url.searchParams.set("filter", `circle:${longitude},${latitude},${radiusKm * 1000}`);
  url.searchParams.set("bias", `proximity:${longitude},${latitude}`);
  url.searchParams.set("limit", "120");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Geoapify failed: ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as GeoapifyPlacesResponse;

  return (data.features ?? [])
    .flatMap((feature): PlaceSummary[] => {
      const properties = feature.properties;
      if (!properties) return [];

      const categories = properties.categories ?? [];
      const placeCategory = category(categories);
      const placeId = properties.place_id;
      const placeLatitude = properties.lat;
      const placeLongitude = properties.lon;

      if (
        !placeCategory ||
        !placeId ||
        placeLatitude === undefined ||
        placeLongitude === undefined
      ) {
        return [];
      }

      const name = properties.name ?? properties.address_line1 ?? properties.formatted ?? "Unnamed place";

      return [
        {
          id: placeId,
          name,
          category: placeCategory,
          latitude: placeLatitude,
          longitude: placeLongitude,
          distanceMeters:
            properties.distance !== undefined
              ? Math.round(properties.distance)
              : distanceMeters(latitude, longitude, placeLatitude, placeLongitude),
          environment: environment(placeCategory),
        },
      ];
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 120);
}
