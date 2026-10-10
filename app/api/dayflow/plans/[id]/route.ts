import {
  currentUserId,
  getOwnedPlan,
  PlanValidationError,
  updateOwnedPlan,
} from "@/lib/dayflow/plans/repository";
import { readJsonBody, RequestBodyError, updatePlanSchema } from "@/lib/dayflow/plans/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const { id } = await params;
    const plan = id ? await getOwnedPlan(userId, id) : null;
    if (!plan) return Response.json({ error: "Plan not found" }, { status: 404, headers });
    return Response.json({ plan }, { headers });
  } catch (error) {
    console.error("[DayFlow][plans:detail:error]", error);
    return Response.json({ error: "Unable to load plan" }, { status: 500, headers });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const { id } = await params;
    if (!id) return Response.json({ error: "Plan not found" }, { status: 404, headers });

    const parsed = updatePlanSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return Response.json({ error: "Invalid plan changes" }, { status: 400, headers });
    }

    const plan = await updateOwnedPlan(userId, id, parsed.data);
    if (!plan) return Response.json({ error: "Plan not found" }, { status: 404, headers });
    return Response.json({ plan }, { headers });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    if (error instanceof PlanValidationError) {
      return Response.json({ error: error.message }, { status: 400, headers });
    }
    console.error("[DayFlow][plans:update:error]", error);
    return Response.json({ error: "Unable to update plan" }, { status: 500, headers });
  }
}
