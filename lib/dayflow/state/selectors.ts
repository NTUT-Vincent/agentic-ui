import type { PlaceSummary, SharedAppState } from "./types";

export function getVisiblePlaces(state: SharedAppState, places: PlaceSummary[]) {
  const categories = state.filters.categories;
  const environment = state.filters.environment;

  const filtered = places.filter((place) => {
    if (categories.length > 0 && !categories.includes(place.category)) return false;
    if (environment !== "all" && place.environment !== environment) return false;
    return place.distanceMeters <= state.filters.radiusKm * 1000;
  });

  return filtered.sort((a, b) => {
    if (state.filters.sortBy === "name") return a.name.localeCompare(b.name);
    return a.distanceMeters - b.distanceMeters;
  });
}
