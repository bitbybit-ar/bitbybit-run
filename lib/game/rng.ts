/**
 * Tiny seeded PRNG — deterministic randomness for per-match track layouts.
 *
 * A match's obstacle/food positions are derived from its `matchId`, so every
 * player in the same match builds the identical track with zero syncing, while
 * different matches look different. Same seed in → same sequence out, on every
 * client and every reload.
 */

/** xfnv1a string hash → 32-bit unsigned seed. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — fast, decent-quality 32-bit PRNG. Returns a `() => [0,1)`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a PRNG from any string seed (e.g. a matchId). */
export function seededRng(seed: string | number): () => number {
  return mulberry32(typeof seed === "number" ? seed : hashSeed(seed));
}
