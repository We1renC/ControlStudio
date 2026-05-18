// rng.js — seedable pseudo-random number generators for reproducible simulations.
// Default backend: Math.random (non-deterministic). When a seed is set, switches to mulberry32.

let _seed = null;
let _state = 0;

/**
 * Mulberry32 — small, fast 32-bit hash-based PRNG with good statistical properties.
 * Produces a function returning floats in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _generator = null;

/** Set a deterministic seed. Pass `null` to revert to Math.random. */
export function setSeed(seed) {
  if (seed == null) { _seed = null; _generator = null; return; }
  _seed = seed | 0;
  _state = _seed;
  _generator = mulberry32(_seed);
}

export function getSeed() { return _seed; }

/** Uniform float in [0, 1). */
export function rand() {
  return _generator ? _generator() : Math.random();
}

/** Normal-distributed sample (Box-Muller). */
export function randn() {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Reset the generator to its initial seed (so simulations restart reproducibly). */
export function resetSeed() {
  if (_seed != null) _generator = mulberry32(_seed);
}
