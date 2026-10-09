import { auth } from "@/auth";
import { db } from "@/lib/db";
import { trips, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );
    }

    const { id } = await params;

    if (!id) {
      return Response.json(
        { error: "Trip not found" },
        { status: 404, headers },
      );
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, session.user.email))
      .limit(1);

    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );
    }

    const [trip] = await db
      .select({
        id: trips.id,
        title: trips.title,
        location: trips.location,
        plan: trips.plan,
        createdAt: trips.createdAt,
        updatedAt: trips.updatedAt,
      })
      .from(trips)
      .where(
        and(
          eq(trips.id, id),
          eq(trips.userId, user.id),
        ),
      )
      .limit(1);

    if (!trip) {
      return Response.json(
        { error: "Trip not found" },
        { status: 404, headers },
      );
    }

    return Response.json(
      {
        trip: {
          ...trip,
          createdAt: trip.createdAt.toISOString(),
          updatedAt: trip.updatedAt.toISOString(),
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("[DayFlow][trip:detail:error]", error);

    return Response.json(
      { error: "Unable to load trip" },
      { status: 500, headers },
    );
  }
}
