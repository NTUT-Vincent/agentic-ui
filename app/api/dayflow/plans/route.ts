import { currentUserId, createOwnedPlan, listOwnedPlans } from "@/lib/dayflow/plans/repository";
import { createPlanSchema, readJsonBody, RequestBodyError } from "@/lib/dayflow/plans/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const plans = await listOwnedPlans(userId);
    return Response.json({ plans }, { headers });
  } catch (error) {
    console.error("[DayFlow][plans:list:error]", error);
    return Response.json({ error: "Unable to list plans" }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const parsed = createPlanSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return Response.json({ error: "Invalid plan data" }, { status: 400, headers });
    }

    const plan = await createOwnedPlan(userId, parsed.data);
    return Response.json({ plan }, { status: 201, headers });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    console.error("[DayFlow][plans:create:error]", error);
    return Response.json({ error: "Unable to create plan" }, { status: 500, headers });
  }
}
