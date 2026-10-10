import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { SavedPlace, SharedAppState } from "@/lib/dayflow/state/types";

export const users = pgTable("users", {
  id: text("id").primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", {
    mode: "date",
  }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
    type: text("type")
      .$type<AdapterAccountType>()
      .notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id")
      .notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({
      columns: [table.provider, table.providerAccountId],
    }),
  ],
);

export const trips = pgTable(
  "trips",
  {
    id: text("id").primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
    title: text("title").notNull(),
    location: jsonb("location")
      .$type<SharedAppState["location"]>()
      .notNull(),
    plan: jsonb("plan")
      .$type<SharedAppState["plan"]>()
      .notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull().defaultNow(),
  },
  (table) => [
    index("trips_user_created_idx")
      .on(table.userId, table.createdAt),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    location: jsonb("location").$type<SharedAppState["location"]>().notNull(),
    planner: jsonb("planner").$type<SharedAppState["plan"]["planner"]>().notNull(),
    itinerary: jsonb("itinerary").$type<SharedAppState["plan"]["itinerary"]>()
      .notNull().default(sql`'[]'::jsonb`),
    needsReplan: boolean("needs_replan").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull().defaultNow(),
  },
  (table) => [
    index("plans_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const planPlaces = pgTable(
  "plan_places",
  {
    planId: text("plan_id").notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    snapshot: jsonb("snapshot").$type<SavedPlace>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "plan_places_plan_id_place_id_pk", columns: [table.planId, table.placeId] }),
    index("plan_places_plan_sort_idx").on(table.planId, table.sortOrder),
  ],
);
