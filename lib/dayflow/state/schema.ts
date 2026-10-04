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

export const planPaceSchema = z.enum(["relaxed", "balanced", "packed"]);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const planItemSchema = z.object({
  id: z.string().min(1),
  placeId: z.string().min(1),
  startTime: timeSchema,
  endTime: timeSchema,
  note: z.string().optional(),
});

export const dayPlanSchema = z.object({
  day: z.number().int().min(1),
  date: dateSchema.optional(),
  items: z.array(planItemSchema),
});

export const planSettingsSchema = z.object({
  days: z.number().int().min(1).max(14),
  startDate: dateSchema.nullable(),
  dailyStartTime: timeSchema,
  dailyEndTime: timeSchema,
  pace: planPaceSchema,
  note: z.string().max(1000),
});

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
  plan: z.object({
    placeIds: z.array(z.string()),
    planner: planSettingsSchema,
    itinerary: z.array(dayPlanSchema),
  }),
});
