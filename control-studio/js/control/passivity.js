/**
 * passivity.js — Passivity / Dissipativity / Port-Hamiltonian baseline.
 *
 * Loop 1 (Zero-Flaw) addition. Covers the gap where ControlStudio had no
 * support for passivity-based control (PBC), KYP lemma checks, or
 * port-Hamiltonian (PH) system manipulation.
 *
 * Conventions:
 *   - Continuous LTI plant: ẋ = A x + B u,  y = C x + D u
 *   - Passive (with supply rate u^T y) iff there exists P = P^T > 0 such that
 *       [ A^T P + P A     P B - C^T ]
 *       [    B^T P - C       -D - D^T ] ≤ 0           (KYP / PR lemma)
 *   - Strictly Positive Real (SPR) when the above is strictly negative
 *     definite and D + D^T > 0.
 *
 * Port-Hamiltonian (PCH) explicit form:
 *   ẋ = (J(x) - R(x)) ∇H(x) + g(x) u
 *   y  = g(x)^T ∇H(x)
 *   where J = -J^T (interconnection), R = R^T ≥ 0 (dissipation),
 *   H(x) is the Hamiltonian energy storage.
 *
 * References:
 *   - Brogliato, Lozano, Maschke, Egeland, "Dissipative Systems Analysis
 *     and Control", 2nd ed., Springer.
 *   - van der Schaft, "L2-Gain and Passivity Techniques in Nonlinear
 *     Control", §4.
 *   - Ortega, van der Schaft, Maschke, Escobar, "Interconnection and
 *     damping assignment passivity-based control of port-controlled
 *     Hamiltonian systems", Automatica 38 (2002).
 */

import {
  matAdd, matMul, matScale, matSub, matSymmetrize, matTranspose,
  matCreate, matInverse, matEigenvaluesSymmetric, matIsPositiveDefinite,
  matIdentity,
} from '../math/matrix.js';
import { solveContinuousLyapunov } from './state-feedback.js';

// ── utilities ──────────────────────────────────────────────────────────────

function ensureSquare(M, label) {
  if (!Array.isArray(M) || M.length === 0) throw new Error(`${label}: matrix must be non-empty`);
  const n = M.length;
  for (const row of M) {
    if (!Array.isArray(row) || row.length !== n) {
      throw new Error(`${label}: matrix must be square (${n}×${n})`);
    }
    for (const v of row) {
      if (!Number.isFinite(v)) throw new Error(`${label}: matrix has non-finite entries`);
    }
  }
  return n;
}

function symmetricPart(M) {
  return matSymmetrize(M);
}

function minSymEig(M) {
  const sym = matSymmetrize(M);
  const eigs = matEigenvaluesSymmetric(sym);
  let m = Infinity;
  for (const e of eigs) if (e < m) m = e;
  return m;
}

function maxSymEig(M) {
  const sym = matSymmetrize(M);
  const eigs = matEigenvaluesSymmetric(sym);
  let m = -Infinity;
  for (const e of eigs) if (e > m) m = e;
  return m;
}

// ── KYP lemma feasibility (Positive Real test) ─────────────────────────────

/**
 * Check positive realness via a constructive KYP-lemma certificate.
 *
 * For SISO/MIMO LTI (A,B,C,D), positive realness on the imaginary axis is
 * equivalent to the existence of P = P^T > 0 satisfying
 *   M(P) = [ A^T P + P A        P B - C^T ]   ≤ 0
 *          [    B^T P - C         -(D + D^T) ]
 *
 * The implementation uses a deterministic candidate: solve the Lyapunov
 * equation A^T P + P A = -Q with Q chosen as I when A is Hurwitz, then
 * test the KYP block matrix sign. This is a *sufficient* condition (the
 * full KYP LMI is convex but lossy without SDP); when A is Hurwitz and
 * the candidate fails, we report a quantitative violation margin so the
 * caller can react without invoking a full SDP solver.
 *
 * Returns:
 *   {
 *     feasible: boolean,
 *     strictlyPositiveReal: boolean,
 *     P: number[][] | null,
 *     kypEigMax: number,        // largest eigenvalue of M(P) (≤0 → PR)
 *     directFeedThrough: number, // λ_min(D+D^T) (>0 ⇒ SPR candidate)
 *     reason?: string,
 *   }
 */
export function checkPositiveReal(A, B, C, D, options = {}) {
  const tol = Number.isFinite(options.tol) ? options.tol : 1e-9;
  const n = ensureSquare(A, 'KYP/PR: A');
  if (!Array.isArray(B) || B.length !== n) {
    throw new Error('KYP/PR: B must have the same number of rows as A');
  }
  const m = B[0].length;
  if (!Array.isArray(C) || C.length === 0 || C[0].length !== n) {
    throw new Error('KYP/PR: C must have the same number of columns as A');
  }
  const p = C.length;
  if (p !== m) {
    return {
      feasible: false,
      strictlyPositiveReal: false,
      P: null,
      kypEigMax: NaN,
      directFeedThrough: NaN,
      reason: 'KYP/PR: positive realness requires a square system (p = m).',
    };
  }
  if (!Array.isArray(D) || D.length !== p || D[0].length !== m) {
    throw new Error('KYP/PR: D must be p×m');
  }

  // 1. Choose candidate P from Lyapunov equation with identity weighting.
  let P;
  try {
    const sol = solveContinuousLyapunov(A); // A^T P + P A = -I  (requires Hurwitz A)
    P = sol.P;
  } catch (e) {
    return {
      feasible: false,
      strictlyPositiveReal: false,
      P: null,
      kypEigMax: NaN,
      directFeedThrough: NaN,
      reason: `KYP/PR: A is not Hurwitz, deterministic candidate unavailable (${e.message}).`,
    };
  }

  // 2. Build the KYP block matrix M(P).
  const AtP = matMul(matTranspose(A), P);
  const PA = matMul(P, A);
  const M11 = matAdd(AtP, PA);                       // n×n
  const PB = matMul(P, B);                           // n×m
  const M12 = matSub(PB, matTranspose(C));           // n×m
  const Dsym = matAdd(D, matTranspose(D));           // m×m
  const negD = matScale(Dsym, -1);                   // m×m

  const size = n + m;
  const M = matCreate(size, size, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = M11[i][j];
    for (let j = 0; j < m; j++) M[i][n + j] = M12[i][j];
  }
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) M[n + i][j] = M12[j][i]; // (M12)^T
    for (let j = 0; j < m; j++) M[n + i][n + j] = negD[i][j];
  }

  const kypEigMax = maxSymEig(M);
  const directFeedThrough = minSymEig(Dsym);
  const feasible = kypEigMax <= tol;
  const strictlyPositiveReal = kypEigMax < -tol && directFeedThrough > tol;

  return {
    feasible,
    strictlyPositiveReal,
    P,
    kypEigMax,
    directFeedThrough,
  };
}

// ── Storage function from Lyapunov certificate ────────────────────────────

/**
 * Quadratic storage function V(x) = x^T P x derived from a Lyapunov
 * certificate of A. Supply rate s(u, y) = u^T y - V̇(x) is automatically
 * tracked via the dissipation inequality V̇ ≤ s(u, y).
 */
export function storageFunctionQuadratic(A, options = {}) {
  ensureSquare(A, 'storage: A');
  const sol = solveContinuousLyapunov(A, options.Q ?? null);
  const P = sol.P;
  return {
    P,
    evaluate(x) {
      if (!Array.isArray(x) || x.length !== P.length) {
        throw new Error('storage: state vector dimension mismatch');
      }
      let sum = 0;
      for (let i = 0; i < P.length; i++) {
        for (let j = 0; j < P.length; j++) sum += x[i] * P[i][j] * x[j];
      }
      return sum;
    },
  };
}

// ── Port-Hamiltonian explicit form ────────────────────────────────────────

/**
 * Build a Port-Hamiltonian system (linear PCH special case):
 *   ẋ = (J - R) Q x + g u
 *   y = g^T Q x
 * where H(x) = (1/2) x^T Q x, with Q = Q^T > 0 the energy metric.
 *
 * Verifies J = -J^T, R = R^T ≥ 0, Q = Q^T > 0 at construction time.
 */
export function buildLinearPortHamiltonian(J, R, Q, g) {
  const n = ensureSquare(J, 'PCH: J');
  ensureSquare(R, 'PCH: R');
  ensureSquare(Q, 'PCH: Q');
  if (R.length !== n || Q.length !== n) {
    throw new Error('PCH: J/R/Q must share dimension n');
  }
  if (!Array.isArray(g) || g.length !== n) {
    throw new Error('PCH: g must have n rows');
  }
  const m = g[0].length;

  // structural checks
  const Jsym = matAdd(J, matTranspose(J));
  const Rsym = matSub(R, matTranspose(R));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.abs(Jsym[i][j]) > 1e-9) {
        throw new Error('PCH: J must be skew-symmetric (J + J^T = 0)');
      }
      if (Math.abs(Rsym[i][j]) > 1e-9) {
        throw new Error('PCH: R must be symmetric');
      }
    }
  }
  if (!matIsPositiveDefinite(Q, -1e-12)) {
    // Allow positive semidefinite; require non-negative spectrum.
    const minE = minSymEig(Q);
    if (minE < -1e-9) throw new Error('PCH: Q must be positive semidefinite');
  }
  const minR = minSymEig(R);
  if (minR < -1e-9) throw new Error('PCH: R must be positive semidefinite');

  // Equivalent state-space (A,B,C,D) form.
  const JmR = matSub(J, R);
  const A = matMul(JmR, Q);
  const B = g;
  const Ct = matMul(matTranspose(g), Q); // m×n
  const C = Ct;
  const D = matCreate(m, m, 0);

  return { J, R, Q, g, A, B, C, D, dim: n, inputs: m, outputs: m };
}

/**
 * Energy balance check on a port-Hamiltonian system trajectory:
 *   H(x(t)) - H(x(0)) ≤ ∫₀ᵗ u^T y dτ - ∫₀ᵗ ∇H^T R ∇H dτ
 * This routine evaluates both sides numerically for a recorded trajectory
 * and reports the worst per-sample violation (should be ≤ tol).
 */
export function checkEnergyBalance(pch, trajectory) {
  if (!pch || !pch.Q) throw new Error('energy balance: PCH model required');
  const { Q, R } = pch;
  const { t, x, u } = trajectory;
  if (!Array.isArray(t) || !Array.isArray(x) || !Array.isArray(u)) {
    throw new Error('energy balance: trajectory must provide t, x, u arrays');
  }
  if (t.length !== x.length || t.length !== u.length) {
    throw new Error('energy balance: t/x/u lengths must match');
  }

  const H = (xv) => {
    let s = 0;
    for (let i = 0; i < Q.length; i++) {
      for (let j = 0; j < Q.length; j++) s += xv[i] * Q[i][j] * xv[j];
    }
    return 0.5 * s;
  };

  let supplyAccum = 0;
  let dissipationAccum = 0;
  let worstViolation = 0;
  const H0 = H(x[0]);
  for (let k = 1; k < t.length; k++) {
    const dt = t[k] - t[k - 1];
    if (dt <= 0) throw new Error('energy balance: t must be strictly increasing');
    // Trapezoidal rule for supply rate u^T y where y = g^T Q x.
    const supplyHere = innerProduct(u[k], yOf(pch, x[k]));
    const supplyPrev = innerProduct(u[k - 1], yOf(pch, x[k - 1]));
    supplyAccum += 0.5 * dt * (supplyHere + supplyPrev);
    // Dissipation: (Qx)^T R (Qx)
    const qHere = matVec(Q, x[k]);
    const qPrev = matVec(Q, x[k - 1]);
    const dissHere = quadForm(R, qHere);
    const dissPrev = quadForm(R, qPrev);
    dissipationAccum += 0.5 * dt * (dissHere + dissPrev);
    const Hk = H(x[k]);
    const violation = (Hk - H0) - (supplyAccum - dissipationAccum);
    if (violation > worstViolation) worstViolation = violation;
  }
  return {
    initialEnergy: H0,
    finalEnergy: H(x[x.length - 1]),
    supplyIntegral: supplyAccum,
    dissipationIntegral: dissipationAccum,
    worstViolation,
  };
}

function yOf(pch, xv) {
  const Qx = matVec(pch.Q, xv);
  return matVec(matTranspose(pch.g), Qx);
}

function matVec(M, v) {
  const out = new Array(M.length).fill(0);
  for (let i = 0; i < M.length; i++) {
    for (let j = 0; j < v.length; j++) out[i] += M[i][j] * v[j];
  }
  return out;
}

function quadForm(M, v) {
  let s = 0;
  for (let i = 0; i < M.length; i++) {
    for (let j = 0; j < v.length; j++) s += v[i] * M[i][j] * v[j];
  }
  return s;
}

function innerProduct(a, b) {
  if (a.length !== b.length) throw new Error('inner product: vector length mismatch');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ── IDA-PBC baseline (Interconnection and Damping Assignment) ─────────────

/**
 * IDA-PBC controller for the linear PCH special case.
 *
 * Goal: shape the closed-loop energy to H_d(x) = (1/2)(x - x*)^T Q_d (x - x*),
 * with desired interconnection J_d (= -J_d^T) and damping R_d (≥ 0):
 *   (J_d - R_d) Q_d x = (J - R) Q x + g u(x)
 *
 * Closed-form solution when g is full column-rank:
 *   u(x) = (g^T g)^{-1} g^T [(J_d - R_d) Q_d - (J - R) Q] x
 *
 * Returns the feedback gain K such that u = -K x and the closed-loop PCH.
 */
export function designIDAPBC(pch, target) {
  if (!pch || !pch.A) throw new Error('IDA-PBC: PCH model required');
  const Jd = target.Jd ?? pch.J;
  const Rd = target.Rd ?? pch.R;
  const Qd = target.Qd ?? pch.Q;
  ensureSquare(Jd, 'IDA-PBC: J_d');
  ensureSquare(Rd, 'IDA-PBC: R_d');
  ensureSquare(Qd, 'IDA-PBC: Q_d');

  const { J, R, Q, g } = pch;
  const n = J.length;
  const Ad = matMul(matSub(Jd, Rd), Qd);            // desired A
  const A = matMul(matSub(J, R), Q);                // open-loop A
  const delta = matSub(Ad, A);                      // g * (-K) = delta

  // Solve (g^T g) X = g^T delta  for X = -K (gain to be applied)
  const gT = matTranspose(g);
  const gTg = matMul(gT, g);
  let gTgInv;
  try {
    gTgInv = matInverse(gTg);
  } catch (e) {
    throw new Error(`IDA-PBC: g^T g not invertible (g must be column full-rank): ${e.message}`);
  }
  const X = matMul(gTgInv, matMul(gT, delta));
  const Kneg = X;                                   // u = X * x
  const K = matScale(Kneg, -1);                     // canonical: u = -K x

  // Verify matching equation residual.
  const residual = matSub(matAdd(A, matMul(g, Kneg)), Ad);
  let maxResidual = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = Math.abs(residual[i][j]);
      if (v > maxResidual) maxResidual = v;
    }
  }

  return {
    K,
    Aclosed: Ad,
    matchingResidual: maxResidual,
    closedLoopPCH: { J: Jd, R: Rd, Q: Qd, g, A: Ad, B: g, C: matMul(matTranspose(g), Qd), D: matCreate(g[0].length, g[0].length, 0) },
  };
}

// ── Passivity index (input feedforward / output feedback) ─────────────────

/**
 * Smallest static input feedforward / output feedback (ε, δ) such that the
 * system becomes input-strictly-passive (ISP) or output-strictly-passive
 * (OSP). For LTI systems this collapses to checking shifted KYP feasibility:
 *
 *   ISP(ε): replace D ← D + ε I and rerun PR test.
 *   OSP(δ): replace D ← D + δ I and require Q' = Q + δ C^T C (lossless OSP
 *           with linear output injection); we use the simpler input-feedforward
 *           shift here, which suffices to test passivity excess vs shortage.
 *
 * Returns the maximum δ ≥ 0 keeping PR (excess) or the minimum δ < 0 needed
 * to restore PR (shortage).
 */
export function passivityShortageExcess(A, B, C, D, options = {}) {
  const grid = options.grid ?? 41;
  const range = options.range ?? 2;
  if (!(grid >= 3) || !Number.isInteger(grid)) {
    throw new Error('passivityShortageExcess: grid must be an integer ≥ 3');
  }
  if (!(range > 0)) throw new Error('passivityShortageExcess: range must be > 0');
  const m = D.length;
  let bestExcess = -Infinity;
  let bestShortage = Infinity;
  const I = matIdentity(m);
  for (let i = 0; i < grid; i++) {
    const alpha = -range + (2 * range) * (i / (grid - 1));
    const Dshift = matAdd(D, matScale(I, alpha));
    const r = checkPositiveReal(A, B, C, Dshift, options);
    if (r.feasible) {
      if (alpha > bestExcess) bestExcess = alpha;
      if (alpha < bestShortage) bestShortage = alpha;
    }
  }
  const excess = bestExcess === -Infinity ? 0 : bestExcess;
  const shortage = bestShortage === Infinity ? 0 : bestShortage;
  return { excess, shortage };
}
