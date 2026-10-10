import {
  currentUserId,
  getOwnedPlan,
  removeOwnedPlanPlace,
} from "@/lib/dayflow/plans/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; placeId: string }> },
) {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const { id, placeId } = await params;
    const plan = id ? await getOwnedPlan(userId, id) : null;
    if (!plan) return Response.json({ error: "Plan not found" }, { status: 404, headers });
    if (!placeId) return Response.json({ error: "Place ID is required" }, { status: 400, headers });

    // Idempotent: deleting an already-absent place is not an error.
    await removeOwnedPlanPlace(userId, id, placeId);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    console.error("[DayFlow][plans:place:remove:error]", error);
    return Response.json({ error: "Unable to remove place" }, { status: 500, headers });
  }
}
