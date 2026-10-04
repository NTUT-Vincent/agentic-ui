export const PLACE_CATEGORIES = [
  "cafe",
  "restaurant",
  "park",
  "gym",
  "library",
  "supermarket",
  "pharmacy",
  "cinema",
  "museum",
] as const;

export const MAX_AGENT_STEPS = 5;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export type EnvironmentFilter = "all" | "indoor" | "outdoor";
export type PlaceEnvironment = Exclude<EnvironmentFilter, "all"> | "unknown";
export type DayFlowViewMode = "split" | "map" | "list";
export type DayFlowSort = "distance" | "name";
export type MutationSource = "human" | "agent";
export type AgentDependency = "location" | "places" | "weather";
export type PlanPace = "relaxed" | "balanced" | "packed";

export type PlanItem = {
  id: string;
  placeId: string;
  startTime: string;
  endTime: string;
  note?: string;
};

export type DayPlan = {
  day: number;
  date?: string;
  items: PlanItem[];
};

export type PlanSettings = {
  days: number;
  startDate: string | null;
  dailyStartTime: string;
  dailyEndTime: string;
  pace: PlanPace;
  note: string;
};

export type AgentRunState = {
  goal: string | null;
  step: number;
  maxSteps: number;
  previousRunId: string | null;
  waitingFor: AgentDependency[];
};

export type GeoLocation = {
  query: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};

export type SharedAppState = {
  schemaVersion: 1;
  location: GeoLocation;
  filters: {
    categories: PlaceCategory[];
    radiusKm: 1 | 2 | 5;
    environment: EnvironmentFilter;
    sortBy: DayFlowSort;
  };
  view: {
    mode: DayFlowViewMode;
  };
  selection: {
    placeId: string | null;
  };
  plan: {
    placeIds: string[];
    planner: PlanSettings;
    itinerary: DayPlan[];
  };
};

export type RuntimeState = {
  chatOpen: boolean;
  agentStatus: "idle" | "running" | "error";
  agentRun: AgentRunState;
  lastMutation: {
    source: MutationSource;
    paths: string[];
    timestamp: number;
  } | null;
};

export type JsonPatchOperation =
  | { op: "add" | "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };

export type WeatherHour = {
  time: string;
  temperatureC: number;
  precipitationProbability: number;
  weatherCode: number;
};

export type WeatherSummary = {
  temperatureC: number;
  apparentTemperatureC: number;
  windSpeedKmh: number;
  weatherCode: number;
  hourly: WeatherHour[];
};

export type PlaceSummary = {
  id: string;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  environment: PlaceEnvironment;
  openingHours?: string;
  website?: string;
};

export type PlaceDetails = {
  id: string;
  name?: string;
  openingHours?: string;
  website?: string;
  address?: string;
};

export type GeocodeResult = {
  id: number;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};
