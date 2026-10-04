"use client";

import type { PlaceSummary } from "@/lib/dayflow/state/types";
import { useDayFlowStore } from "@/lib/dayflow/state/store";

export function PlanResult({ places }: { places: PlaceSummary[] }) {
  const itinerary = useDayFlowStore((state) => state.shared.plan.itinerary);
  if (itinerary.length === 0) return null;

  const placeName = (placeId: string) => places.find((place) => place.id === placeId)?.name ?? "Planned place";

  return (
    <section className="planner-result">
      {itinerary.map((day) => (
        <article key={day.day} className="planner-day">
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
                  <strong>{placeName(item.placeId)}</strong>
                  {item.note && <p>{item.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
