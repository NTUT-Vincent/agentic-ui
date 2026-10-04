import { writePlan } from "@/lib/dayflow/agent/write-plan";
import { sharedAppStateSchema } from "@/lib/dayflow/state/schema";
import type { WeatherSummary } from "@/lib/dayflow/state/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = sharedAppStateSchema.parse(body.state);
    const weather = (body.weather ?? null) as WeatherSummary | null;
    const itinerary = await writePlan(state, weather);
    return Response.json({ itinerary });
  } catch (error) {
    console.error("[DayFlow][plan:error]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate itinerary" },
      { status: 400 },
    );
  }
}
