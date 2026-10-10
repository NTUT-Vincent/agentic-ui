"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlanRecord } from "@/lib/dayflow/plans/client";
import type { PlaceDetails, SavedPlace } from "@/lib/dayflow/state/types";
import { DayFlowHeader } from "./dayflow-header";

type Status = "loading" | "ready" | "unauthorized" | "not-found" | "error";

function CandidatePlace({ place }: { place: SavedPlace }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!expanded || status !== "idle") return;
    const controller = new AbortController();
    async function fetchDetails() {
      setStatus("loading");
      try {
        const response = await fetch(
          "/api/dayflow/place-details?id=" + encodeURIComponent(place.id),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Place details unavailable");
        const data = await response.json() as { place?: PlaceDetails };
        if (!data.place) throw new Error("No details");
        if (!controller.signal.aborted) {
          setDetails(data.place);
          setStatus("ready");
        }
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void fetchDetails();
    return () => controller.abort();
  }, [expanded, place.id]);

  return (
    <div className="trip-details-candidate">
      <div>
        <strong>{place.name}</strong>
        <span> · {place.category}</span>
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Hide details" : "Place details"}
      </button>
      {expanded && (
        <div className="trip-details-candidate-info">
          {status === "loading" && <p>Loading details…</p>}
          {status === "error" && <p>Could not load current details for this place.</p>}
          {status === "ready" && details && (
            <>
              {details.address && <p>{details.address}</p>}
              {details.openingHours && <p>Hours: {details.openingHours}</p>}
              {details.website && (
                <a href={details.website} target="_blank" rel="noreferrer">Website ↗</a>
              )}
              {!details.address && !details.openingHours && !details.website && (
                <p>No additional details are currently available.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TripDetails({ tripId }: { tripId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [trip, setTrip] = useState<PlanRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrip() {
      setStatus("loading");
      try {
        const response = await fetch(
          "/api/dayflow/plans/" + encodeURIComponent(tripId),
          { signal: controller.signal, cache: "no-store" },
        );

        if (controller.signal.aborted) return;

        if (response.status === 401) {
          setStatus("unauthorized");
          return;
        }
        if (response.status === 404) {
          setStatus("not-found");
          return;
        }
        if (!response.ok) throw new Error("Failed to load Plan");

        const data = (await response.json()) as { plan?: PlanRecord };
        if (!data.plan) throw new Error("Invalid Plan response");
        if (controller.signal.aborted) return;

        setTrip(data.plan);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }

    void loadTrip();
    return () => controller.abort();
  }, [tripId]);

  function getPlaceName(placeId: string) {
    return trip?.places.find((place) => place.id === placeId)?.name ?? "Planned place";
  }

  return (
    <div className="dayflow-app trip-details-app">
      <DayFlowHeader />

      <main className="trip-details-shell">
        <Link href="/my-trips" className="planner-back">← My Trips</Link>

        {status === "loading" && (
          <section className="my-trips-empty" role="status">Loading Plan…</section>
        )}
        {status === "unauthorized" && (
          <section className="my-trips-empty">
            <h2>Sign in to view this Plan</h2>
            <p>Use Google Sign In in the header.</p>
          </section>
        )}
        {status === "not-found" && (
          <section className="my-trips-empty">
            <h2>Plan not found</h2>
            <p>This Plan may not exist or be accessible.</p>
          </section>
        )}
        {status === "error" && (
          <section className="my-trips-empty" role="alert">
            <h2>Unable to load Plan</h2>
            <p>Please try refreshing the page.</p>
          </section>
        )}

        {status === "ready" && trip && (
          <>
            <header className="trip-details-header">
              <span className="dayflow-kicker">SAVED PLAN</span>
              <h1>{trip.title}</h1>
              <p>{trip.location.name}, {trip.location.country}</p>
              <div className="trip-details-meta">
                <span>{trip.planner.days} days</span>
                <span>{trip.places.length} places</span>
                <span>{trip.planner.pace} pace</span>
                <span>Updated {new Date(trip.updatedAt).toLocaleDateString()}</span>
              </div>
              {trip.needsReplan && (
                <p className="dayflow-unsaved">Your itinerary may need an update.</p>
              )}
              <div className="trip-details-actions">
                <Link className="dayflow-primary" href={"/plan?planId=" + encodeURIComponent(trip.id)}>
                  Edit Plan →
                </Link>
                <Link className="dayflow-trips-link" href={"/?planId=" + encodeURIComponent(trip.id)}>
                  Explore & add more places
                </Link>
              </div>
            </header>

            <section className="trip-details-candidates">
              <h2>Places in this Plan ({trip.places.length})</h2>
              {trip.places.length === 0 ? (
                <p>No places yet. Explore the city to add some.</p>
              ) : (
                trip.places.map((place) => <CandidatePlace key={place.id} place={place} />)
              )}
            </section>

            {trip.itinerary.length > 0 && (
              <section className="planner-result">
                {trip.itinerary.map((day) => (
                  <article className="planner-day" key={day.day}>
                    <header>
                      <strong>Day {day.day}</strong>
                      {day.date && <span>{day.date}</span>}
                    </header>
                    <div className="planner-timeline">
                      {day.items.map((item) => (
                        <div className="planner-stop" key={item.id}>
                          <div className="planner-time">
                            <strong>{item.startTime}</strong>
                            <span>{item.endTime}</span>
                          </div>
                          <div className="planner-dot" />
                          <div className="planner-stop-card">
                            <strong>{getPlaceName(item.placeId)}</strong>
                            {item.note && <p>{item.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            )}

            {trip.itinerary.length === 0 && (
              <section className="my-trips-empty">
                <h2>No itinerary yet</h2>
                <p>Open Planner to generate a day-by-day schedule using your places.</p>
              </section>
            )}

            {trip.planner.note && (
              <section className="trip-details-notes">
                <h2>Trip preferences</h2>
                <p>{trip.planner.note}</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
