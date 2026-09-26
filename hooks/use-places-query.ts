"use client";
import { useQuery } from "@tanstack/react-query";
import type { PlaceSummary } from "@/lib/dayflow/state/types";
export function usePlacesQuery(latitude:number, longitude:number, radiusKm:1|2|5) {
  return useQuery({ queryKey:["places",latitude,longitude,radiusKm], queryFn: async()=>{const r=await fetch(`/api/dayflow/places?lat=${latitude}&lon=${longitude}&radiusKm=${radiusKm}`); if(!r.ok) throw new Error("Places request failed"); const data=await r.json() as {places:PlaceSummary[]}; return data.places;} });
}
