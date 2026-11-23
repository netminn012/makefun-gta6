// random.js — a tiny seeded random generator (mulberry32). The whole city is built from one of
// these, so a given seed always raises the same Solmar City: the screenshots staged with
// ?seed=1 are the same streets a player gets, and the world never reshuffles between visits.

/** Create a generator from a 32-bit seed. Returns helpers, not just the raw stream. */
export function createRandom(seed) {
  let state = seed >>> 0;
  // mulberry32: one multiply-xorshift round per draw, good enough for placing palms and cars.
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** An integer in [min, max], both ends included. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** One element of an array. */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** True with probability p. */
    chance: (p) => next() < p,
  };
}
