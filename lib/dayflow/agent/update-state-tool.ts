import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentDependency, JsonPatchOperation, SavedPlace, SharedAppState } from "../state/types";
import { placeCategorySchema, planPaceSchema } from "../state/schema";

const radiusSchema = z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]);
const environmentSchema = z.enum(["all", "indoor", "outdoor"]);
const sortSchema = z.enum(["distance", "name"]);
const viewSchema = z.enum(["split", "map", "list"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const strictUpdateActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_location"), locationQuery: z.string().min(1) }),
  z.object({ type: z.literal("set_categories"), categories: z.array(placeCategorySchema) }),
  z.object({ type: z.literal("set_radius"), radiusKm: radiusSchema }),
  z.object({ type: z.literal("set_environment"), environment: environmentSchema }),
  z.object({ type: z.literal("set_sort"), sortBy: sortSchema }),
  z.object({ type: z.literal("set_view"), view: viewSchema }),
  z.object({ type: z.literal("select_place"), placeId: z.string().nullable() }),
  z.object({ type: z.literal("add_to_plan"), placeId: z.string().min(1) }),
  z.object({ type: z.literal("remove_from_plan"), placeId: z.string().min(1) }),
  z.object({ type: z.literal("set_plan_days"), days: z.number().int().min(1).max(14) }),
  z.object({ type: z.literal("set_plan_start_date"), startDate: dateSchema }),
  z.object({ type: z.literal("set_plan_start_time"), time: timeSchema }),
  z.object({ type: z.literal("set_plan_end_time"), time: timeSchema }),
  z.object({ type: z.literal("set_plan_pace"), pace: planPaceSchema }),
  z.object({ type: z.literal("set_plan_note"), note: z.string().max(1000) }),
  z.object({ type: z.literal("reset_filters") }),
]);

const actionTypes = [
  "set_location","set_categories","set_radius","set_environment","set_sort","set_view",
  "select_place","add_to_plan","remove_from_plan","set_plan_days","set_plan_start_date",
  "set_plan_start_time","set_plan_end_time","set_plan_pace","set_plan_note","reset_filters",
] as const;

const updateActionToolSchema = z.object({
  type: z.enum(actionTypes),
  locationQuery: z.string().optional(),
  categories: z.array(placeCategorySchema).optional(),
  radiusKm: radiusSchema.optional(),
  environment: environmentSchema.optional(),
  sortBy: sortSchema.optional(),
  view: viewSchema.optional(),
  placeId: z.string().nullable().optional(),
  days: z.number().int().optional(),
  startDate: dateSchema.optional(),
  time: timeSchema.optional(),
  pace: planPaceSchema.optional(),
  note: z.string().optional(),
});

const updateAppStateToolSchema = z.object({
  actions: z.array(updateActionToolSchema).min(1).max(12),
  continueAfterRefresh: z.boolean().optional(),
  message: z.string().optional(),
});

type ToolFacingUpdateAction = z.infer<typeof updateActionToolSchema>;
export type UpdateAppStateAction = z.infer<typeof strictUpdateActionSchema>;
export type UpdateAppStateInput = { actions: UpdateAppStateAction[]; continueAfterRefresh?: boolean; message?: string };

export const updateAppStateTool = tool(async (input) => input, {
  name: "update_app_state",
  description: "Operate DayFlow UI and planner state with ordered actions. Planner fields are shared state and can be changed just like filters and view state.",
  schema: updateAppStateToolSchema,
});

function normalizeAction(action: ToolFacingUpdateAction): UpdateAppStateAction {
  switch (action.type) {
    case "set_location": return strictUpdateActionSchema.parse({ type: action.type, locationQuery: action.locationQuery });
    case "set_categories": return strictUpdateActionSchema.parse({ type: action.type, categories: action.categories });
    case "set_radius": return strictUpdateActionSchema.parse({ type: action.type, radiusKm: action.radiusKm });
    case "set_environment": return strictUpdateActionSchema.parse({ type: action.type, environment: action.environment });
    case "set_sort": return strictUpdateActionSchema.parse({ type: action.type, sortBy: action.sortBy });
    case "set_view": return strictUpdateActionSchema.parse({ type: action.type, view: action.view });
    case "select_place": return strictUpdateActionSchema.parse({ type: action.type, placeId: action.placeId });
    case "add_to_plan": return strictUpdateActionSchema.parse({ type: action.type, placeId: action.placeId });
    case "remove_from_plan": return strictUpdateActionSchema.parse({ type: action.type, placeId: action.placeId });
    case "set_plan_days": return strictUpdateActionSchema.parse({ type: action.type, days: action.days });
    case "set_plan_start_date": return strictUpdateActionSchema.parse({ type: action.type, startDate: action.startDate });
    case "set_plan_start_time": return strictUpdateActionSchema.parse({ type: action.type, time: action.time });
    case "set_plan_end_time": return strictUpdateActionSchema.parse({ type: action.type, time: action.time });
    case "set_plan_pace": return strictUpdateActionSchema.parse({ type: action.type, pace: action.pace });
    case "set_plan_note": return strictUpdateActionSchema.parse({ type: action.type, note: action.note });
    case "reset_filters": return { type: "reset_filters" };
  }
}

export function parseUpdateAppStateInput(value: unknown): UpdateAppStateInput {
  const parsed = updateAppStateToolSchema.parse(value);
  return { actions: parsed.actions.map(normalizeAction), continueAfterRefresh: parsed.continueAfterRefresh, message: parsed.message };
}

export function buildActionDelta(action: UpdateAppStateAction, state: SharedAppState, savedPlace?: SavedPlace): JsonPatchOperation[] {
  switch (action.type) {
    case "set_location": return [{ op: "replace", path: "/location/query", value: action.locationQuery }];
    case "set_categories": return [{ op: "replace", path: "/filters/categories", value: action.categories }];
    case "set_radius": return [{ op: "replace", path: "/filters/radiusKm", value: action.radiusKm }];
    case "set_environment": return [{ op: "replace", path: "/filters/environment", value: action.environment }];
    case "set_sort": return [{ op: "replace", path: "/filters/sortBy", value: action.sortBy }];
    case "set_view": return [{ op: "replace", path: "/view/mode", value: action.view }];
    case "select_place": return [{ op: "replace", path: "/selection/placeId", value: action.placeId }];
    case "add_to_plan": {
      if (!savedPlace) throw new Error(`Missing saved place snapshot for ${action.placeId}`);
      const places = state.plan.places.some((place) => place.id === action.placeId)
        ? state.plan.places
        : [...state.plan.places, savedPlace];
      return [{ op: "replace", path: "/plan/places", value: places }, { op: "replace", path: "/plan/itinerary", value: [] }];
    }
    case "remove_from_plan": return [
      { op: "replace", path: "/plan/places", value: state.plan.places.filter((place) => place.id !== action.placeId) },
      { op: "replace", path: "/plan/itinerary", value: [] },
    ];
    case "set_plan_days": return [{ op: "replace", path: "/plan/planner/days", value: action.days }, { op: "replace", path: "/plan/itinerary", value: [] }];
    case "set_plan_start_date": return [{ op: "replace", path: "/plan/planner/startDate", value: action.startDate }, { op: "replace", path: "/plan/itinerary", value: [] }];
    case "set_plan_start_time": return [{ op: "replace", path: "/plan/planner/dailyStartTime", value: action.time }, { op: "replace", path: "/plan/itinerary", value: [] }];
    case "set_plan_end_time": return [{ op: "replace", path: "/plan/planner/dailyEndTime", value: action.time }, { op: "replace", path: "/plan/itinerary", value: [] }];
    case "set_plan_pace": return [{ op: "replace", path: "/plan/planner/pace", value: action.pace }, { op: "replace", path: "/plan/itinerary", value: [] }];
    case "set_plan_note": return [{ op: "replace", path: "/plan/planner/note", value: action.note }, { op: "replace", path: "/plan/itinerary", value: [] }];
    case "reset_filters": return [
      { op: "replace", path: "/filters/categories", value: [] },
      { op: "replace", path: "/filters/radiusKm", value: 2 },
      { op: "replace", path: "/filters/environment", value: "all" },
      { op: "replace", path: "/filters/sortBy", value: "distance" },
    ];
  }
}

export function applyActionToState(action: UpdateAppStateAction, state: SharedAppState, savedPlace?: SavedPlace): SharedAppState {
  const clearItinerary = (next: SharedAppState): SharedAppState => ({ ...next, plan: { ...next.plan, itinerary: [] } });
  switch (action.type) {
    case "set_location": return { ...state, location: { ...state.location, query: action.locationQuery } };
    case "set_categories": return { ...state, filters: { ...state.filters, categories: action.categories } };
    case "set_radius": return { ...state, filters: { ...state.filters, radiusKm: action.radiusKm } };
    case "set_environment": return { ...state, filters: { ...state.filters, environment: action.environment } };
    case "set_sort": return { ...state, filters: { ...state.filters, sortBy: action.sortBy } };
    case "set_view": return { ...state, view: { mode: action.view } };
    case "select_place": return { ...state, selection: { placeId: action.placeId } };
    case "add_to_plan": {
      if (state.plan.places.some((place) => place.id === action.placeId)) return state;
      if (!savedPlace) throw new Error(`Missing saved place snapshot for ${action.placeId}`);
      return clearItinerary({ ...state, plan: { ...state.plan, places: [...state.plan.places, savedPlace] } });
    }
    case "remove_from_plan": return clearItinerary({ ...state, plan: { ...state.plan, places: state.plan.places.filter((place) => place.id !== action.placeId) } });
    case "set_plan_days": return clearItinerary({ ...state, plan: { ...state.plan, planner: { ...state.plan.planner, days: action.days } } });
    case "set_plan_start_date": return clearItinerary({ ...state, plan: { ...state.plan, planner: { ...state.plan.planner, startDate: action.startDate } } });
    case "set_plan_start_time": return clearItinerary({ ...state, plan: { ...state.plan, planner: { ...state.plan.planner, dailyStartTime: action.time } } });
    case "set_plan_end_time": return clearItinerary({ ...state, plan: { ...state.plan, planner: { ...state.plan.planner, dailyEndTime: action.time } } });
    case "set_plan_pace": return clearItinerary({ ...state, plan: { ...state.plan, planner: { ...state.plan.planner, pace: action.pace } } });
    case "set_plan_note": return clearItinerary({ ...state, plan: { ...state.plan, planner: { ...state.plan.planner, note: action.note } } });
    case "reset_filters": return { ...state, filters: { categories: [], radiusKm: 2, environment: "all", sortBy: "distance" } };
  }
}

export function dependenciesForAction(action: UpdateAppStateAction): AgentDependency[] {
  switch (action.type) {
    case "set_location": return ["location", "places", "weather"];
    case "set_radius": case "set_categories": case "set_environment": case "reset_filters": return ["places"];
    default: return [];
  }
}

export function actionNeedsPlaceContext(action: UpdateAppStateAction) {
  return action.type === "select_place" || action.type === "add_to_plan";
}
