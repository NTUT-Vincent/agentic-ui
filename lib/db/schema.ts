import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { SharedAppState } from "@/lib/dayflow/state/types";

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
