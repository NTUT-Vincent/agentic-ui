"use client";
import type { PlaceSummary } from "@/lib/dayflow/state/types";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
export function DayFlowPlan({places}:{places:PlaceSummary[]}){const ids=useDayFlowStore((s)=>s.shared.plan.placeIds);const remove=useDayFlowStore((s)=>s.removePlaceFromPlan);const items=ids.map((id)=>places.find((p)=>p.id===id)).filter((p):p is PlaceSummary=>Boolean(p));if(items.length===0)return null;return <section className="dayflow-plan"><strong>My plan</strong>{items.map((place)=><button key={place.id} onClick={()=>remove(place.id)} title="Remove from plan">{place.name} ×</button>)}</section>}
