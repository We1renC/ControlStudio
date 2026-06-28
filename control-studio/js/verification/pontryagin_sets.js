/**
 * pontryagin_sets.js — Polytope Minkowski sum and Pontryagin difference.
 *
 * Loop 14 (Zero-Flaw) addition.
 *
 * Polytope conventions: a convex polytope P ⊂ ℝⁿ is represented by its
 * vertices V_P = {v_1, ..., v_K} (V-representation) or by half-space
 * inequalities A x ≤ b (H-representation).
 *
 * Minkowski sum (V-representation):
 *   A ⊕ B = conv({a + b : a ∈ V_A, b ∈ V_B})
 *
 * Pontryagin difference (H-representation):
 *   A ⊖ B = { x : x + b ∈ A for all b ∈ B }
 *         = { x : a_i^T x ≤ b_i − max_{b ∈ B} a_i^T b }
 *   where (a_i^T x ≤ b_i) are the half-spaces of A.
 *
 * Both operations are central to Tube MPC (Mayne-Seron-Raković 2005) and
 * robust positively invariant set computation (Raković, Kerrigan, Kouramas,
 * Mayne 2005 "Invariant approximations of the minimal robust positively
 * invariant set", IEEE TAC 50(3)).
 *
 * Reference:
 *   - Schneider, "Convex Bodies: The Brunn-Minkowski Theory", Cambridge.
 *   - Kvasnica, Grieder, Baotić, "Multi-Parametric Toolbox (MPT)", 2004.
 *   - Mayne, Seron, Raković, "Robust model predictive control of
 *     constrained linear systems with bounded disturbances", Automatica
 *     41(2), 2005.
 */

/**
 * Compute the convex hull of a 2-D point cluster using the monotone-chain
 * algorithm. Returns vertices in counter-clockwise order.
 */
export function convexHull2D(points) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('hull2D: non-empty points required');
  }
  const cleaned = points
    .filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
    .slice()
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (cleaned.length <= 1) return cleaned;
  const cross = (O, A, B) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
  const lower = [];
  for (const p of cleaned) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const p = cleaned[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

/**
 * Minkowski sum of two 2-D polytopes (V-representation).
 */
export function minkowskiSum2D(A, B) {
  if (!Array.isArray(A) || !Array.isArray(B)) {
    throw new Error('minkowski: V-representations required');
  }
  const combos = [];
  for (const a of A) for (const b of B) combos.push([a[0] + b[0], a[1] + b[1]]);
  return convexHull2D(combos);
}

/**
 * Pontryagin difference using H-representation.
 * Inputs: A and B given as arrays of { a: number[], b: number } half-spaces
 * meaning a^T x ≤ b. Returns the H-representation of A ⊖ B by tightening
 * each face's right-hand side: b_i_new = b_i − support_B(a_i).
 *
 * support_B(a) = max_{x ∈ B} a^T x  computed by enumerating B's vertices.
 */
export function pontryaginDifference(faces, vertsB) {
  if (!Array.isArray(faces) || !Array.isArray(vertsB) || vertsB.length === 0) {
    throw new Error('pontryagin: invalid arguments');
  }
  const out = [];
  for (const face of faces) {
    let support = -Infinity;
    for (const v of vertsB) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += face.a[i] * v[i];
      if (dot > support) support = dot;
    }
    out.push({ a: face.a.slice(), b: face.b - support });
  }
  return out;
}

/**
 * Compute the support function of a polytope in the V-representation along
 * direction d: max_{v ∈ V} d^T v.
 */
export function supportFunction(verts, direction) {
  let s = -Infinity;
  for (const v of verts) {
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += direction[i] * v[i];
    if (dot > s) s = dot;
  }
  return s;
}

/**
 * Build canonical H-representation of an axis-aligned 2-D box [-a, a] × [-b, b].
 */
export function boxH(a, b) {
  return [
    { a: [ 1,  0], b: a },
    { a: [-1,  0], b: a },
    { a: [ 0,  1], b: b },
    { a: [ 0, -1], b: b },
  ];
}

/**
 * Build canonical V-representation of an axis-aligned 2-D box [-a, a] × [-b, b].
 */
export function boxV(a, b) {
  return [[-a, -b], [a, -b], [a, b], [-a, b]];
}
