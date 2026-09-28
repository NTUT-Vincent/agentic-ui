import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentDependency, JsonPatchOperation, SharedAppState } from "../state/types";
import { placeCategorySchema } from "../state/schema";

const updateActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_location"), locationQuery: z.string().min(1) }),
  z.object({ type: z.literal("set_categories"), categories: z.array(placeCategorySchema) }),
  z.object({ type: z.literal("set_radius"), radiusKm: z.union([z.literal(1), z.literal(2), z.literal(5)]) }),
  z.object({ type: z.literal("set_environment"), environment: z.enum(["all", "indoor", "outdoor"]) }),
  z.object({ type: z.literal("set_sort"), sortBy: z.enum(["distance", "name"]) }),
  z.object({ type: z.literal("set_view"), view: z.enum(["split", "map", "list"]) }),
  z.object({ type: z.literal("select_place"), placeId: z.string().nullable() }),
  z.object({ type: z.literal("add_to_plan"), placeId: z.string().min(1) }),
  z.object({ type: z.literal("remove_from_plan"), placeId: z.string().min(1) }),
  z.object({ type: z.literal("reset_filters") }),
]);

export const updateAppStateSchema = z.object({
  actions: z.array(updateActionSchema).min(1).max(8),
  continueAfterRefresh: z.boolean().optional(),
  message: z.string().min(1),
});

export type UpdateAppStateInput = z.infer<typeof updateAppStateSchema>;
export type UpdateAppStateAction = z.infer<typeof updateActionSchema>;

export const updateAppStateTool = tool(async (input) => input, {
  name: "update_app_state",
  description:
    "Operate DayFlow with an ordered list of typed UI actions. Use only place IDs present in the supplied context. Set continueAfterRefresh when a context-changing action must finish before the remaining user goal can be completed.",
  schema: updateAppStateSchema,
});

export function buildActionDelta(action: UpdateAppStateAction, state: SharedAppState): JsonPatchOperation[] {
  switch (action.type) {
    case "set_location":
      return [{ op: "replace", path: "/location/query", value: action.locationQuery }];
    case "set_categories":
      return [{ op: "replace", path: "/filters/categories", value: action.categories }];
    case "set_radius":
      return [{ op: "replace", path: "/filters/radiusKm", value: action.radiusKm }];
    case "set_environment":
      return [{ op: "replace", path: "/filters/environment", value: action.environment }];
    case "set_sort":
      return [{ op: "replace", path: "/filters/sortBy", value: action.sortBy }];
    case "set_view":
      return [{ op: "replace", path: "/view/mode", value: action.view }];
    case "select_place":
      return [{ op: "replace", path: "/selection/placeId", value: action.placeId }];
    case "add_to_plan": {
      const placeIds = state.plan.placeIds.includes(action.placeId)
        ? state.plan.placeIds
        : [...state.plan.placeIds, action.placeId];
      return [{ op: "replace", path: "/plan/placeIds", value: placeIds }];
    }
    case "remove_from_plan":
      return [{
        op: "replace",
        path: "/plan/placeIds",
        value: state.plan.placeIds.filter((id) => id !== action.placeId),
      }];
    case "reset_filters":
      return [
        { op: "replace", path: "/filters/categories", value: [] },
        { op: "replace", path: "/filters/radiusKm", value: 2 },
        { op: "replace", path: "/filters/environment", value: "all" },
        { op: "replace", path: "/filters/sortBy", value: "distance" },
      ];
  }
}

export function applyActionToState(action: UpdateAppStateAction, state: SharedAppState): SharedAppState {
  switch (action.type) {
    case "set_location":
      return { ...state, location: { ...state.location, query: action.locationQuery } };
    case "set_categories":
      return { ...state, filters: { ...state.filters, categories: action.categories } };
    case "set_radius":
      return { ...state, filters: { ...state.filters, radiusKm: action.radiusKm } };
    case "set_environment":
      return { ...state, filters: { ...state.filters, environment: action.environment } };
    case "set_sort":
      return { ...state, filters: { ...state.filters, sortBy: action.sortBy } };
    case "set_view":
      return { ...state, view: { mode: action.view } };
    case "select_place":
      return { ...state, selection: { placeId: action.placeId } };
    case "add_to_plan":
      return state.plan.placeIds.includes(action.placeId)
        ? state
        : { ...state, plan: { placeIds: [...state.plan.placeIds, action.placeId] } };
    case "remove_from_plan":
      return { ...state, plan: { placeIds: state.plan.placeIds.filter((id) => id !== action.placeId) } };
    case "reset_filters":
      return {
        ...state,
        filters: { categories: [], radiusKm: 2, environment: "all", sortBy: "distance" },
      };
  }
}

export function dependenciesForAction(action: UpdateAppStateAction): AgentDependency[] {
  switch (action.type) {
    case "set_location":
      return ["location", "places", "weather"];
    case "set_radius":
    case "set_categories":
    case "set_environment":
    case "reset_filters":
      return ["places"];
    default:
      return [];
  }
}

export function actionNeedsPlaceContext(action: UpdateAppStateAction) {
  return action.type === "select_place" || action.type === "add_to_plan";
}
