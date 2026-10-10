import {
  addOwnedPlanPlace,
  currentUserId,
  getOwnedPlan,
} from "@/lib/dayflow/plans/repository";
import { addPlanPlaceSchema, readJsonBody, RequestBodyError } from "@/lib/dayflow/plans/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const { id } = await params;
    const current = id ? await getOwnedPlan(userId, id) : null;
    if (!current) return Response.json({ error: "Plan not found" }, { status: 404, headers });

    const parsed = addPlanPlaceSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return Response.json({ error: "Invalid place data" }, { status: 400, headers });
    }

    const alreadyAdded = current.places.some((p) => p.id === parsed.data.place.id);
    if (!alreadyAdded && current.places.length >= 150) {
      return Response.json({ error: "Plan has reached its place limit" }, { status: 409, headers });
    }

    const added = await addOwnedPlanPlace(userId, id, parsed.data.place);
    if (!added && !alreadyAdded) {
      return Response.json({ error: "Could not add place (plan may be full)" }, { status: 409, headers });
    }

    const plan = await getOwnedPlan(userId, id);
    return Response.json({ added, plan }, { status: added ? 201 : 200, headers });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    console.error("[DayFlow][plans:place:add:error]", error);
    return Response.json({ error: "Unable to add place" }, { status: 500, headers });
  }
}
