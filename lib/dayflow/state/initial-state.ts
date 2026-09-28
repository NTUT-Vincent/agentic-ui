import { MAX_AGENT_STEPS } from "./types";
import type { RuntimeState, SharedAppState } from "./types";

export const initialSharedAppState: SharedAppState = {
  schemaVersion: 1,
  location: {
    query: "New York",
    name: "New York",
    country: "United States",
    latitude: 40.7128,
    longitude: -74.006,
  },
  filters: {
    categories: [],
    radiusKm: 2,
    environment: "all",
    sortBy: "distance",
  },
  view: { mode: "split" },
  selection: { placeId: null },
  plan: { placeIds: [] },
};

export const initialRuntimeState: RuntimeState = {
  chatOpen: false,
  agentStatus: "idle",
  agentRun: {
    goal: null,
    step: 0,
    maxSteps: MAX_AGENT_STEPS,
    previousRunId: null,
    waitingFor: [],
  },
  lastMutation: null,
};
