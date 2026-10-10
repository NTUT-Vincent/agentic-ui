"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import {
  addPlanPlace, createPlan, deletePlanPlace, getPlan, listPlans,
  patchPlan, PlanApiError,
  type PlanSummary, type PlanPatch,
} from "@/lib/dayflow/plans/client";
import type { PlaceSummary, SavedPlace } from "@/lib/dayflow/state/types";

const encodePlace = (place: PlaceSummary): SavedPlace => ({
  id: place.id, name: place.name, category: place.category,
  latitude: place.latitude, longitude: place.longitude,
  distanceMeters: place.distanceMeters, environment: place.environment,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function replacePlanParam(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("planId", id);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function useActivePlan(initialPlanId?: string) {
  const active = useDayFlowStore((s) => s.runtime.activePlan);
  const agentStatus = useDayFlowStore((s) => s.runtime.agentStatus);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const requestEpoch = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const rows = await listPlans();
    if (mounted.current) setPlans(rows);
    return rows;
  }, []);

  async function exclusive<T>(run: () => Promise<T>): Promise<T | null> {
    if (lock.current) return null;
    lock.current = true;
    ++requestEpoch.current;
    setBusy(true);
    setError(null);
    try {
      return await run();
    } catch (cause) {
      if (cause instanceof PlanApiError && cause.status === 401) setUnauthorized(true);
      setError(cause instanceof Error ? cause.message : "Plan operation failed");
      return null;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const generation = ++requestEpoch.current;
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      try {
        const rows = await listPlans();
        if (cancelled || generation !== requestEpoch.current) return;
        setPlans(rows);
        setUnauthorized(false);
        const store = useDayFlowStore.getState();
        const local = store.runtime.activePlan;
        const target = initialPlanId || local.id || rows[0]?.id;
        if (!target) return;

        if (local.dirty) {
          if (local.id) replacePlanParam(local.id);
          return;
        }
        const plan = await getPlan(target);
        if (cancelled || generation !== requestEpoch.current) return;
        const latest = useDayFlowStore.getState();
        if (latest.runtime.activePlan.dirty) return;
        latest.loadActivePlan(plan);
        replacePlanParam(target);
      } catch (cause) {
        if (!cancelled) {
          if (cause instanceof PlanApiError && cause.status === 401) setUnauthorized(true);
          setError(cause instanceof Error ? cause.message : "Unable to load plans");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; mounted.current = false; ++requestEpoch.current; };
  }, [initialPlanId]);

  useEffect(() => {
    if (!active.dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active.dirty]);

  const load = useCallback(async (id: string) => {
    const state = useDayFlowStore.getState();
    if (lock.current || state.runtime.agentStatus === "running") return false;
    if (state.runtime.activePlan.id === id) return true;
    if (state.runtime.activePlan.dirty &&
        !window.confirm("Discard unsaved changes and switch plans?")) return false;
    const fingerprint = JSON.stringify({
      active: state.runtime.activePlan, plan: state.shared.plan,
    });
    const result = await exclusive(async () => {
      const plan = await getPlan(id);
      const latest = useDayFlowStore.getState();
      if (fingerprint !== JSON.stringify({
        active: latest.runtime.activePlan, plan: latest.shared.plan,
      })) throw new Error("New changes appeared; switch cancelled.");
      latest.loadActivePlan(plan);
      replacePlanParam(id);
      return true;
    });
    return result === true;
  }, []);

  const create = useCallback(async (title: string) => {
    if (!title.trim() || lock.current) return false;
    const state = useDayFlowStore.getState();
    if (state.runtime.agentStatus === "running") return false;
    if (state.runtime.activePlan.dirty &&
        !window.confirm("Discard unsaved changes and create a new plan?")) return false;
    const result = await exclusive(async () => {
      const plan = await createPlan({
        title: title.trim(),
        location: state.shared.location,
        planner: state.shared.plan.planner,
      });
      useDayFlowStore.getState().loadActivePlan(plan);
      replacePlanParam(plan.id);
      await refresh();
      return true;
    });
    return result === true;
  }, [refresh]);

  const saveChanges = useCallback(async () => {
    const store = useDayFlowStore.getState();
    const { id, baseline, title } = store.runtime.activePlan;
    if (!id || !baseline || !title?.trim() || lock.current ||
        store.runtime.agentStatus === "running") return false;
    const snapshot = structuredClone(store.shared.plan);
    const before = structuredClone(store.runtime.activePlan);

    const result = await exclusive(async () => {
      const savedIds = new Set(baseline.places.map((p) => p.id));
      const currentIds = new Set(snapshot.places.map((p) => p.id));
      for (const old of baseline.places) {
        if (!currentIds.has(old.id)) await deletePlanPlace(id, old.id);
      }
      for (const place of snapshot.places) {
        if (!savedIds.has(place.id)) await addPlanPlace(id, place);
      }
      const patch: PlanPatch = {};
      if (title !== baseline.title) patch.title = title;
      if (!same(snapshot.planner, baseline.planner)) patch.planner = snapshot.planner;
      if (before.itineraryEdited) patch.itinerary = snapshot.itinerary;
      if (Object.keys(patch).length) await patchPlan(id, patch);

      const saved = await getPlan(id);
      const latest = useDayFlowStore.getState();
      if (latest.runtime.activePlan.id === id &&
          same(latest.shared.plan, snapshot) &&
          latest.runtime.activePlan.title === title) {
        latest.acknowledgeSavedPlan(saved);
      } else {
        setError("The server saved the snapshot, but newer edits remain unsaved. Save again.");
        return false;
      }
      await refresh();
      return true;
    });
    return result === true;
  }, [refresh]);

  const addPlace = useCallback(async (place: PlaceSummary) => {
    const state = useDayFlowStore.getState();
    const current = state.runtime.activePlan;
    if (!current.id || current.dirty || lock.current ||
        state.runtime.agentStatus === "running") {
      setError("Choose a Plan and save current changes before adding a place.");
      return false;
    }
    const result = await exclusive(async () => {
      const saved = await addPlanPlace(current.id!, encodePlace(place));
      const latest = useDayFlowStore.getState();
      if (latest.runtime.activePlan.id === current.id && !latest.runtime.activePlan.dirty) {
        latest.acknowledgeSavedPlan(saved);
      } else {
        setError("Plan changed while saving. Reload to see the latest places.");
        return false;
      }
      await refresh();
      return true;
    });
    return result === true;
  }, [refresh]);

  const removePlace = useCallback(async (placeId: string) => {
    const state = useDayFlowStore.getState();
    const current = state.runtime.activePlan;
    if (!current.id || current.dirty || lock.current ||
        state.runtime.agentStatus === "running") {
      setError("Save current changes before removing a place.");
      return false;
    }
    const result = await exclusive(async () => {
      await deletePlanPlace(current.id!, placeId);
      const saved = await getPlan(current.id!);
      const latest = useDayFlowStore.getState();
      if (latest.runtime.activePlan.id === current.id && !latest.runtime.activePlan.dirty) {
        latest.acknowledgeSavedPlan(saved);
      } else {
        setError("Plan changed while saving. Reload to see the latest places.");
        return false;
      }
      await refresh();
      return true;
    });
    return result === true;
  }, [refresh]);

  return {
    active, plans, loading, busy, unauthorized, error, agentStatus,
    refresh, load, create, saveChanges, addPlace, removePlace,
  };
}
