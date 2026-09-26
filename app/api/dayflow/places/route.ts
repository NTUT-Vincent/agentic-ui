import { getPlaces } from "@/lib/dayflow/api/places";
export async function GET(request: Request) {
  const url = new URL(request.url); const lat = Number(url.searchParams.get("lat")); const lon = Number(url.searchParams.get("lon")); const raw = Number(url.searchParams.get("radiusKm") ?? 2);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || ![1,2,5].includes(raw)) return Response.json({ error: "valid lat, lon and radiusKm are required" }, { status: 400 });
  try { return Response.json({ places: await getPlaces(lat, lon, raw as 1|2|5) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Places failed" }, { status: 502 }); }
}
