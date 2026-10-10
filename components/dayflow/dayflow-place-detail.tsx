"use client";

import type { PlaceSummary } from "@/lib/dayflow/state/types";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import { CATEGORY_LABELS } from "./dayflow-filters";

type Props = {
  place: PlaceSummary | null;
  busy: boolean;
  hasActivePlan: boolean;
  dirty: boolean;
  onAdd: (place: PlaceSummary) => Promise<boolean>;
};

export function DayFlowPlaceDetail({ place, busy, hasActivePlan, dirty, onAdd }: Props) {
  const select = useDayFlowStore((s) => s.selectPlace);
  const saved = useDayFlowStore((s) => s.shared.plan.places);
  if (!place) return null;
  const added = saved.some((item) => item.id === place.id);
  return (
    <aside className="dayflow-detail">
      <button className="dayflow-detail-close" onClick={() => select(null)} aria-label="Close">×</button>
      <span>{CATEGORY_LABELS[place.category]}</span>
      <h2>{place.name}</h2>
      <p>{place.distanceMeters} m away · {place.environment}</p>
      {place.openingHours && <p>Hours: {place.openingHours}</p>}
      {place.website && <a href={place.website} target="_blank" rel="noreferrer">Website ↗</a>}
      <button className="dayflow-primary"
        onClick={() => void onAdd(place)}
        disabled={added || busy || !hasActivePlan || dirty}>
        {added ? "✓ In Plan" : !hasActivePlan ? "Choose Plan first"
          : dirty ? "Save changes first" : busy ? "Adding…" : "Add to Plan"}
      </button>
    </aside>
  );
}
