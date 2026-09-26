import type { PlaceCategory, PlaceEnvironment, PlaceSummary } from "../state/types";
type Element = { id: number; type: "node" | "way" | "relation"; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
function category(tags: Record<string, string>): PlaceCategory | null {
  const amenity = tags.amenity;
  if (amenity && ["cafe", "restaurant", "library", "pharmacy", "cinema"].includes(amenity)) return amenity as PlaceCategory;
  if (tags.leisure === "park") return "park";
  if (tags.leisure === "fitness_centre") return "gym";
  if (tags.shop === "supermarket") return "supermarket";
  if (tags.tourism === "museum") return "museum";
  return null;
}
function environment(c: PlaceCategory, tags: Record<string, string>): PlaceEnvironment {
  if (tags.indoor === "yes") return "indoor";
  if (tags.indoor === "no") return "outdoor";
  if (c === "park") return "outdoor";
  return "indoor";
}
function distance(a: number, b: number, c: number, d: number) {
  const r = 6371000;
  const rad = (x: number) => x * Math.PI / 180;
  const da = rad(c - a), db = rad(d - b);
  const q = Math.sin(da / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(db / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}
export async function getPlaces(latitude: number, longitude: number, radiusKm: 1 | 2 | 5): Promise<PlaceSummary[]> {
  const radius = radiusKm * 1000;
  const q = `[out:json][timeout:20];(nwr["amenity"~"^(cafe|restaurant|library|pharmacy|cinema)$"](around:${radius},${latitude},${longitude});nwr["leisure"~"^(park|fitness_centre)$"](around:${radius},${latitude},${longitude});nwr["shop"="supermarket"](around:${radius},${latitude},${longitude});nwr["tourism"="museum"](around:${radius},${latitude},${longitude}););out center tags;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: q }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Overpass failed: ${response.status}`);
  const data = (await response.json()) as { elements: Element[] };
  return data.elements.flatMap((element) => {
    const tags = element.tags ?? {};
    const c = category(tags);
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!c || lat === undefined || lon === undefined) return [];
    return [{
      id: `${element.type}-${element.id}`,
      name: tags.name ?? tags["name:en"] ?? c.replace("_", " ").replace(/^./, (m) => m.toUpperCase()),
      category: c,
      latitude: lat,
      longitude: lon,
      distanceMeters: distance(latitude, longitude, lat, lon),
      environment: environment(c, tags),
      openingHours: tags.opening_hours,
      website: tags.website ?? tags["contact:website"],
    }];
  }).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 120);
}
