import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentDependency, JsonPatchOperation, SharedAppState } from "../state/types";
import { placeCategorySchema } from "../state/schema";

const radiusSchema = z.union([z.literal(1), z.literal(2), z.literal(5)]);
const environmentSchema = z.enum(["all", "indoor", "outdoor"]);
const sortSchema = z.enum(["distance", "name"]);
const viewSchema = z.enum(["split", "map", "list"]);

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
  z.object({ type: z.literal("reset_filters") }),
]);

const updateActionToolSchema = z.object({
  type: z
    .enum([
      "set_location",
      "set_categories",
      "set_radius",
      "set_environment",
      "set_sort",
      "set_view",
      "select_place",
      "add_to_plan",
      "remove_from_plan",
      "reset_filters",
    ])
    .describe("The UI action to execute."),
  locationQuery: z
    .string()
    .optional()
    .describe("Required when type is set_location. The city or location to switch to."),
  categories: z
    .array(placeCategorySchema)
    .optional()
    .describe("Required when type is set_categories."),
  radiusKm: radiusSchema
    .optional()
    .describe("Required when type is set_radius."),
  environment: environmentSchema
    .optional()
    .describe("Required when type is set_environment."),
  sortBy: sortSchema
    .optional()
    .describe("Required when type is set_sort."),
  view: viewSchema
    .optional()
    .describe("Required when type is set_view."),
  placeId: z
    .string()
    .nullable()
    .optional()
    .describe("Required when type is select_place, add_to_plan, or remove_from_plan. Use only IDs from the supplied context."),
});

const updateAppStateToolSchema = z.object({
  actions: z.array(updateActionToolSchema).min(1).max(8),
  continueAfterRefresh: z
    .boolean()
    .optional()
    .describe("Set true when a context-changing action must finish before the remaining goal can be completed."),
  message: z
    .string()
    .optional()
    .describe("Optional concise final response after the actions complete."),
});

type ToolFacingUpdateAction = z.infer<typeof updateActionToolSchema>;
export type UpdateAppStateAction = z.infer<typeof strictUpdateActionSchema>;
export type UpdateAppStateInput = {
  actions: UpdateAppStateAction[];
  continueAfterRefresh?: boolean;
  message?: string;
};

export const updateAppStateTool = tool(async (input) => input, {
  name: "update_app_state",
  description:
    "Operate DayFlow with an ordered list of UI actions. Each action uses one type plus the matching value field. For set_location include locationQuery; set_categories include categories; set_radius include radiusKm; set_environment include environment; set_sort include sortBy; set_view include view; select_place/add_to_plan/remove_from_plan include placeId. Use only place IDs present in the supplied context.",
  schema: updateAppStateToolSchema,
});

function normalizeAction(action: ToolFacingUpdateAction): UpdateAppStateAction {
  switch (action.type) {
    case "set_location":
      return strictUpdateActionSchema.parse({
        type: action.type,
        locationQuery: action.locationQuery,
      });
    case "set_categories":
      return strictUpdateActionSchema.parse({
        type: action.type,
        categories: action.categories,
      });
    case "set_radius":
      return strictUpdateActionSchema.parse({
        type: action.type,
        radiusKm: action.radiusKm,
      });
    case "set_environment":
      return strictUpdateActionSchema.parse({
        type: action.type,
        environment: action.environment,
      });
    case "set_sort":
      return strictUpdateActionSchema.parse({
        type: action.type,
        sortBy: action.sortBy,
      });
    case "set_view":
      return strictUpdateActionSchema.parse({
        type: action.type,
        view: action.view,
      });
    case "select_place":
      return strictUpdateActionSchema.parse({
        type: action.type,
        placeId: action.placeId,
      });
    case "add_to_plan":
      return strictUpdateActionSchema.parse({
        type: action.type,
        placeId: action.placeId,
      });
    case "remove_from_plan":
      return strictUpdateActionSchema.parse({
        type: action.type,
        placeId: action.placeId,
      });
    case "reset_filters":
      return { type: "reset_filters" };
  }
}

export function parseUpdateAppStateInput(value: unknown): UpdateAppStateInput {
  const parsed = updateAppStateToolSchema.parse(value);
  return {
    actions: parsed.actions.map(normalizeAction),
    continueAfterRefresh: parsed.continueAfterRefresh,
    message: parsed.message,
  };
}

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
