import { getWeather } from "@/lib/dayflow/api/weather";
export async function GET(request: Request) {
  const url = new URL(request.url); const lat = Number(url.searchParams.get("lat")); const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json({ error: "lat and lon are required" }, { status: 400 });
  try { return Response.json(await getWeather(lat, lon)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Weather failed" }, { status: 502 }); }
}
