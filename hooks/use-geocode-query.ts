"use client";
import { useQuery } from "@tanstack/react-query";
import type { GeocodeResult } from "@/lib/dayflow/state/types";
export function useGeocodeQuery(query:string, enabled:boolean) {
  return useQuery({ queryKey:["geocode",query], enabled: enabled && query.trim().length>0, queryFn: async()=>{const r=await fetch(`/api/dayflow/geocode?q=${encodeURIComponent(query)}`); if(!r.ok) throw new Error("Geocoding request failed"); const data=await r.json() as {results:GeocodeResult[]}; return data.results;} });
}
