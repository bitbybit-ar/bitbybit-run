/**
 * Track definition — deterministic, per-match data.
 *
 * Food sits at positions derived from a seed (the matchId), so every client in
 * the same match builds the EXACT same track with zero synchronization, while
 * different matches get different layouts. Single-player/demo (and anything
 * importing the `TRACK` constant) uses the fixed `"classic-v1"` seed.
 */

import { LANES } from "./config";
import { GOOD_IDS, BAD_IDS, BOOST_IDS } from "./foods";
import { seededRng } from "./rng";

export type FoodItem = {
  id: string;
  lane: number; // 0..LANES-1
  at: number; // distance along the track where it sits
  type: string; // key into FOODS
};

export type Sign = {
  at: number; // distance along the track
  side: -1 | 1; // -1 = left of the track, 1 = right
  text: number; // index into the localized signs list
};

export type Track = {
  id: string;
  lanes: number;
  length: number; // distance to the finish line, in track-units
  goodFood: FoodItem[]; // hydration stations -> energy
  junkFood: FoodItem[]; // obstacles -> poison
  boosters: FoodItem[]; // 🚀 speed bursts, tucked inside junk-food gauntlets
};

const LENGTH = 14300; // ~30% longer than the original 11000 → ~90s target race

/** Number of hand-tuned booster gauntlets along the track. */
const BOOST_ZONE_COUNT = 4;

type Rng = () => number;

/** Lay out food along the track. Each step drops ONE item (in an rng-chosen
 *  lane, of an rng-chosen type) so only a single lane is ever occupied at a
 *  given distance — never a wall. The `at` gets a small jitter so two matches
 *  don't feel identical, while staying on its cadence. */
function buildFood(
  prefix: string,
  startAt: number,
  step: number,
  typeIds: string[],
  rng: Rng
): FoodItem[] {
  const items: FoodItem[] = [];
  let i = 0;
  for (let at = startAt; at < LENGTH - 120; at += step) {
    const lane = Math.floor(rng() * LANES) % LANES;
    const type = typeIds[Math.floor(rng() * typeIds.length)];
    // Jitter up to ±35% of the step, clamped clear of the start/finish.
    const jitter = (rng() - 0.5) * step * 0.7;
    const pos = Math.max(80, Math.min(LENGTH - 140, at + jitter));
    items.push({ id: `${prefix}-${i}`, lane, at: pos, type });
    i++;
  }
  return items;
}

/**
 * Seeded "complicated zones": a 🚀 booster sitting in one lane, with junk food
 * filling some of the other lanes at the same distance. The zone is always
 * dodgeable — there's the booster's own (clean) lane to grab the burst, plus a
 * guaranteed junk-free escape lane to coast through if you'd rather skip it. The
 * junk in between makes reaching the 🚀 a precise merge — risk/reward, not a wall.
 * The zone's distance and booster lane vary per seed; the invariant (two safe
 * lanes) is preserved.
 */
function buildBoostZones(rng: Rng): {
  boosters: FoodItem[];
  gauntletJunk: FoodItem[];
} {
  const boosters: FoodItem[] = [];
  const gauntletJunk: FoodItem[] = [];
  const span = LENGTH / (BOOST_ZONE_COUNT + 1);
  for (let z = 0; z < BOOST_ZONE_COUNT; z++) {
    // Spread the zones out, jittered within their slice so they never sit on a
    // fixed grid (and clear of the finish line).
    const at = Math.min(
      LENGTH - 400,
      Math.round(span * (z + 1) + (rng() - 0.5) * span * 0.5)
    );
    const lane = Math.floor(rng() * LANES) % LANES;
    boosters.push({
      id: `boost-${z}`,
      lane,
      at,
      type: BOOST_IDS[z % BOOST_IDS.length],
    });
    // The lane farthest from the booster is left as a guaranteed junk-free
    // escape, so the zone can ALWAYS be passed cleanly (two safe lanes: the 🚀
    // lane and the escape lane). Every remaining lane gets junk.
    let escape = 0;
    let best = -1;
    for (let l = 0; l < LANES; l++) {
      const d = Math.abs(l - lane);
      if (d > best) {
        best = d;
        escape = l;
      }
    }
    let g = 0;
    for (let l = 0; l < LANES; l++) {
      if (l === lane || l === escape) continue;
      gauntletJunk.push({
        id: `gauntlet-${z}-${g}`,
        lane: l,
        at,
        type: BAD_IDS[g % BAD_IDS.length],
      });
      g++;
    }
  }
  return { boosters, gauntletJunk };
}

/** Build a full track from a seed. Same seed → same track everywhere; different
 *  matches (matchId) get different obstacle/food layouts. */
export function buildTrack(seed: string | number): Track {
  const rng = seededRng(seed);
  const { boosters, gauntletJunk } = buildBoostZones(rng);
  return {
    id: typeof seed === "string" ? seed : `seed-${seed}`,
    lanes: LANES,
    length: LENGTH,
    // Foods placed a bit closer together so energy is easier to sustain.
    goodFood: buildFood("good", 140, 150, GOOD_IDS, rng),
    junkFood: [...buildFood("junk", 230, 210, BAD_IDS, rng), ...gauntletJunk],
    boosters,
  };
}

/** Default track for single-player/demo and any static `TRACK` importers. */
export const TRACK: Track = buildTrack("classic-v1");

/** Crowd signs lining the track, alternating sides. `text` cycles through the
 *  localized list of funny signs. */
function buildSigns(): Sign[] {
  const signs: Sign[] = [];
  let i = 0;
  for (let at = 320; at < LENGTH - 200; at += 360) {
    signs.push({ at, side: i % 2 === 0 ? -1 : 1, text: i });
    i++;
  }
  return signs;
}

export const SIGNS: Sign[] = buildSigns();
