import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// --- Users ---
// One row per signed-in account. Keyed by Nostr pubkey — the user's
// identity is their key, period. Auto-created at sign-in from kind:0
// metadata (display name, avatar, banner, bio).
//
// `active` is the platform-admin moderation gate. Inactive users
// disappear from discovery surfaces but the row + history stays for
// audit.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pubkey: varchar("pubkey", { length: 64 }).notNull().unique(),
    slug: varchar("slug", { length: 40 }).notNull().unique(),
    display_name: varchar("display_name", { length: 80 }).notNull(),
    bio: text("bio"),
    avatar_url: text("avatar_url"),
    // Wide banner image displayed behind the avatar + name + bio.
    // Seeded from kind:0 `banner` at sign-in. Null when unset.
    banner_url: text("banner_url"),
    // Lightning address (kind:0 `lud16`) used to zap this user's race
    // winnings. Seeded + re-synced from Nostr; null when unset.
    lud16: varchar("lud16", { length: 255 }),
    // Default UI language for this user.
    locale: varchar("locale", { length: 2 }).notNull().default("es"),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_pubkey_idx").on(table.pubkey),
    uniqueIndex("users_slug_idx").on(table.slug),
    index("users_active_idx").on(table.active),
  ]
);

// --- Auth nonces ---
// Single-use guard for NIP-98 login events (anti-replay). Each accepted auth
// event's id is recorded here so a captured `Authorization: Nostr …` header
// can't be replayed within its freshness window to mint a second session.
// Durable (not in-process memory) so it holds across Vercel's serverless
// instances and cold starts. Rows are short-lived: `expires_at` is ~the
// validation window, and the login path sweeps expired rows so the table
// stays tiny without a cron.
export const authNonces = pgTable(
  "auth_nonces",
  {
    // The Nostr event id (sha256 hex) — the natural idempotency key.
    id: varchar("id", { length: 64 }).primaryKey(),
    expires_at: timestamp("expires_at").notNull(),
  },
  (table) => [index("auth_nonces_expires_idx").on(table.expires_at)]
);

// --- Matches ---
// One row per *completed* race that gets persisted. The live match runs
// entirely over Nostr (no server); we only write to the DB when a match
// ends so the leaderboard and history are queryable. `host_pubkey` is the
// Nostr identity that hosted; it references `users.pubkey` by value (no FK
// — a host may not have a local user row yet).
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Client-generated match id from the Nostr layer (e.g. "bbr-<host>-<ts>").
    // Unique so persisting the same match twice upserts instead of duplicating.
    nostr_id: varchar("nostr_id", { length: 80 }).notNull().unique(),
    // Shared static track id (e.g. "classic-v1") — see lib/game/track.ts.
    track_id: varchar("track_id", { length: 64 }).notNull(),
    host_pubkey: varchar("host_pubkey", { length: 64 }).notNull(),
    started_at: timestamp("started_at"),
    finished_at: timestamp("finished_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("matches_host_idx").on(table.host_pubkey)]
);

// --- Results ---
// One row per player per match: their final placement and points. Keyed to
// the player by `pubkey` (matches `users.pubkey`, joined lazily for display
// name/avatar). The unique (match_id, pubkey) pair makes result-saving
// idempotent.
export const results = pgTable(
  "results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    match_id: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    pubkey: varchar("pubkey", { length: 64 }).notNull(),
    position: integer("position").notNull(),
    points: integer("points").notNull().default(0),
    // Unix-ms finish time the client reported; null if they never finished.
    finish_time: timestamp("finish_time"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("results_match_idx").on(table.match_id),
    index("results_pubkey_idx").on(table.pubkey),
    uniqueIndex("results_match_pubkey_idx").on(table.match_id, table.pubkey),
  ]
);
