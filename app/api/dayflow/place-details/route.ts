import { getPlaceDetails } from "@/lib/dayflow/api/place-details";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  try {
    return Response.json({ place: await getPlaceDetails(id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Place details failed" },
      { status: 502 },
    );
  }
}
