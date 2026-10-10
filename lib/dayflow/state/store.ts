"use client";

import { applyPatch } from "fast-json-patch";
import { create } from "zustand";
import { initialRuntimeState, initialSharedAppState } from "./initial-state";
import { dayPlanSchema, planPaceSchema, planSettingsSchema, sharedAppStateSchema } from "./schema";
import type {
  AgentDependency,
  DayFlowSort,
  DayFlowViewMode,
  EnvironmentFilter,
  GeoLocation,
  JsonPatchOperation,
  PlaceCategory,
  PlaceSummary,
  PlanPace,
  RuntimeState,
  SavedPlace,
  SharedAppState,
  DayPlan,
  ActivePlanBaseline,
  LoadedPlan,
} from "./types";

const AGENT_MUTABLE_PATHS = new Set([
  "/location/query",
  "/filters/categories",
  "/filters/radiusKm",
  "/filters/environment",
  "/filters/sortBy",
  "/view/mode",
  "/selection/placeId",
  "/plan/places",
  "/plan/planner/days",
  "/plan/planner/startDate",
  "/plan/planner/dailyStartTime",
  "/plan/planner/dailyEndTime",
  "/plan/planner/pace",
  "/plan/planner/note",
  "/plan/itinerary",
]);

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function baselineOf(plan: LoadedPlan): ActivePlanBaseline {
  return {
    title: plan.title,
    places: plan.places,
    planner: plan.planner,
    itinerary: plan.itinerary,
  };
}

function planEdited(shared: SharedAppState, runtime: RuntimeState): RuntimeState {
  const active = runtime.activePlan;
  if (!active.id || !active.baseline) return runtime;
  const dirty = active.title !== active.baseline.title ||
    !same(shared.plan, {
      places: active.baseline.places,
      planner: active.baseline.planner,
      itinerary: active.baseline.itinerary,
    });
  return { ...runtime, activePlan: { ...active, dirty } };
}

function preserveScheduleWithoutPlace(itinerary: DayPlan[], id: string): DayPlan[] {
  return itinerary.map((day) => ({
    ...day,
    items: day.items.filter((item) => item.placeId !== id),
  }));
}

function mutation(source: "human" | "agent", paths: string[]): RuntimeState["lastMutation"] {
  return { source, paths, timestamp: Date.now() };
}

function toSavedPlace(place: PlaceSummary): SavedPlace {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    latitude: place.latitude,
    longitude: place.longitude,
    distanceMeters: place.distanceMeters,
    environment: place.environment,
  };
}

function assertAgentDeltaAllowed(delta: JsonPatchOperation[]) {
  for (const operation of delta) {
    if (!AGENT_MUTABLE_PATHS.has(operation.path)) {
      throw new Error(`Agent mutation is not allowed for path: ${operation.path}`);
    }
    if (!(["add", "replace", "remove"] as string[]).includes(operation.op)) {
      throw new Error(`Unsupported JSON Patch operation: ${operation.op}`);
    }
  }
}

type DayFlowStore = {
  shared: SharedAppState;
  runtime: RuntimeState;
  loadActivePlan: (plan: LoadedPlan) => void;
  acknowledgeSavedPlan: (plan: LoadedPlan) => void;
  setActivePlanTitle: (title: string) => void;
  setLocationQuery: (query: string) => void;
  setResolvedLocation: (location: GeoLocation) => void;
  setCategories: (categories: PlaceCategory[]) => void;
  toggleCategory: (category: PlaceCategory) => void;
  setRadiusKm: (radiusKm: 1 | 2 | 5 | 10) => void;
  setEnvironment: (environment: EnvironmentFilter) => void;
  setSort: (sortBy: DayFlowSort) => void;
  setView: (mode: DayFlowViewMode) => void;
  selectPlace: (placeId: string | null) => void;
  addPlaceToPlan: (place: PlaceSummary) => void;
  removePlaceFromPlan: (placeId: string) => void;
  setPlanDays: (days: number) => void;
  setPlanStartDate: (startDate: string | null) => void;
  setPlanDailyStartTime: (time: string) => void;
  setPlanDailyEndTime: (time: string) => void;
  setPlanPace: (pace: PlanPace) => void;
  setPlanNote: (note: string) => void;
  setItinerary: (itinerary: DayPlan[]) => void;
  setChatOpen: (open: boolean) => void;
  setAgentStatus: (status: RuntimeState["agentStatus"]) => void;
  beginAgentRun: (goal: string) => void;
  setAgentWaiting: (waitingFor: AgentDependency[], step: number, previousRunId: string) => void;
  advanceAgentRun: (step: number, previousRunId: string | null) => void;
  finishAgentRun: () => void;
  cancelAgentRun: () => void;
  applyAgentSnapshot: (snapshot: unknown) => void;
  applyAgentDelta: (delta: JsonPatchOperation[]) => void;
};

export const useDayFlowStore = create<DayFlowStore>((set, get) => ({
  shared: initialSharedAppState,
  runtime: initialRuntimeState,

  loadActivePlan(plan) {
    set((state) => ({
      shared: {
        ...state.shared,
        location: plan.location,
        selection: { placeId: null },
        plan: {
          places: plan.places,
          planner: plan.planner,
          itinerary: plan.itinerary,
        },
      },
      runtime: {
        ...state.runtime,
        activePlan: {
          id: plan.id,
          title: plan.title,
          dirty: false,
          needsReplan: plan.needsReplan,
          itineraryEdited: false,
          baseline: baselineOf(plan),
        },
      },
    }));
  },

  acknowledgeSavedPlan(plan) {
    set((state) => {
      if (state.runtime.activePlan.id !== plan.id) return state;
      return {
        shared: {
          ...state.shared,
          plan: { places: plan.places, planner: plan.planner, itinerary: plan.itinerary },
        },
        runtime: {
          ...state.runtime,
          activePlan: {
            id: plan.id,
            title: plan.title,
            dirty: false,
            needsReplan: plan.needsReplan,
            itineraryEdited: false,
            baseline: baselineOf(plan),
          },
        },
      };
    });
  },

  setActivePlanTitle(title) {
    if (title.length > 120) return;
    set((state) => {
      const runtime: RuntimeState = {
        ...state.runtime,
        activePlan: { ...state.runtime.activePlan, title },
      };
      return { runtime: planEdited(state.shared, runtime) };
    });
  },

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

  addPlaceToPlan(place) {
    const saved = toSavedPlace(place);
    set((state) => {
      if (state.shared.plan.places.some((p) => p.id === saved.id)) return state;
      const shared = {
        ...state.shared,
        plan: { ...state.shared.plan, places: [...state.shared.plan.places, saved] },
      };
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            shared.plan.itinerary.some((day) => day.items.length > 0),
        },
        lastMutation: mutation("human", ["/plan/places"]),
      });
      return { shared, runtime };
    });
  },
  removePlaceFromPlan(placeId) {
    set((state) => {
      if (!state.shared.plan.places.some((p) => p.id === placeId)) return state;
      const affected = state.shared.plan.itinerary.some((day) =>
        day.items.some((item) => item.placeId === placeId));
      const shared = {
        ...state.shared,
        plan: {
          ...state.shared.plan,
          places: state.shared.plan.places.filter((p) => p.id !== placeId),
          itinerary: preserveScheduleWithoutPlace(state.shared.plan.itinerary, placeId),
        },
      };
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan || affected,
        },
        lastMutation: mutation("human", ["/plan/places", "/plan/itinerary"]),
      });
      return { shared, runtime };
    });
  },
  setPlanDays(days) {
    const planner = planSettingsSchema.parse({ ...get().shared.plan.planner, days });
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, planner } };
      const changed = !same(state.shared.plan.planner, planner);
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            (changed && shared.plan.itinerary.some((day) => day.items.length > 0)),
        },
        lastMutation: mutation("human", ["/plan/planner/days"]),
      });
      return { shared, runtime };
    });
  },
  setPlanStartDate(startDate) {
    const planner = planSettingsSchema.parse({ ...get().shared.plan.planner, startDate });
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, planner } };
      const changed = !same(state.shared.plan.planner, planner);
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            (changed && shared.plan.itinerary.some((day) => day.items.length > 0)),
        },
        lastMutation: mutation("human", ["/plan/planner/startDate"]),
      });
      return { shared, runtime };
    });
  },
  setPlanDailyStartTime(dailyStartTime) {
    const planner = planSettingsSchema.parse({ ...get().shared.plan.planner, dailyStartTime });
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, planner } };
      const changed = !same(state.shared.plan.planner, planner);
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            (changed && shared.plan.itinerary.some((day) => day.items.length > 0)),
        },
        lastMutation: mutation("human", ["/plan/planner/dailyStartTime"]),
      });
      return { shared, runtime };
    });
  },
  setPlanDailyEndTime(dailyEndTime) {
    const planner = planSettingsSchema.parse({ ...get().shared.plan.planner, dailyEndTime });
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, planner } };
      const changed = !same(state.shared.plan.planner, planner);
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            (changed && shared.plan.itinerary.some((day) => day.items.length > 0)),
        },
        lastMutation: mutation("human", ["/plan/planner/dailyEndTime"]),
      });
      return { shared, runtime };
    });
  },
  setPlanPace(pace) {
    const planner = planSettingsSchema.parse({ ...get().shared.plan.planner, pace: planPaceSchema.parse(pace) });
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, planner } };
      const changed = !same(state.shared.plan.planner, planner);
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            (changed && shared.plan.itinerary.some((day) => day.items.length > 0)),
        },
        lastMutation: mutation("human", ["/plan/planner/pace"]),
      });
      return { shared, runtime };
    });
  },
  setPlanNote(note) {
    const planner = planSettingsSchema.parse({ ...get().shared.plan.planner, note });
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, planner } };
      const changed = !same(state.shared.plan.planner, planner);
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: state.runtime.activePlan.needsReplan ||
            (changed && shared.plan.itinerary.some((day) => day.items.length > 0)),
        },
        lastMutation: mutation("human", ["/plan/planner/note"]),
      });
      return { shared, runtime };
    });
  },
  setItinerary(itinerary) {
    const validated = dayPlanSchema.array().parse(itinerary);
    set((state) => {
      const shared = { ...state.shared, plan: { ...state.shared.plan, itinerary: validated } };
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          itineraryEdited: true,
          needsReplan: false,
        },
        lastMutation: mutation("human", ["/plan/itinerary"]),
      });
      return { shared, runtime };
    });
  },
  setChatOpen(chatOpen) {
    set((state) => ({ runtime: { ...state.runtime, chatOpen } }));
  },

  setAgentStatus(agentStatus) {
    set((state) => ({ runtime: { ...state.runtime, agentStatus } }));
  },

  beginAgentRun(goal) {
    set((state) => ({
      runtime: {
        ...state.runtime,
        agentStatus: "running",
        agentRun: { ...initialRuntimeState.agentRun, goal, step: 1 },
      },
    }));
  },

  setAgentWaiting(waitingFor, step, previousRunId) {
    set((state) => ({
      runtime: {
        ...state.runtime,
        agentStatus: "running",
        agentRun: { ...state.runtime.agentRun, step, previousRunId, waitingFor },
      },
    }));
  },

  advanceAgentRun(step, previousRunId) {
    set((state) => ({
      runtime: {
        ...state.runtime,
        agentStatus: "running",
        agentRun: { ...state.runtime.agentRun, step, previousRunId, waitingFor: [] },
      },
    }));
  },

  finishAgentRun() {
    set((state) => ({
      runtime: { ...state.runtime, agentStatus: "idle", agentRun: initialRuntimeState.agentRun },
    }));
  },

  cancelAgentRun() {
    set((state) => ({
      runtime: { ...state.runtime, agentStatus: "error", agentRun: initialRuntimeState.agentRun },
    }));
  },

  applyAgentSnapshot(snapshot) {
    // Validate the server snapshot, but do not replace newer local changes.
    sharedAppStateSchema.parse(snapshot);
  },

  applyAgentDelta(delta) {
    assertAgentDeltaAllowed(delta);
    const current = structuredClone(get().shared);
    const updated = applyPatch(current, delta as Parameters<typeof applyPatch>[1], true, false).newDocument;
    const shared = sharedAppStateSchema.parse(updated);
    set((state) => {
      const changedPlan = delta.some((op) => op.path.startsWith("/plan/"));
      const planPlaceChange = delta.some((op) => op.path === "/plan/places");
      const planSettingsChange = delta.some((op) => op.path.startsWith("/plan/planner/"));
      const itineraryExplicitlyChanged =
        delta.some((op) => op.path === "/plan/itinerary") && !planPlaceChange;
      const runtime = planEdited(shared, {
        ...state.runtime,
        activePlan: {
          ...state.runtime.activePlan,
          needsReplan: itineraryExplicitlyChanged
            ? false
            : state.runtime.activePlan.needsReplan ||
              ((planPlaceChange || planSettingsChange) &&
                state.shared.plan.itinerary.some((day) => day.items.length > 0)),
          itineraryEdited: state.runtime.activePlan.itineraryEdited || itineraryExplicitlyChanged,
        },
        lastMutation: mutation("agent", delta.map((op) => op.path)),
      });
      return { shared, runtime: changedPlan ? runtime : {
        ...state.runtime,
        lastMutation: runtime.lastMutation,
      } };
    });
  },
}));

export { assertAgentDeltaAllowed };
