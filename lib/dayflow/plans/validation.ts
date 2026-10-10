import { z } from "zod";
import {
  dayPlanSchema,
  geoLocationSchema,
  planSettingsSchema,
  savedPlaceSchema,
} from "@/lib/dayflow/state/schema";

export const planTitleSchema = z.string().trim().min(1).max(120);

export const createPlanSchema = z.object({
  title: planTitleSchema,
  location: geoLocationSchema,
  planner: planSettingsSchema,
}).strict();

export const updatePlanSchema = z.object({
  title: planTitleSchema.optional(),
  planner: planSettingsSchema.optional(),
  itinerary: z.array(dayPlanSchema).max(14).optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update" },
);

export const addPlanPlaceSchema = z.object({
  place: savedPlaceSchema,
}).strict();

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type AddPlanPlaceInput = z.infer<typeof addPlanPlaceSchema>;

export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 400) {
    super(message);
  }
}

const MAX_BODY_BYTES = 256_000;

export async function readJsonBody(request: Request): Promise<unknown> {
  const reportedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(reportedLength) && reportedLength > MAX_BODY_BYTES) {
    throw new RequestBodyError("Request is too large", 413);
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new RequestBodyError("Request is too large", 413);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RequestBodyError("Invalid JSON body");
  }
}
