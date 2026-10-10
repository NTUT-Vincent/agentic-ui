import "server-only";

import { neon } from "@neondatabase/serverless";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { planPlaces, plans, users } from "@/lib/db/schema";
import type { DayPlan, GeoLocation, PlanSettings, SavedPlace } from "@/lib/dayflow/state/types";
import type { CreatePlanInput, UpdatePlanInput } from "./validation";

const getNeonSql = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  return neon(process.env.DATABASE_URL);
};

export class PlanValidationError extends Error {}

export type PlanDetails = {
  id: string;
  title: string;
  location: GeoLocation;
  planner: PlanSettings;
  places: SavedPlace[];
  itinerary: DayPlan[];
  needsReplan: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) return null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  return user?.id ?? null;
}

export async function listOwnedPlans(userId: string) {
  const records = await db
    .select({
      id: plans.id,
      title: plans.title,
      location: plans.location,
      planner: plans.planner,
      needsReplan: plans.needsReplan,
      updatedAt: plans.updatedAt,
      placeCount: sql<number>`(
        SELECT COUNT(*)::int FROM plan_places
        WHERE plan_id = ${plans.id}
      )`,
    })
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.updatedAt))
    .limit(50);

  return records.map((record) => ({
    id: record.id,
    title: record.title,
    city: record.location.name,
    country: record.location.country,
    days: record.planner.days,
    placeCount: record.placeCount,
    needsReplan: record.needsReplan,
    updatedAt: record.updatedAt.toISOString(),
  }));
}

export async function getOwnedPlan(userId: string, id: string): Promise<PlanDetails | null> {
  const [record] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, id), eq(plans.userId, userId)))
    .limit(1);
  if (!record) return null;

  const places = await db
    .select({ snapshot: planPlaces.snapshot })
    .from(planPlaces)
    .where(eq(planPlaces.planId, id))
    .orderBy(asc(planPlaces.sortOrder), asc(planPlaces.placeId));

  return {
    id: record.id,
    title: record.title,
    location: record.location,
    planner: record.planner,
    places: places.map(({ snapshot }) => snapshot),
    itinerary: record.itinerary,
    needsReplan: record.needsReplan,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function createOwnedPlan(userId: string, input: CreatePlanInput) {
  const [record] = await db.insert(plans).values({
    userId,
    title: input.title,
    location: input.location,
    planner: input.planner,
    itinerary: [],
  }).returning({ id: plans.id });
  return getOwnedPlan(userId, record.id);
}

export async function updateOwnedPlan(
  userId: string,
  id: string,
  input: UpdatePlanInput,
): Promise<PlanDetails | null> {
  const current = await getOwnedPlan(userId, id);
  if (!current) return null;

  if (input.itinerary !== undefined) {
    const allowedIds = new Set(current.places.map((place) => place.id));
    const maxDay = (input.planner ?? current.planner).days;
    const uniqueDays = new Set(input.itinerary.map((day) => day.day));
    if (
      uniqueDays.size !== input.itinerary.length ||
      input.itinerary.some((day) =>
        day.day > maxDay || day.items.some((item) => !allowedIds.has(item.placeId)))
    ) {
      throw new PlanValidationError("Itinerary uses invalid days or unknown place IDs");
    }
  }

  await db.update(plans).set({
    ...(input.title !== undefined && { title: input.title }),
    ...(input.planner !== undefined && { planner: input.planner }),
    ...(input.itinerary !== undefined && { itinerary: input.itinerary }),
    // Preserve any concurrently-set replan flag when only renaming.
    ...(input.itinerary !== undefined
      ? { needsReplan: false }
      : input.planner !== undefined
        ? { needsReplan: sql`${plans.needsReplan} OR jsonb_array_length(${plans.itinerary}) > 0` }
        : {}),
    updatedAt: new Date(),
  }).where(and(eq(plans.id, id), eq(plans.userId, userId)));

  return getOwnedPlan(userId, id);
}

// Atomic CTE: inserting the place and flagging the existing itinerary happen
// together. drizzle-orm/neon-http does not support db.transaction().
export async function addOwnedPlanPlace(userId: string, id: string, place: SavedPlace) {
  const neonSql = getNeonSql();
  const result = await neonSql`
    WITH inserted AS (
      INSERT INTO plan_places (plan_id, place_id, snapshot, sort_order)
      SELECT p.id, ${place.id}, ${JSON.stringify(place)}::jsonb,
             (SELECT COALESCE(MAX(sort_order), -1) + 1
              FROM plan_places WHERE plan_id = ${id})
      FROM plans AS p
      WHERE p.id = ${id} AND p.user_id = ${userId}
        AND (SELECT COUNT(*) FROM plan_places WHERE plan_id = ${id}) < 150
      ON CONFLICT (plan_id, place_id) DO NOTHING
      RETURNING place_id
    ), touched AS (
      UPDATE plans SET
        updated_at = NOW(),
        needs_replan = needs_replan OR jsonb_array_length(itinerary) > 0
      WHERE id = ${id} AND user_id = ${userId}
        AND EXISTS (SELECT 1 FROM inserted)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS inserted
  `;
  return result[0]?.inserted === true;
}

// Atomic CTE: remove place and remove all scheduled stops referencing it;
// preserve all other days/stops without clearing the whole itinerary.
export async function removeOwnedPlanPlace(userId: string, id: string, placeId: string) {
  const neonSql = getNeonSql();
  const result = await neonSql`
    WITH removed AS (
      DELETE FROM plan_places
      WHERE plan_id = ${id} AND place_id = ${placeId}
        AND EXISTS (
          SELECT 1 FROM plans
          WHERE id = ${id} AND user_id = ${userId}
        )
      RETURNING place_id
    ), touched AS (
      UPDATE plans AS p SET
        itinerary = (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_set(
                day_entry.day, '{items}',
                COALESCE((
                  SELECT jsonb_agg(stop.item ORDER BY stop.position)
                  FROM jsonb_array_elements(day_entry.day->'items')
                    WITH ORDINALITY AS stop(item, position)
                  WHERE stop.item->>'placeId' <> ${placeId}
                ), '[]'::jsonb)
              ) ORDER BY day_entry.position
            ), '[]'::jsonb
          )
          FROM jsonb_array_elements(p.itinerary)
            WITH ORDINALITY AS day_entry(day, position)
        ),
        needs_replan = p.needs_replan OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p.itinerary) AS d(day)
          CROSS JOIN LATERAL jsonb_array_elements(d.day->'items') AS stop(item)
          WHERE stop.item->>'placeId' = ${placeId}
        ),
        updated_at = NOW()
      WHERE p.id = ${id} AND p.user_id = ${userId}
        AND EXISTS (SELECT 1 FROM removed)
      RETURNING p.id
    )
    SELECT EXISTS (SELECT 1 FROM removed) AS removed
  `;
  return result[0]?.removed === true;
}
