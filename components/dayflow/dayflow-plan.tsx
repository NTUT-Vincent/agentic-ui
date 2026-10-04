"use client";

import Link from "next/link";
import { useDayFlowStore } from "@/lib/dayflow/state/store";

export function DayFlowPlan() {
  const places = useDayFlowStore((state) => state.shared.plan.places);
  const remove = useDayFlowStore((state) => state.removePlaceFromPlan);

  if (places.length === 0) return null;

  return (
    <section className="dayflow-plan">
      <strong>My plan</strong>
      {places.map((place) => (
        <button key={place.id} onClick={() => remove(place.id)} title="Remove from plan">
          {place.name} ×
        </button>
      ))}
      <Link href="/plan" className="dayflow-plan-write">Write plan →</Link>
    </section>
  );
}
