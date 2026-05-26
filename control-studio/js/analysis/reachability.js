/**
 * reachability.js — Tier F1: Reachability analysis via zonotopes
 *
 * A zonotope Z is represented as { center: c, generators: G } where
 *   Z = { c + Σ_i α_i g_i : |α_i| ≤ 1 }
 *
 * c is an n-vector, G is an n × k array of column vectors (stored as
 * row-major arrays here: G[i] is the i-th generator, length n).
 *
 * Forward reach for linear discrete system  x_{k+1} = A x_k + B u_k:
 *   R_{k+1} = A R_k ⊕ B·U
 * where U is the input set and ⊕ is Minkowski sum.
 *
 * Properties exploited:
 *   - Linear map:    A · Z = { A c, [A g_1, ..., A g_k] }
 *   - Minkowski:     Z1 ⊕ Z2 = { c1 + c2, [G1 ; G2] }
 *
 * Containment check (over-approximation): a point x is in Z iff
 *   x - c can be written as G α with |α|_∞ ≤ 1. This is an LP; for low
 *   dimensions we use Chebyshev bound:
 *     ||(G^+)(x - c)||_∞ ≤ 1
 *   where G^+ is the Moore-Penrose pseudo-inverse. Conservative but
 *   correct: if the test holds, x ∈ Z (sufficient condition).
 *
 *   For a more honest test in 2D, we check the projection onto each
 *   generator direction does not exceed support.
 */

import { matCreate, matMul } from '../math/matrix.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateZonotope(Z, label = 'zonotope') {
  if (!Z || !Array.isArray(Z.c) || !Array.isArray(Z.G)) {
    throw new Error(`${label} must have {c, G} arrays`);
  }
}

// ── Construction ────────────────────────────────────────────────────────────

/**
 * Create a zonotope from an axis-aligned box centred at `center` with
 * half-widths `range`. Result has n generators, each axis-aligned.
 *
 * @param {number[]} center  length n
 * @param {number[]} range   length n (positive half-widths)
 * @returns {{c, G}}
 */
export function zonotopeFromBox(center, range) {
  if (!Array.isArray(center) || !Array.isArray(range)) {
    throw new Error('center and range must be arrays');
  }
  if (center.length !== range.length) {
    throw new Error('center and range must have same length');
  }
  const n = center.length;
  const G = [];
  for (let i = 0; i < n; i++) {
    const g = new Array(n).fill(0);
    g[i] = range[i];
    G.push(g);
  }
  return { c: center.slice(), G };
}

// ── Operations ──────────────────────────────────────────────────────────────

/**
 * Apply linear map A to zonotope Z:
 *   A·Z = { Ac + AG α : |α|≤1 }
 */
export function linearMapZonotope(A, Z) {
  validateZonotope(Z);
  const n = A.length;
  const m = A[0].length;
  if (m !== Z.c.length) {
    throw new Error(`A columns (${m}) must match zonotope dim (${Z.c.length})`);
  }
  // Map center
  const c2 = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) c2[i] += A[i][j] * Z.c[j];
  }
  // Map each generator
  const G2 = Z.G.map((g) => {
    const ng = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) ng[i] += A[i][j] * g[j];
    }
    return ng;
  });
  return { c: c2, G: G2 };
}

/**
 * Minkowski sum of two zonotopes: concatenate generator lists.
 */
export function minkowskiSum(Z1, Z2) {
  validateZonotope(Z1, 'Z1');
  validateZonotope(Z2, 'Z2');
  if (Z1.c.length !== Z2.c.length) {
    throw new Error('zonotope dimensions must match');
  }
  const c = Z1.c.map((v, i) => v + Z2.c[i]);
  const G = [...Z1.G.map((g) => g.slice()), ...Z2.G.map((g) => g.slice())];
  return { c, G };
}

// ── Reachability ────────────────────────────────────────────────────────────

/**
 * Compute reachable sets for x_{k+1} = A x_k + B u_k over a finite horizon.
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {{c,G}}      X0    initial state set
 * @param {{c,G}|null} U     input set (or null for autonomous)
 * @param {number}     horizon
 * @returns {{c,G}[]}  length horizon+1
 */
export function reachZonotope(A, B, X0, U, horizon) {
  if (!Array.isArray(A) || !Array.isArray(B)) {
    throw new Error('A and B must be arrays');
  }
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new Error('horizon must be positive integer');
  }
  const sets = [X0];
  // Precompute B·U as zonotope
  let BU = null;
  if (U !== null && U !== undefined) {
    BU = linearMapZonotope(B, U);
  }
  for (let k = 0; k < horizon; k++) {
    const AX = linearMapZonotope(A, sets[k]);
    const Rnext = BU ? minkowskiSum(AX, BU) : AX;
    sets.push(Rnext);
  }
  return sets;
}

// ── Containment ─────────────────────────────────────────────────────────────

/**
 * Check whether point x is in zonotope Z (approximate via support function).
 *
 * For each generator g_i, support along direction g_i is sum_j |g_j · g_i|.
 * Decompose y = x - c as linear combination of generators via pseudo-inverse.
 * Sufficient condition: ||(G^+)(y)||_∞ ≤ 1 + tol.
 *
 * For diagonal G (axis-aligned box zonotope), this reduces to checking
 * each coordinate is in [c_i - g_ii, c_i + g_ii].
 *
 * @param {{c,G}} Z
 * @param {number[]} x
 * @param {number} [tol=1e-9]
 * @returns {boolean}
 */
export function containsPoint(Z, x, tol = 1e-9) {
  validateZonotope(Z);
  const n = Z.c.length;
  if (x.length !== n) {
    throw new Error(`x length ${x.length} must match zonotope dim ${n}`);
  }
  const y = x.map((v, i) => v - Z.c[i]);

  // Solve y = G α  for α (G stored as row-major, generators are G[i])
  // G as matrix: columns are generators -> n × k matrix M[i][j] = G[j][i]
  const k = Z.G.length;
  const M = matCreate(n, k);
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < n; i++) {
      M[i][j] = Z.G[j][i];
    }
  }

  // For k == n, solve M α = y directly via Gaussian elimination on augmented matrix
  // For k != n, use least-squares (M^T M) α = M^T y (pseudo-inverse).
  let alpha;
  try {
    if (k === n) {
      alpha = gaussianSolve(M, y);
    } else {
      // pseudo-inverse via normal equations
      const Mt = transpose(M);
      const MtM = multiply(Mt, M);
      const Mty = matVecMul(Mt, y);
      alpha = gaussianSolveMat(MtM, Mty);
    }
  } catch (_) {
    // Singular -> point not representable (or generators degenerate); fall back to box bound
    return checkBoxBound(Z, x, tol);
  }

  for (const a of alpha) {
    if (Math.abs(a) > 1 + tol) return false;
  }
  return true;
}

// Helpers --------------------------------------------------------------------

function transpose(M) {
  const r = M.length, c = M[0].length;
  const out = matCreate(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j][i] = M[i][j];
  return out;
}

function multiply(A, B) {
  return matMul(A, B);
}

function matVecMul(M, v) {
  const out = new Array(M.length).fill(0);
  for (let i = 0; i < M.length; i++) {
    for (let j = 0; j < v.length; j++) out[i] += M[i][j] * v[j];
  }
  return out;
}

function gaussianSolve(M, b) {
  // M is n x n; b is length n
  const n = M.length;
  const aug = M.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    // Pivot
    let piv = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(aug[i][k]) > Math.abs(aug[piv][k])) piv = i;
    }
    if (Math.abs(aug[piv][k]) < 1e-14) throw new Error('singular');
    [aug[k], aug[piv]] = [aug[piv], aug[k]];
    // Eliminate
    for (let i = k + 1; i < n; i++) {
      const factor = aug[i][k] / aug[k][k];
      for (let j = k; j <= n; j++) aug[i][j] -= factor * aug[k][j];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = aug[i][n];
    for (let j = i + 1; j < n; j++) s -= aug[i][j] * x[j];
    x[i] = s / aug[i][i];
  }
  return x;
}

function gaussianSolveMat(A, b) {
  return gaussianSolve(A, b);
}

function checkBoxBound(Z, x, tol) {
  // Conservative: project x onto support hyperplanes via generators
  // For each generator direction, |g · (x - c)| <= sum_i |g · g_i|
  const n = Z.c.length;
  const y = x.map((v, i) => v - Z.c[i]);
  for (const g of Z.G) {
    const gNorm = Math.hypot(...g);
    if (gNorm < 1e-14) continue;
    const proj = g.reduce((s, v, i) => s + v * y[i], 0) / gNorm;
    let support = 0;
    for (const g2 of Z.G) {
      let dot = 0;
      for (let i = 0; i < n; i++) dot += g[i] * g2[i];
      support += Math.abs(dot) / gNorm;
    }
    if (Math.abs(proj) > support + tol) return false;
  }
  return true;
}
