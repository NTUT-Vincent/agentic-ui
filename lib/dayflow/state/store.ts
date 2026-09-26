"use client";

import { applyPatch } from "fast-json-patch";
import { create } from "zustand";
import { initialRuntimeState, initialSharedAppState } from "./initial-state";
import { sharedAppStateSchema } from "./schema";
import type {
  DayFlowSort,
  DayFlowViewMode,
  EnvironmentFilter,
  GeoLocation,
  JsonPatchOperation,
  PlaceCategory,
  RuntimeState,
  SharedAppState,
} from "./types";

const AGENT_MUTABLE_PATHS = new Set([
  "/location/query",
  "/filters/categories",
  "/filters/radiusKm",
  "/filters/environment",
  "/filters/sortBy",
  "/view/mode",
  "/selection/placeId",
  "/plan/placeIds",
]);

function mutation(source: "human" | "agent", paths: string[]): RuntimeState["lastMutation"] {
  return { source, paths, timestamp: Date.now() };
}

function assertAgentDeltaAllowed(delta: JsonPatchOperation[]) {
  for (const operation of delta) {
    if (!AGENT_MUTABLE_PATHS.has(operation.path)) {
      throw new Error(`Agent mutation is not allowed for path: ${operation.path}`);
    }
    if (!( ["add", "replace", "remove"] as string[]).includes(operation.op)) {
      throw new Error(`Unsupported JSON Patch operation: ${operation.op}`);
    }
  }
}

type DayFlowStore = {
  shared: SharedAppState;
  runtime: RuntimeState;
  setLocationQuery: (query: string) => void;
  setResolvedLocation: (location: GeoLocation) => void;
  setCategories: (categories: PlaceCategory[]) => void;
  toggleCategory: (category: PlaceCategory) => void;
  setRadiusKm: (radiusKm: 1 | 2 | 5) => void;
  setEnvironment: (environment: EnvironmentFilter) => void;
  setSort: (sortBy: DayFlowSort) => void;
  setView: (mode: DayFlowViewMode) => void;
  selectPlace: (placeId: string | null) => void;
  addPlaceToPlan: (placeId: string) => void;
  removePlaceFromPlan: (placeId: string) => void;
  setChatOpen: (open: boolean) => void;
  setAgentStatus: (status: RuntimeState["agentStatus"]) => void;
  applyAgentSnapshot: (snapshot: unknown) => void;
  applyAgentDelta: (delta: JsonPatchOperation[]) => void;
};

export const useDayFlowStore = create<DayFlowStore>((set, get) => ({
  shared: initialSharedAppState,
  runtime: initialRuntimeState,

  setLocationQuery(query) {
    const value = query.trim();
    if (!value) return;
    set((state) => ({
      shared: { ...state.shared, location: { ...state.shared.location, query: value } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/location/query"]) },
    }));
  },

  setResolvedLocation(location) {
    const validated = sharedAppStateSchema.shape.location.parse(location);
    set((state) => ({
      shared: {
        ...state.shared,
        location: validated,
        selection: { placeId: null },
        plan: { placeIds: [] },
      },
      runtime: state.runtime,
    }));
  },

  setCategories(categories) {
    set((state) => ({
      shared: { ...state.shared, filters: { ...state.shared.filters, categories } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/filters/categories"]) },
    }));
  },

  toggleCategory(category) {
    const current = get().shared.filters.categories;
    get().setCategories(current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  },

  setRadiusKm(radiusKm) {
    set((state) => ({
      shared: { ...state.shared, filters: { ...state.shared.filters, radiusKm } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/filters/radiusKm"]) },
    }));
  },

  setEnvironment(environment) {
    set((state) => ({
      shared: { ...state.shared, filters: { ...state.shared.filters, environment } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/filters/environment"]) },
    }));
  },

  setSort(sortBy) {
    set((state) => ({
      shared: { ...state.shared, filters: { ...state.shared.filters, sortBy } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/filters/sortBy"]) },
    }));
  },

  setView(mode) {
    set((state) => ({
      shared: { ...state.shared, view: { mode } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/view/mode"]) },
    }));
  },

  selectPlace(placeId) {
    set((state) => ({
      shared: { ...state.shared, selection: { placeId } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/selection/placeId"]) },
    }));
  },

  addPlaceToPlan(placeId) {
    const placeIds = get().shared.plan.placeIds;
    if (placeIds.includes(placeId)) return;
    set((state) => ({
      shared: { ...state.shared, plan: { placeIds: [...state.shared.plan.placeIds, placeId] } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/plan/placeIds"]) },
    }));
  },

  removePlaceFromPlan(placeId) {
    set((state) => ({
      shared: { ...state.shared, plan: { placeIds: state.shared.plan.placeIds.filter((id) => id !== placeId) } },
      runtime: { ...state.runtime, lastMutation: mutation("human", ["/plan/placeIds"]) },
    }));
  },

  setChatOpen(chatOpen) {
    set((state) => ({ runtime: { ...state.runtime, chatOpen } }));
  },

  setAgentStatus(agentStatus) {
    set((state) => ({ runtime: { ...state.runtime, agentStatus } }));
  },

  applyAgentSnapshot(snapshot) {
    const validated = sharedAppStateSchema.parse(snapshot);
    set((state) => ({
      shared: validated,
      runtime: state.runtime,
    }));
  },

  applyAgentDelta(delta) {
    assertAgentDeltaAllowed(delta);
    const current = structuredClone(get().shared);
    const result = applyPatch(current, delta as Parameters<typeof applyPatch>[1], true, false).newDocument;
    const validated = sharedAppStateSchema.parse(result);
    set((state) => ({
      shared: validated,
      runtime: { ...state.runtime, lastMutation: mutation("agent", delta.map((operation) => operation.path)) },
    }));
  },
}));

export { assertAgentDeltaAllowed };
