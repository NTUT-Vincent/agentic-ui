"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DayFlowHeader } from "./dayflow-header";

import type { PlanSummary } from "@/lib/dayflow/plans/client";

type TripSummary = PlanSummary;

type LoadStatus = "loading" | "ready" | "unauthorized" | "error";

export function MyTrips() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [trips, setTrips] = useState<TripSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrips() {
      try {
        const response = await fetch("/api/dayflow/plans", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;

        if (response.status === 401) {
          setStatus("unauthorized");
          return;
        }
        if (!response.ok) throw new Error("Failed to fetch trips.");

        const result = (await response.json()) as { plans?: TripSummary[] };
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.plans)) throw new Error("Invalid trips response.");
        setTrips(result.plans!);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }

    void loadTrips();
    return () => controller.abort();
  }, []);

  return (
    <div className="dayflow-app my-trips-app">
      <DayFlowHeader />
      <main className="my-trips-shell">
        <header className="my-trips-header">
          <Link href="/" className="planner-back">← Back to explore</Link>
          <span className="dayflow-kicker">YOUR SAVED PLANS</span>
          <h1>My Trips</h1>
          <p>Collect places and plan itineraries at your own pace.</p>
        </header>

        {status === "loading" && (
          <section className="my-trips-empty" role="status">Loading your trips…</section>
        )}

        {status === "unauthorized" && (
          <section className="my-trips-empty">
            <h2>Sign in to view your trips</h2>
            <p>Use Sign in with Google in the header to see your saved itineraries.</p>
          </section>
        )}

        {status === "error" && (
          <section className="my-trips-empty" role="alert">
            <h2>Could not load your trips</h2>
            <p>Try refreshing the page.</p>
          </section>
        )}

        {status === "ready" && trips.length === 0 && (
          <section className="my-trips-empty">
            <h2>No plans saved yet</h2>
            <p>Create a Plan in Explore, then add places to it.</p>
            <Link className="dayflow-primary my-trips-link" href="/">Explore Plans →</Link>
          </section>
        )}

        {status === "ready" && trips.length > 0 && (
          <>
            <p className="my-trips-count">{trips.length} saved {trips.length === 1 ? "trip" : "trips"}</p>
            <div className="my-trips-grid">
              {trips.map((trip) => (
                <Link
                  href={`/my-trips/${encodeURIComponent(trip.id)}`}
                  className="my-trips-card my-trips-card-link"
                  key={trip.id}
                >
                  <span className="dayflow-kicker">{trip.city}, {trip.country}</span>
                  <h2>{trip.title}</h2>
                  <p>{trip.days} {trip.days === 1 ? "day" : "days"} · {trip.placeCount} {trip.placeCount === 1 ? "place" : "places"}</p>
                  <time dateTime={trip.updatedAt}>
                    Updated {new Date(trip.updatedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  <span className="my-trips-card-action">
                    View Plan →
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
