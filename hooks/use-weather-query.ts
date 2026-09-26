"use client";
import { useQuery } from "@tanstack/react-query";
import type { WeatherSummary } from "@/lib/dayflow/state/types";
export function useWeatherQuery(latitude: number, longitude: number) {
  return useQuery({
    queryKey: ["weather", latitude, longitude],
    queryFn: async () => { const r=await fetch(`/api/dayflow/weather?lat=${latitude}&lon=${longitude}`); if(!r.ok) throw new Error("Weather request failed"); return r.json() as Promise<WeatherSummary>; },
  });
}
