import { auth } from "@/auth";
import { db } from "@/lib/db";
import { trips, users } from "@/lib/db/schema";
import { geoLocationSchema, sharedAppStateSchema } from "@/lib/dayflow/state/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256_000;
const saveTripSchema = z.object({
  location: geoLocationSchema,
  plan: sharedAppStateSchema.shape.plan,
});

const privateHeaders = { "Cache-Control": "private, no-store" };

async function getSignedInUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) return null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);

  return user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await getSignedInUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
    }

    const records = await db
      .select({
        id: trips.id,
        title: trips.title,
        location: trips.location,
        plan: trips.plan,
        createdAt: trips.createdAt,
      })
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(desc(trips.createdAt))
      .limit(50);

    const items = records.map((trip) => ({
      id: trip.id,
      title: trip.title,
      city: trip.location.name,
      country: trip.location.country,
      days: trip.plan.planner.days,
      placeCount: trip.plan.places.length,
      createdAt: trip.createdAt.toISOString(),
    }));

    return Response.json({ trips: items }, { headers: privateHeaders });
  } catch (error) {
    console.error("[DayFlow][trips:list:error]", error);
    return Response.json({ error: "Unable to load trips" }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getSignedInUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: "Trip is too large" }, { status: 413, headers: privateHeaders });
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "Trip is too large" }, { status: 413, headers: privateHeaders });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: privateHeaders });
    }

    const parsed = saveTripSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid trip data" }, { status: 400, headers: privateHeaders });
    }

    const { location, plan } = parsed.data;
    const validPlaces = new Set(plan.places.map((place) => place.id));
    if (
      validPlaces.size === 0 ||
      !plan.itinerary.some((day) => day.items.length > 0) ||
      plan.itinerary.some((day) => day.items.some((item) => !validPlaces.has(item.placeId)))
    ) {
      return Response.json({ error: "Generate a valid itinerary before saving" }, { status: 400, headers: privateHeaders });
    }

    const title = location.name + " · " + plan.planner.days + "-day plan";
    const [saved] = await db.insert(trips).values({
      userId,
      title,
      location,
      plan,
    }).returning({ id: trips.id, createdAt: trips.createdAt });

    return Response.json({
      id: saved.id,
      title,
      createdAt: saved.createdAt.toISOString(),
    }, { status: 201, headers: privateHeaders });
  } catch (error) {
    console.error("[DayFlow][trips:save:error]", error);
    return Response.json({ error: "Unable to save trip" }, { status: 500, headers: privateHeaders });
  }
}
