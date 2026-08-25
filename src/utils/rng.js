/**
 * Small deterministic PRNG.
 *
 * Worlds seed this so their scenery lays out identically on every load — a
 * fresh `Math.random()` would reshuffle every tree and building each time you
 * drove through a portal.
 */
export function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
