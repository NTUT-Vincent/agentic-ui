import type { PlaceSummary, SharedAppState, WeatherSummary } from "../state/types";
export type DayFlowAgentContext = {
  weather: { temperatureC: number; apparentTemperatureC: number; rainNextHours: number[] } | null;
  visiblePlaces: Array<Pick<PlaceSummary, "id" | "name" | "category" | "distanceMeters" | "environment">>;
};
export function buildAgentContext(_state: SharedAppState, weather: WeatherSummary | null, places: PlaceSummary[]): DayFlowAgentContext {
  return {
    weather: weather ? {
      temperatureC: weather.temperatureC,
      apparentTemperatureC: weather.apparentTemperatureC,
      rainNextHours: weather.hourly.slice(0, 6).map((hour) => hour.precipitationProbability),
    } : null,
    visiblePlaces: places.slice(0, 60).map(({ id, name, category, distanceMeters, environment }) => ({ id, name, category, distanceMeters, environment })),
  };
}
