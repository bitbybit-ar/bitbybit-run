import "server-only";

/**
 * Persistence for finished matches — the only part of multiplayer that
 * touches the DB. The live race is all Nostr; when it ends a client posts
 * the final standings and these helpers upsert a `matches` row + one
 * `results` row per player, then the leaderboard aggregates across all of
 * them. Mirrors the server-only query style of `lib/creator/users.ts`.
 *
 * Called by `POST /api/matches` when the host's client sees the match finish.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matches, results, users } from "@/lib/db/schema";
import type { FinalStanding } from "./types";

export type Match = typeof matches.$inferSelect;
export type Result = typeof results.$inferSelect;

export interface UpsertMatchInput {
  /** Client-generated match id (the idempotency key). */
  nostrId: string;
  trackId: string;
  hostPubkey: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

/**
 * Insert a match keyed by its `nostr_id`, or return the existing row —
 * idempotent so re-submitting the same finished match never duplicates it.
 */
export async function upsertMatch(input: UpsertMatchInput): Promise<Match> {
  const db = getDb();
  const [row] = await db
    .insert(matches)
    .values({
      nostr_id: input.nostrId,
      track_id: input.trackId,
      host_pubkey: input.hostPubkey,
      started_at: input.startedAt ?? null,
      finished_at: input.finishedAt ?? null,
    })
    .onConflictDoUpdate({
      target: matches.nostr_id,
      set: { finished_at: input.finishedAt ?? new Date() },
    })
    .returning();
  return row;
}

/**
 * Persist a finished match end-to-end: upsert the match row (by `nostr_id`)
 * then its standings. Fully idempotent — safe to call more than once for the
 * same match. Returns the match's DB id.
 */
export async function persistMatchResult(input: {
  nostrId: string;
  trackId: string;
  hostPubkey: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  standings: FinalStanding[];
}): Promise<string> {
  const match = await upsertMatch({
    nostrId: input.nostrId,
    trackId: input.trackId,
    hostPubkey: input.hostPubkey,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? new Date(),
  });
  await saveResults(match.id, input.standings);
  return match.id;
}

/**
 * Persist the final standings for a match. Idempotent on (match_id, pubkey)
 * — re-posting the same results updates rather than duplicates.
 */
export async function saveResults(
  matchId: string,
  standings: FinalStanding[]
): Promise<void> {
  if (standings.length === 0) return;
  const db = getDb();
  await db
    .insert(results)
    .values(
      standings.map((s) => ({
        match_id: matchId,
        pubkey: s.pubkey,
        position: s.position,
        points: s.points,
        finish_time: s.finishTime !== null ? new Date(s.finishTime) : null,
      }))
    )
    .onConflictDoUpdate({
      target: [results.match_id, results.pubkey],
      set: {
        position: sql`excluded.position`,
        points: sql`excluded.points`,
        finish_time: sql`excluded.finish_time`,
      },
    });
}

/** All results for a single match, best placement first. */
export async function getMatchResults(matchId: string): Promise<Result[]> {
  const db = getDb();
  return db
    .select()
    .from(results)
    .where(eq(results.match_id, matchId))
    .orderBy(results.position);
}

export interface LeaderboardRow {
  pubkey: string;
  wins: number;
  points: number;
  races: number;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Global leaderboard: wins (1st-place finishes) and total points per
 * player, joined to `users` for display. Ordered by wins, then points.
 * Paginated via `limit`/`offset` (see `getLeaderboardCount` for total pages).
 */
export async function getLeaderboard(
  limit = 10,
  offset = 0
): Promise<LeaderboardRow[]> {
  const db = getDb();
  const wins = sql<number>`count(*) filter (where ${results.position} = 1)`;
  const points = sql<number>`coalesce(sum(${results.points}), 0)`;
  const races = sql<number>`count(*)`;

  const rows = await db
    .select({
      pubkey: results.pubkey,
      wins,
      points,
      races,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
    })
    .from(results)
    .leftJoin(users, eq(users.pubkey, results.pubkey))
    .groupBy(results.pubkey, users.display_name, users.avatar_url)
    .orderBy(desc(wins), desc(points))
    .limit(limit)
    .offset(offset);

  // Postgres returns count/sum as strings over the HTTP driver; normalize.
  return rows.map((r) => ({
    pubkey: r.pubkey,
    wins: Number(r.wins),
    points: Number(r.points),
    races: Number(r.races),
    display_name: r.display_name,
    avatar_url: r.avatar_url,
  }));
}

/** Total number of ranked players (distinct pubkeys) — drives pagination. */
export async function getLeaderboardCount(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      count: sql<number>`count(distinct ${results.pubkey})`,
    })
    .from(results);
  return Number(row?.count ?? 0);
}

/** A single player's results across all matches. */
export async function getResultsForPubkey(pubkey: string): Promise<Result[]> {
  const db = getDb();
  return db
    .select()
    .from(results)
    .where(eq(results.pubkey, pubkey))
    .orderBy(desc(results.created_at));
}
