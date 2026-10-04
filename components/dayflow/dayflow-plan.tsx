"use client";

import Link from "next/link";
import type { PlaceSummary } from "@/lib/dayflow/state/types";
import { useDayFlowStore } from "@/lib/dayflow/state/store";

export function DayFlowPlan({ places }: { places: PlaceSummary[] }) {
  const ids = useDayFlowStore((state) => state.shared.plan.placeIds);
  const remove = useDayFlowStore((state) => state.removePlaceFromPlan);
  const items = ids
    .map((id) => places.find((place) => place.id === id))
    .filter((place): place is PlaceSummary => Boolean(place));

  if (ids.length === 0) return null;

  return (
    <section className="dayflow-plan">
      <strong>My plan</strong>
      {ids.map((id) => {
        const place = items.find((candidate) => candidate.id === id);
        return (
          <button key={id} onClick={() => remove(id)} title="Remove from plan">
            {place?.name ?? "Saved place"} ×
          </button>
        );
      })}
      <Link href="/plan" className="dayflow-plan-write">Write plan →</Link>
    </section>
  );
}
