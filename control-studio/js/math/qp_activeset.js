/**
 * qp_activeset.js — Tier D1: Active-set Quadratic Program solver
 *
 * Solves:
 *     min  0.5 x^T H x + g^T x
 *     s.t. A_ineq x <= b_ineq
 *          A_eq x = b_eq
 *
 * Algorithm (primal active-set, Nocedal & Wright Ch. 16):
 *   1. Start from feasible x0 (default: solve equality-only problem with no
 *      inequalities active; if infeasible, run Phase-1).
 *   2. At iteration k with working set W (active inequality indices):
 *        Solve the equality-constrained subproblem:
 *           min 0.5 p^T H p + (Hx_k + g)^T p
 *           s.t. A_W p = 0   (W-active rows of A_ineq, plus A_eq)
 *      via KKT linear system:
 *           [ H    A_W^T ] [ p ]   [ -(Hx_k + g) ]
 *           [ A_W   0    ] [ λ ] = [      0      ]
 *   3. If p = 0:
 *        Compute multipliers mu = -(λ for W-inequalities).
 *        If min(mu) >= 0: optimum reached, return.
 *        Else: remove the constraint with most-negative mu from W, continue.
 *   4. If p != 0:
 *        Compute step length α = min(1, min { (b_i - a_i^T x_k) / (a_i^T p)
 *                                           : i not in W, a_i^T p > 0 }).
 *        If α < 1: add the blocking constraint to W.
 *        Update x_{k+1} = x_k + α p.
 *
 * Bland's rule (smallest index) used for tie-breaking to prevent cycling.
 *
 * Warm-start: pass initialW = previous working set.
 */

import {
  matCreate, matMul, matTranspose, matInverse, matSolve,
} from './matrix.js';

const QP_TOL = 1e-10;
const PRIMAL_TOL = 1e-9;

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateInputs(H, g, A_ineq, b_ineq, A_eq, b_eq) {
  if (!Array.isArray(H) || H.length === 0) throw new Error('H must be non-empty');
  const n = H.length;
  if (H[0].length !== n) throw new Error('H must be square');
  if (!Array.isArray(g) || g.length !== n) throw new Error(`g must be ${n}x1`);
  if (g[0]?.length !== 1) throw new Error('g must be n x 1 column');
  if (A_ineq.length > 0) {
    if (A_ineq[0].length !== n) throw new Error('A_ineq columns must match n');
    if (b_ineq.length !== A_ineq.length) throw new Error('A_ineq rows must match b_ineq');
  }
  if (A_eq && A_eq.length > 0) {
    if (A_eq[0].length !== n) throw new Error('A_eq columns must match n');
    if (b_eq.length !== A_eq.length) throw new Error('A_eq rows must match b_eq');
  }
}

/**
 * Compute initial feasible point: solve unconstrained QP and project if needed.
 * Returns {x, feasible, infeasible}.
 *
 * Strategy:
 *   1. Solve unconstrained x = -H^-1 g
 *   2. Check feasibility for all inequalities
 *   3. If infeasible, solve Phase-1: introduce slack s >= 0, minimize sum(s)
 *      s.t. A_ineq x <= b_ineq + s. (skipped here; rely on small problem)
 *   For ControlStudio QPs (typically MPC with x=0 feasible), step 1+2 suffices.
 *   Fallback: if not feasible and no equality constraints, return projection
 *   onto the nearest box (best effort).
 */
function initialFeasible(H, g, A_ineq, b_ineq, A_eq, b_eq) {
  const n = H.length;
  // If equality constraints: solve KKT for unconstrained-but-equality problem
  let x;
  if (A_eq && A_eq.length > 0) {
    const meq = A_eq.length;
    const KKT = matCreate(n + meq, n + meq);
    const rhs = matCreate(n + meq, 1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) KKT[i][j] = H[i][j];
      for (let j = 0; j < meq; j++) KKT[i][n + j] = A_eq[j][i];
      rhs[i][0] = -g[i][0];
    }
    for (let i = 0; i < meq; i++) {
      for (let j = 0; j < n; j++) KKT[n + i][j] = A_eq[i][j];
      rhs[n + i][0] = b_eq[i][0];
    }
    const sol = matSolve(KKT, rhs);
    x = sol.slice(0, n);
  } else {
    // Unconstrained
    try {
      const Hinv = matInverse(H);
      x = matMul(Hinv, g.map((r) => [-r[0]]));
    } catch (_) {
      // H singular: use zero
      x = matCreate(n, 1);
    }
  }
  // Check inequality feasibility
  if (A_ineq.length === 0) return { x, feasible: true };
  let feasible = true;
  for (let i = 0; i < A_ineq.length; i++) {
    let v = 0;
    for (let j = 0; j < n; j++) v += A_ineq[i][j] * x[j][0];
    if (v - b_ineq[i][0] > PRIMAL_TOL) { feasible = false; break; }
  }
  if (feasible) return { x, feasible: true };

  // Try x = 0
  const x0 = matCreate(n, 1);
  let zero_feasible = true;
  for (let i = 0; i < A_ineq.length; i++) {
    if (-b_ineq[i][0] > PRIMAL_TOL) { zero_feasible = false; break; }
  }
  if (zero_feasible) {
    // Verify equality (must hold for x=0 too)
    let eq_ok = true;
    if (A_eq && A_eq.length > 0) {
      for (let i = 0; i < A_eq.length; i++) {
        if (Math.abs(b_eq[i][0]) > PRIMAL_TOL) { eq_ok = false; break; }
      }
    }
    if (eq_ok) return { x: x0, feasible: true };
  }

  // Phase-1: minimal-LP-like feasibility recovery.
  // For now, throw infeasible.
  return { x, feasible: false, infeasible: true };
}

/**
 * Solve the equality-constrained QP step:
 *   min 0.5 p^T H p + c^T p   s.t. A_W p = 0
 * Returns {p, lambdas} where lambdas correspond to A_W rows.
 */
function solveEQP(H, c, A_W) {
  const n = H.length;
  const mw = A_W.length;
  if (mw === 0) {
    // Unconstrained: p = -H^-1 c
    return { p: matMul(matInverse(H), c.map((r) => [-r[0]])), lambdas: [] };
  }
  const KKT = matCreate(n + mw, n + mw);
  const rhs = matCreate(n + mw, 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) KKT[i][j] = H[i][j];
    for (let j = 0; j < mw; j++) KKT[i][n + j] = A_W[j][i];
    rhs[i][0] = -c[i][0];
  }
  for (let i = 0; i < mw; i++) {
    for (let j = 0; j < n; j++) KKT[n + i][j] = A_W[i][j];
    rhs[n + i][0] = 0;
  }
  const sol = matSolve(KKT, rhs);
  const p = sol.slice(0, n);
  const lambdas = [];
  for (let i = 0; i < mw; i++) lambdas.push(sol[n + i][0]);
  return { p, lambdas };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Solve QP via primal active-set algorithm.
 *
 * @param {object}  opts
 * @param {number[][]}  opts.H       n × n symmetric PSD
 * @param {number[][]}  opts.g       n × 1
 * @param {number[][]}  opts.A_ineq  m_in × n  (empty array if none)
 * @param {number[][]}  opts.b_ineq  m_in × 1
 * @param {number[][]} [opts.A_eq]   m_eq × n
 * @param {number[][]} [opts.b_eq]   m_eq × 1
 * @param {number[]}   [opts.initialW] previous working set indices for warm start
 * @param {number}     [opts.maxIter=100]
 * @returns {{ x, mu, lambda, iter, workingSet, status }}
 */
export function solveQPActiveSet(opts) {
  const { H, g } = opts;
  const A_ineq = opts.A_ineq ?? [];
  const b_ineq = opts.b_ineq ?? [];
  const A_eq = opts.A_eq ?? [];
  const b_eq = opts.b_eq ?? [];
  const initialW = opts.initialW ?? null;
  const maxIter = opts.maxIter ?? 100;

  validateInputs(H, g, A_ineq, b_ineq, A_eq, b_eq);

  const n = H.length;
  const mIn = A_ineq.length;
  const mEq = A_eq.length;

  // Initial feasible point
  const init = initialFeasible(H, g, A_ineq, b_ineq, A_eq, b_eq);
  if (init.infeasible) {
    throw new Error('QP infeasible: no initial feasible point');
  }
  let x = init.x;

  // Working set W: indices into A_ineq that are currently active.
  // Always include all equality rows (with negative indices conceptually;
  // handled by appending A_eq to A_W in EQP solver).
  let W = [];
  if (initialW && Array.isArray(initialW)) {
    for (const idx of initialW) {
      if (idx >= 0 && idx < mIn) W.push(idx);
    }
  } else {
    // Cold start: add active inequalities at x
    for (let i = 0; i < mIn; i++) {
      let v = 0;
      for (let j = 0; j < n; j++) v += A_ineq[i][j] * x[j][0];
      if (Math.abs(v - b_ineq[i][0]) < PRIMAL_TOL) W.push(i);
    }
  }

  let iter = 0;
  const muOut = new Array(mIn).fill(0);
  const lambdaOut = new Array(mEq).fill(0);

  for (iter = 0; iter < maxIter; iter++) {
    // Build A_W: equality rows + W-active inequality rows
    const A_W = [];
    for (let i = 0; i < mEq; i++) A_W.push(A_eq[i].slice());
    for (const idx of W) A_W.push(A_ineq[idx].slice());

    // c = H x + g
    const Hx = matMul(H, x);
    const c = matCreate(n, 1);
    for (let i = 0; i < n; i++) c[i][0] = Hx[i][0] + g[i][0];

    // Solve EQP
    let eqpRes;
    try {
      eqpRes = solveEQP(H, c, A_W);
    } catch (e) {
      // Degenerate: drop last W and retry
      if (W.length > 0) {
        W.pop();
        continue;
      }
      throw new Error(`QP solve failed: ${e.message}`);
    }
    const p = eqpRes.p;
    const lambdas = eqpRes.lambdas;

    // Check step magnitude
    let pNorm = 0;
    for (let i = 0; i < n; i++) pNorm = Math.max(pNorm, Math.abs(p[i][0]));

    if (pNorm < QP_TOL) {
      // Optimum on current W: check Lagrangian multipliers for inequalities
      // The first mEq lambdas correspond to equality constraints; the rest to W
      let mostNegMu = 0;
      let mostNegIdx = -1;
      for (let k = 0; k < W.length; k++) {
        const lambdaIneq = lambdas[mEq + k];
        // For our convention A_in x <= b: KKT requires mu >= 0
        // lambdas as returned satisfy:  Hx + g + sum lambdas * A_W^T = 0
        // For inequalities, mu = lambda. If mu < 0, remove from W.
        if (lambdaIneq < mostNegMu - QP_TOL) {
          mostNegMu = lambdaIneq;
          mostNegIdx = k;
        }
      }
      if (mostNegIdx < 0) {
        // All mu >= 0: optimum
        // Fill outputs
        for (let k = 0; k < W.length; k++) muOut[W[k]] = lambdas[mEq + k];
        for (let i = 0; i < mEq; i++) lambdaOut[i] = lambdas[i];
        return {
          x, mu: muOut, lambda: lambdaOut,
          iter, workingSet: W.slice(), status: 'optimal',
        };
      }
      // Remove blocking constraint (Bland's rule: smallest index if tie)
      // Find smallest-index W entry with negative mu
      let removeIdx = -1, smallest = Infinity;
      for (let k = 0; k < W.length; k++) {
        if (lambdas[mEq + k] < -QP_TOL && W[k] < smallest) {
          smallest = W[k];
          removeIdx = k;
        }
      }
      if (removeIdx < 0) removeIdx = mostNegIdx;
      W.splice(removeIdx, 1);
      continue;
    }

    // Step length: alpha = min(1, min { (b_i - a_i^T x) / (a_i^T p) : i not in W, a_i^T p > 0 })
    let alpha = 1;
    let blockingIdx = -1;
    for (let i = 0; i < mIn; i++) {
      if (W.includes(i)) continue;
      let aTp = 0, aTx = 0;
      for (let j = 0; j < n; j++) {
        aTp += A_ineq[i][j] * p[j][0];
        aTx += A_ineq[i][j] * x[j][0];
      }
      if (aTp > QP_TOL) {
        const ai = (b_ineq[i][0] - aTx) / aTp;
        if (ai < alpha - QP_TOL) {
          alpha = ai;
          blockingIdx = i;
        }
      }
    }
    // Numerical safety
    if (alpha < 0) alpha = 0;

    // Update x
    for (let i = 0; i < n; i++) x[i][0] += alpha * p[i][0];

    // Add blocking
    if (blockingIdx >= 0 && alpha < 1 - QP_TOL) {
      // Bland's rule: add smallest-index blocking if multiple at same alpha
      let bestIdx = blockingIdx;
      for (let i = 0; i < mIn; i++) {
        if (W.includes(i) || i === blockingIdx) continue;
        let aTp = 0, aTx = 0;
        for (let j = 0; j < n; j++) {
          aTp += A_ineq[i][j] * p[j][0];
          aTx += A_ineq[i][j] * (x[j][0] - alpha * p[j][0]);
        }
        if (aTp > QP_TOL) {
          const ai = (b_ineq[i][0] - aTx) / aTp;
          if (Math.abs(ai - alpha) < QP_TOL && i < bestIdx) bestIdx = i;
        }
      }
      W.push(bestIdx);
    }
  }

  throw new Error(`QP did not converge in ${maxIter} iterations`);
}
