import { z } from "zod";

export const placeCategorySchema = z.enum([
  "cafe",
  "restaurant",
  "park",
  "gym",
  "library",
  "supermarket",
  "pharmacy",
  "cinema",
  "museum",
]);

export const geoLocationSchema = z.object({
  query: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const sharedAppStateSchema = z.object({
  schemaVersion: z.literal(1),
  location: geoLocationSchema,
  filters: z.object({
    categories: z.array(placeCategorySchema),
    radiusKm: z.union([z.literal(1), z.literal(2), z.literal(5)]),
    environment: z.enum(["all", "indoor", "outdoor"]),
    sortBy: z.enum(["distance", "name"]),
  }),
  view: z.object({ mode: z.enum(["split", "map", "list"]) }),
  selection: z.object({ placeId: z.string().nullable() }),
  plan: z.object({ placeIds: z.array(z.string()) }),
});
