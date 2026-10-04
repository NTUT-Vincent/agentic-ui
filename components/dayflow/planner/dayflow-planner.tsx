"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePlacesQuery } from "@/hooks/use-places-query";
import { useWeatherQuery } from "@/hooks/use-weather-query";
import { getVisiblePlaces } from "@/lib/dayflow/state/selectors";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import type { DayPlan, PlaceSummary } from "@/lib/dayflow/state/types";
import { DayFlowChat } from "../dayflow-chat";
import { DayFlowHeader } from "../dayflow-header";
import { StateActivity } from "../state-activity";
import { PlanForm } from "./plan-form";
import { PlanResult } from "./plan-result";

export function DayFlowPlanner() {
  const state = useDayFlowStore((store) => store.shared);
  const setItinerary = useDayFlowStore((store) => store.setItinerary);
  const removePlace = useDayFlowStore((store) => store.removePlaceFromPlan);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weather = useWeatherQuery(state.location.latitude, state.location.longitude);
  const places = usePlacesQuery(state.location.latitude, state.location.longitude, state.filters.radiusKm);
  const allPlaces = places.data ?? [];
  const visible = useMemo(() => getVisiblePlaces(state, allPlaces), [state, allPlaces]);
  const selectedPlaces = state.plan.placeIds
    .map((id) => allPlaces.find((place) => place.id === id))
    .filter((place): place is PlaceSummary => Boolean(place));

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
            <p>{state.location.name}, {state.location.country} · {state.plan.placeIds.length} saved places</p>
          </div>
          <button className="dayflow-primary planner-generate" disabled={generating || state.plan.placeIds.length === 0} onClick={generate}>
            {generating ? "Planning…" : state.plan.itinerary.length ? "Regenerate itinerary" : "Generate itinerary"}
          </button>
        </header>

        <div className="planner-layout">
          <div>
            <PlanForm />

            <section className="planner-card planner-places">
              <div className="planner-card-heading">
                <div>
                  <span className="dayflow-kicker">CANDIDATES</span>
                  <h2>Places to work with</h2>
                </div>
                <small>Details are fetched only when you generate.</small>
              </div>
              {state.plan.placeIds.length === 0 ? (
                <p className="planner-muted">Add places from Explore before writing a plan.</p>
              ) : (
                <div className="planner-place-list">
                  {state.plan.placeIds.map((id) => {
                    const place = allPlaces.find((candidate) => candidate.id === id);
                    return (
                      <div className="planner-place-row" key={id}>
                        <div>
                          <strong>{place?.name ?? "Saved place"}</strong>
                          {place && <span>{place.category} · {Math.round(place.distanceMeters)} m away</span>}
                        </div>
                        <button onClick={() => removePlace(id)}>Remove</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            {error && <div className="planner-error">{error}</div>}
          </div>

          <PlanResult places={selectedPlaces.length ? selectedPlaces : allPlaces} />
        </div>
      </main>

      <StateActivity />
      <DayFlowChat weather={weather.data ?? null} visiblePlaces={visible} queryStatus={queryStatus} />
    </div>
  );
}
