import type { DayPlan, GeoLocation, PlanSettings, SavedPlace } from "@/lib/dayflow/state/types";

export type PlanRecord = {
  id: string;
  title: string;
  location: GeoLocation;
  planner: PlanSettings;
  places: SavedPlace[];
  itinerary: DayPlan[];
  needsReplan: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlanSummary = {
  id: string;
  title: string;
  city: string;
  country: string;
  days: number;
  placeCount: number;
  needsReplan: boolean;
  updatedAt: string;
};

export type PlanPatch = {
  title?: string;
  planner?: PlanSettings;
  itinerary?: DayPlan[];
};

export class PlanApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new PlanApiError(data.error ?? "Plan request failed", response.status);
  }
  return (await response.json()) as T;
}

const url = (id: string) => "/api/dayflow/plans/" + encodeURIComponent(id);

export async function listPlans() {
  return (await request<{ plans: PlanSummary[] }>("/api/dayflow/plans")).plans;
}

export async function getPlan(id: string) {
  return (await request<{ plan: PlanRecord }>(url(id))).plan;
}

export async function createPlan(input: {
  title: string; location: GeoLocation; planner: PlanSettings;
}) {
  return (await request<{ plan: PlanRecord }>("/api/dayflow/plans", {
    method: "POST", body: JSON.stringify(input),
  })).plan;
}

export async function patchPlan(id: string, patch: PlanPatch) {
  return (await request<{ plan: PlanRecord }>(url(id), {
    method: "PATCH", body: JSON.stringify(patch),
  })).plan;
}

export async function addPlanPlace(id: string, place: SavedPlace) {
  return (await request<{ added: boolean; plan: PlanRecord }>(url(id) + "/places", {
    method: "POST", body: JSON.stringify({ place }),
  })).plan;
}

export async function deletePlanPlace(id: string, placeId: string) {
  const response = await fetch(url(id) + "/places/" + encodeURIComponent(placeId), {
    method: "DELETE", cache: "no-store",
  });
  if (!response.ok) throw new PlanApiError("Could not remove place", response.status);
}
