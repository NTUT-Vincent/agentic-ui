"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePlacesQuery } from "@/hooks/use-places-query";
import { useActivePlan } from "@/hooks/use-active-plan";
import { useWeatherQuery } from "@/hooks/use-weather-query";
import { getVisiblePlaces } from "@/lib/dayflow/state/selectors";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import type { DayPlan, PlaceDetails, PlaceSummary } from "@/lib/dayflow/state/types";
import { DayFlowChat } from "../dayflow-chat";
import { DayFlowHeader } from "../dayflow-header";
import { ActivePlanPicker } from "../active-plan-picker";
import { StateActivity } from "../state-activity";
import { PlanForm } from "./plan-form";
import { PlanResult } from "./plan-result";

export function DayFlowPlanner({ initialPlanId }: { initialPlanId?: string }) {
  const plans = useActivePlan(initialPlanId);
  const title = useDayFlowStore((store) => store.runtime.activePlan.title);
  const setTitle = useDayFlowStore((store) => store.setActivePlanTitle);
  const state = useDayFlowStore((store) => store.shared);
  const setItinerary = useDayFlowStore((store) => store.setItinerary);
  const removePlace = useDayFlowStore((store) => store.removePlaceFromPlan);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeDetails, setPlaceDetails] = useState<Record<string, PlaceDetails>>({});

  const weather = useWeatherQuery(state.location.latitude, state.location.longitude);
  const places = usePlacesQuery(state.location.latitude, state.location.longitude, state.filters.radiusKm);
  const allPlaces = places.data ?? [];
  const visible = useMemo(() => getVisiblePlaces(state, allPlaces), [state, allPlaces]);
  const selectedPlaces: PlaceSummary[] = state.plan.places.map((place) => ({ ...place }));
  const savedPlaceIds = useMemo(() => state.plan.places.map((place) => place.id), [state.plan.places]);
  useEffect(() => {
    const controller = new AbortController();

    void Promise.all(
      savedPlaceIds.map(async (id) => {
        try {
          const response = await fetch(`/api/dayflow/place-details?id=${encodeURIComponent(id)}`, {
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const data = (await response.json()) as { place?: PlaceDetails };
          return data.place ? [id, data.place] as const : null;
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === "AbortError") return null;
          return null;
        }
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      const next: Record<string, PlaceDetails> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setPlaceDetails(next);
    });

    return () => controller.abort();
  }, [savedPlaceIds]);

  const queryStatus = useMemo(
    () => ({
      locationKey: `${state.location.latitude}:${state.location.longitude}`,
      placesKey: `${state.location.latitude}:${state.location.longitude}:${state.filters.radiusKm}`,
      weatherKey: `${state.location.latitude}:${state.location.longitude}`,
      contextKey: JSON.stringify({
        categories: state.filters.categories,
        environment: state.filters.environment,
        radiusKm: state.filters.radiusKm,
        placeIds: visible.map((place) => place.id),
      }),
      placesFetching: places.isFetching,
      weatherFetching: weather.isFetching,
    }),
    [state.location.latitude, state.location.longitude, state.filters.categories, state.filters.environment, state.filters.radiusKm, visible, places.isFetching, weather.isFetching],
  );

  async function generate() {
    if (!plans.active.id || plans.busy || plans.loading) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/dayflow/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, weather: weather.data ?? null }),
      });
      const data = (await response.json()) as { itinerary?: DayPlan[]; error?: string };
      if (!response.ok || !data.itinerary) throw new Error(data.error ?? "Failed to generate itinerary");
      setItinerary(data.itinerary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to generate itinerary");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="dayflow-app planner-app">
      <DayFlowHeader />
      <main className="planner-shell">
        <header className="planner-header">
          <div>
            <Link href="/" className="planner-back">← Back to explore</Link>
            <span className="dayflow-kicker">DAYFLOW PLANNER</span>
            <h1>Turn saved places into a real itinerary.</h1>
            <p>{state.location.name}, {state.location.country} · {state.plan.places.length} saved places</p>
          </div>
          <div className="planner-header-actions">
            <div className="planner-action-buttons">
              <button className="dayflow-primary planner-generate" disabled={generating || plans.loading || plans.busy || !plans.active.id || state.plan.places.length === 0} onClick={generate}>
                {generating ? "Planning…" : state.plan.itinerary.length ? "Regenerate itinerary" : "Generate itinerary"}
              </button>
              <button
                type="button"
                className="planner-save"
                disabled={!plans.active.id || !plans.active.dirty || !title?.trim() ||
                  plans.busy || plans.loading || generating || plans.agentStatus === "running"}
                onClick={() => void plans.saveChanges()}
              >
                {plans.busy ? "Saving…" : plans.active.dirty ? "Save Changes"
                  : plans.active.id ? "Saved ✓" : "Choose Plan"}
              </button>
            </div>
            {plans.active.needsReplan && (
              <p className="planner-save-message">Your itinerary may need an update.</p>
            )}
          </div>
        </header>

        <ActivePlanPicker
          plans={plans.plans}
          selectedId={plans.active.id}
          dirty={plans.active.dirty}
          busy={plans.busy}
          loading={plans.loading}
          unauthorized={plans.unauthorized}
          error={plans.error}
          onSelect={plans.load}
          onCreate={plans.create}
          onSave={plans.saveChanges}
        />
        <label className="planner-plan-title">
          Plan name
          <input value={title ?? ""} maxLength={120}
            disabled={!plans.active.id || plans.busy || plans.loading ||
              plans.agentStatus === "running"}
            onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="planner-layout">
          <div>
            <PlanForm />

            <section className="planner-card planner-places">
              <div className="planner-card-heading">
                <div>
                  <span className="dayflow-kicker">CANDIDATES</span>
                  <h2>Places to work with</h2>
                </div>
              </div>
              {state.plan.places.length === 0 ? (
                <p className="planner-muted">Add places from Explore before writing a plan.</p>
              ) : (
                <div className="planner-place-list">
                  {state.plan.places.map((place) => {
                    const details = placeDetails[place.id];
                    return (
                      <div className="planner-place-row" key={place.id}>
                        <div>
                          <strong>{place.name}</strong>
                          <span>{place.category}</span>
                          {details?.address && <span>{details.address}</span>}
                          {details?.openingHours && <span>Hours: {details.openingHours}</span>}
                          {details?.website && (
                            <a href={details.website} target="_blank" rel="noreferrer">
                              Website ↗
                            </a>
                          )}
                        </div>
                        <button onClick={() => removePlace(place.id)}>Remove</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            {error && <div className="planner-error">{error}</div>}
          </div>

          <PlanResult places={selectedPlaces} />
        </div>
      </main>

      <StateActivity />
      <DayFlowChat weather={weather.data ?? null} visiblePlaces={visible} queryStatus={queryStatus} />
    </div>
  );
}
