import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { model } from "@/lib/agent/model";
import { getPlaceDetails } from "../api/place-details";
import type { DayPlan, SharedAppState, WeatherSummary } from "../state/types";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const resultSchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    items: z.array(z.object({
      placeId: z.string().min(1),
      startTime: timeSchema,
      endTime: timeSchema,
      note: z.string().optional(),
    })),
  })),
});

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export async function writePlan(state: SharedAppState, weather: WeatherSummary | null): Promise<DayPlan[]> {
  if (state.plan.places.length === 0) throw new Error("Add at least one place before generating an itinerary.");

  const placeIds = state.plan.places.map((place) => place.id);
  const details = await Promise.all(placeIds.map((id) => getPlaceDetails(id)));
  const candidatePlaces = state.plan.places.map((place) => ({
    ...place,
    details: details.find((detail) => detail.id === place.id) ?? null,
  }));
  const allowedIds = new Set(placeIds);
  const planner = state.plan.planner;

  const structuredModel = model.withStructuredOutput(resultSchema);
  const result = await structuredModel.invoke([
    new SystemMessage(`You are DayFlow's itinerary planner. Build a realistic chronological itinerary from only the supplied candidate places.

Rules:
- Use only candidate placeIds. Never invent or substitute a placeId.
- Produce at most ${planner.days} day entries and use day numbers starting at 1.
- Keep every item within ${planner.dailyStartTime}-${planner.dailyEndTime}.
- Do not overlap items within a day.
- Respect openingHours when provided. Opening-hours strings come from Geoapify/OpenStreetMap and may be incomplete; if ambiguous, be conservative.
- Pace is ${planner.pace}: relaxed means fewer longer stops and more gaps; packed means more stops with shorter gaps; balanced is between them.
- Consider weather when useful, especially moving outdoor activities away from rain when the supplied forecast supports that.
- It is okay to leave a candidate unused if it cannot fit safely.
- Keep notes short and explain only scheduling-relevant choices.

Planner settings:
${JSON.stringify(planner)}

Location:
${JSON.stringify(state.location)}

Weather:
${JSON.stringify(weather)}

Candidate places:
${JSON.stringify(candidatePlaces)}`),
    new HumanMessage("Create the itinerary now."),
  ]);

  if (result.days.length > planner.days) throw new Error("Generated itinerary exceeds requested trip length.");

  return result.days.map((day) => {
    let previousEnd = minutes(planner.dailyStartTime);
    const items = day.items.map((item) => {
      if (!allowedIds.has(item.placeId)) throw new Error(`Generated itinerary used unknown place id: ${item.placeId}`);
      const start = minutes(item.startTime);
      const end = minutes(item.endTime);
      if (start < minutes(planner.dailyStartTime) || end > minutes(planner.dailyEndTime) || end <= start) {
        throw new Error(`Generated invalid time range: ${item.startTime}-${item.endTime}`);
      }
      if (start < previousEnd) throw new Error("Generated itinerary contains overlapping time slots.");
      previousEnd = end;
      return { ...item, id: crypto.randomUUID() };
    });
    return { ...day, items };
  });
}
