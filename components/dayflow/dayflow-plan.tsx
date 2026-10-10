"use client";

import Link from "next/link";
import { useDayFlowStore } from "@/lib/dayflow/state/store";

type Props = {
  activePlanId: string | null;
  busy: boolean;
  dirty: boolean;
  onRemove: (id: string) => Promise<boolean>;
};

export function DayFlowPlan({ activePlanId, busy, dirty, onRemove }: Props) {
  const places = useDayFlowStore((s) => s.shared.plan.places);
  if (!activePlanId) return null;
  return (
    <section className="dayflow-plan">
      <div className="dayflow-plan-header">
        <strong>My plan · {places.length} places</strong>
        <Link href={"/plan?planId=" + encodeURIComponent(activePlanId)}>Open Planner →</Link>
      </div>
      {places.length === 0 ? <p>Add a location from Explore to get started.</p> : (
        <div className="dayflow-plan-items">
          {places.map((place) => (
            <button key={place.id} type="button"
              disabled={busy || dirty}
              title={dirty ? "Save changes first" : "Remove from plan"}
              onClick={() => void onRemove(place.id)}>
              {place.name} ×
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
