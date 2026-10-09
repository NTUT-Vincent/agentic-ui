"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SharedAppState } from "@/lib/dayflow/state/types";
import { DayFlowHeader } from "./dayflow-header";

type Trip = {
  id: string;
  title: string;
  location: SharedAppState["location"];
  plan: SharedAppState["plan"];
  createdAt: string;
  updatedAt: string;
};

type Status =
  | "loading"
  | "ready"
  | "unauthorized"
  | "not-found"
  | "error";

export function TripDetails({
  tripId,
}: {
  tripId: string;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrip() {
      try {
        const response = await fetch(
          `/api/dayflow/trips/${encodeURIComponent(tripId)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
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

        if (!response.ok) {
          throw new Error("Failed to load trip");
        }

        const data = (await response.json()) as {
          trip?: Trip;
        };

        if (!data.trip) {
          throw new Error("Invalid trip response");
        }

        if (controller.signal.aborted) return;

        setTrip(data.trip);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      }
    }

    void loadTrip();

    return () => controller.abort();
  }, [tripId]);

  function getPlaceName(placeId: string) {
    return (
      trip?.plan.places.find(
        (place) => place.id === placeId,
      )?.name ?? "Planned place"
    );
  }

  return (
    <div className="dayflow-app trip-details-app">
      <DayFlowHeader />

      <main className="trip-details-shell">
        <Link href="/my-trips" className="planner-back">
          ← My Trips
        </Link>

        {status === "loading" && (
          <section
            className="my-trips-empty"
            role="status"
          >
            Loading itinerary…
          </section>
        )}

        {status === "unauthorized" && (
          <section className="my-trips-empty">
            <h2>Sign in to view this trip</h2>
            <p>Use Google Sign In in the header.</p>
          </section>
        )}

        {status === "not-found" && (
          <section className="my-trips-empty">
            <h2>Trip not found</h2>
            <p>This trip may not exist or be accessible.</p>
          </section>
        )}

        {status === "error" && (
          <section className="my-trips-empty" role="alert">
            <h2>Unable to load itinerary</h2>
            <p>Please try refreshing the page.</p>
          </section>
        )}

        {status === "ready" && trip && (
          <>
            <header className="trip-details-header">
              <span className="dayflow-kicker">
                SAVED ITINERARY
              </span>

              <h1>{trip.title}</h1>

              <p>
                {trip.location.name},{" "}
                {trip.location.country}
              </p>

              <div className="trip-details-meta">
                <span>
                  {trip.plan.planner.days} days
                </span>

                <span>
                  {trip.plan.places.length} places
                </span>

                <span>
                  {trip.plan.planner.pace} pace
                </span>

                <span>
                  Saved{" "}
                  {new Date(
                    trip.createdAt,
                  ).toLocaleDateString()}
                </span>
              </div>
            </header>

            <section className="planner-result">
              {trip.plan.itinerary.map((day) => (
                <article
                  className="planner-day"
                  key={day.day}
                >
                  <header>
                    <strong>Day {day.day}</strong>

                    {day.date && (
                      <span>{day.date}</span>
                    )}
                  </header>

                  <div className="planner-timeline">
                    {day.items.map((item) => (
                      <div
                        className="planner-stop"
                        key={item.id}
                      >
                        <div className="planner-time">
                          <strong>
                            {item.startTime}
                          </strong>

                          <span>
                            {item.endTime}
                          </span>
                        </div>

                        <div className="planner-dot" />

                        <div className="planner-stop-card">
                          <strong>
                            {getPlaceName(item.placeId)}
                          </strong>

                          {item.note && (
                            <p>{item.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            {trip.plan.planner.note && (
              <section className="trip-details-notes">
                <h2>Trip preferences</h2>
                <p>{trip.plan.planner.note}</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
