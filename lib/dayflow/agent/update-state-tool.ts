import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { JsonPatchOperation, SharedAppState } from "../state/types";
import { placeCategorySchema } from "../state/schema";
export const updateAppStateSchema = z.object({
  locationQuery: z.string().min(1).optional(),
  categories: z.array(placeCategorySchema).optional(),
  radiusKm: z.union([z.literal(1), z.literal(2), z.literal(5)]).optional(),
  environment: z.enum(["all", "indoor", "outdoor"]).optional(),
  sortBy: z.enum(["distance", "name"]).optional(),
  view: z.enum(["split", "map", "list"]).optional(),
  selectedPlaceId: z.string().nullable().optional(),
  addToPlan: z.string().optional(),
  removeFromPlan: z.string().optional(),
  resetFilters: z.boolean().optional(),
  message: z.string().min(1),
});
export const updateAppStateTool = tool(async (input) => input, {
  name: "update_app_state",
  description: "Operate the existing DayFlow app. Only use place IDs present in the supplied context.",
  schema: updateAppStateSchema,
});
export function buildStateDelta(input: z.infer<typeof updateAppStateSchema>, state: SharedAppState): JsonPatchOperation[] {
  const d: JsonPatchOperation[] = [];
  if (input.resetFilters) d.push(
    { op: "replace", path: "/filters/categories", value: [] },
    { op: "replace", path: "/filters/radiusKm", value: 2 },
    { op: "replace", path: "/filters/environment", value: "all" },
    { op: "replace", path: "/filters/sortBy", value: "distance" },
  );
  if (input.locationQuery !== undefined) d.push({ op: "replace", path: "/location/query", value: input.locationQuery });
  if (input.categories !== undefined) d.push({ op: "replace", path: "/filters/categories", value: input.categories });
  if (input.radiusKm !== undefined) d.push({ op: "replace", path: "/filters/radiusKm", value: input.radiusKm });
  if (input.environment !== undefined) d.push({ op: "replace", path: "/filters/environment", value: input.environment });
  if (input.sortBy !== undefined) d.push({ op: "replace", path: "/filters/sortBy", value: input.sortBy });
  if (input.view !== undefined) d.push({ op: "replace", path: "/view/mode", value: input.view });
  if (input.selectedPlaceId !== undefined) d.push({ op: "replace", path: "/selection/placeId", value: input.selectedPlaceId });
  let plan = [...state.plan.placeIds];
  if (input.addToPlan && !plan.includes(input.addToPlan)) plan.push(input.addToPlan);
  if (input.removeFromPlan) plan = plan.filter((id) => id !== input.removeFromPlan);
  if (input.addToPlan !== undefined || input.removeFromPlan !== undefined) d.push({ op: "replace", path: "/plan/placeIds", value: plan });
  return d;
}
