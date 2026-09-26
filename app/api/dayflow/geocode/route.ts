import { geocodeCity } from "@/lib/dayflow/api/geocode";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return Response.json({ error: "q is required" }, { status: 400 });
  try { return Response.json({ results: await geocodeCity(query) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Geocoding failed" }, { status: 502 }); }
}
