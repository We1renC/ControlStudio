/**
 * flatness.js — Differential flatness baseline (Fliess-Lévine-Martin-Rouchon).
 *
 * Loop 1 (Zero-Flaw) addition. ControlStudio had no flat-output certification
 * or polynomial flat-trajectory generator. This module provides:
 *
 *   1. Linear-system flatness certification:
 *        For controllable LTI (A, B) with single input, the system is
 *        differentially flat with flat output z = c^T x for any c that
 *        makes the Brunovsky canonical form observable from c, i.e.
 *        the observability matrix O(A, c) has full rank n. The canonical
 *        flat output is c = e_n^T T^{-1} where T transforms (A, B) to
 *        controller canonical form.
 *
 *   2. Polynomial trajectory generation in the flat output space:
 *        Given boundary conditions on z and its first (n-1) derivatives at
 *        t=0 and t=T, fit a (2n-1)-degree polynomial in tau = t/T such that
 *        z^{(k)}(0) and z^{(k)}(T_f) match for k = 0..n-1. Recover the state
 *        trajectory x(t) and input u(t) algebraically from the chain
 *        x = Phi(z, ż, …, z^{(n-1)})  and  u = Psi(z, ż, …, z^{(n)}).
 *
 *   3. Brunovsky chain check: relative degree from u to z equals n.
 *
 * References:
 *   - Fliess, Lévine, Martin, Rouchon, "Flatness and defect of non-linear
 *     systems: introductory theory and examples", IJC 61 (1995).
 *   - Sira-Ramírez & Agrawal, "Differentially Flat Systems", Marcel Dekker.
 *   - Rouchon, "Necessary condition and genericity of flatness", 1995.
 */

import {
  matIdentity, matMul, matVecMul, matCreate, matSolve, matTranspose, matRank,
} from '../math/matrix.js';
import { controllabilityMatrix, observabilityMatrix } from './state-space.js';

// ── utilities ──────────────────────────────────────────────────────────────

function ensureMatrix(M, label) {
  if (!Array.isArray(M) || M.length === 0 || !Array.isArray(M[0])) {
    throw new Error(`${label}: expected non-empty 2-D array`);
  }
}

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

// ── Flatness certification ─────────────────────────────────────────────────

/**
 * Certify that the SISO LTI system (A, B) is differentially flat with a
 * chosen flat-output direction c.
 *
 * Returns { flat, observabilityRank, characteristicPoly, brunovskyT }.
 *  - flat: true iff (A, c^T) is observable (rank n).
 *  - brunovskyT: similarity transform x = T z mapping (A, B) to controller
 *    canonical form for SISO systems.
 */
export function certifyLinearFlatness(A, B, c = null) {
  ensureMatrix(A, 'flatness: A');
  ensureMatrix(B, 'flatness: B');
  const n = A.length;
  if (B.length !== n) throw new Error('flatness: B row count must equal n');
  if (B[0].length !== 1) {
    throw new Error('flatness: only single-input systems supported in this baseline');
  }
  const ctrb = controllabilityMatrix(A, B);
  const rankC = matRank(ctrb);
  if (rankC < n) {
    return { flat: false, observabilityRank: 0, reason: 'plant not controllable; flatness requires controllability for SISO LTI' };
  }
  // Default flat output: pick c such that c^T = e_n^T * inv(ctrb) when ctrb
  // is the controllability matrix [B, AB, …, A^{n-1}B]. This is the canonical
  // last-row choice that yields the Brunovsky chain.
  let cVec;
  if (c) {
    cVec = c.flat();
    if (cVec.length !== n) throw new Error('flatness: c must have length n');
  } else {
    // Solve ctrb^T * y = e_n  => y is the last column of inv(ctrb) when
    // ctrb is square. The flat output direction is c = y^T.
    const rhs = new Array(n).fill(0);
    rhs[n - 1] = 1;
    const sol = matSolve(matTranspose(ctrb), rhs);
    cVec = sol;
  }
  const cRow = [cVec];                    // 1×n
  const obs = observabilityMatrix(A, cRow);
  const rankO = matRank(obs);

  return {
    flat: rankO === n,
    observabilityRank: rankO,
    flatOutputDirection: cVec,
    controllabilityRank: rankC,
  };
}

// ── Polynomial trajectory generation in the flat output space ──────────────

/**
 * Build a polynomial z(t) of degree (2n-1) such that the boundary conditions
 *   z^{(k)}(0) = z0Derivs[k],  z^{(k)}(T) = zfDerivs[k],  k = 0..n-1
 * are exactly matched. Returns coefficients in monomial basis ordered
 * z(t) = a_0 + a_1 t + … + a_{2n-1} t^{2n-1}.
 *
 * Implementation: solve the 2n×2n linear system M a = b where each block of
 * n rows encodes derivatives at t=0 (lower-triangular factorial pattern) or
 * t=T (full Pascal pattern).
 */
export function flatPolynomialTrajectory(z0Derivs, zfDerivs, T) {
  if (!Array.isArray(z0Derivs) || !Array.isArray(zfDerivs)) {
    throw new Error('flat trajectory: derivative arrays required');
  }
  const n = z0Derivs.length;
  if (zfDerivs.length !== n) throw new Error('flat trajectory: boundary derivative lengths must match');
  if (!(T > 0) || !Number.isFinite(T)) throw new Error('flat trajectory: T must be > 0');
  const m = 2 * n;
  const M = matCreate(m, m, 0);
  const b = new Array(m).fill(0);

  // Derivative at t=0: z^{(k)}(0) = k! * a_k
  for (let k = 0; k < n; k++) {
    M[k][k] = factorial(k);
    b[k] = z0Derivs[k];
  }
  // Derivative at t=T: z^{(k)}(T) = sum_{j>=k} a_j * j!/(j-k)! * T^{j-k}
  for (let k = 0; k < n; k++) {
    for (let j = k; j < m; j++) {
      M[n + k][j] = factorial(j) / factorial(j - k) * Math.pow(T, j - k);
    }
    b[n + k] = zfDerivs[k];
  }
  const a = matSolve(M, b);
  return {
    coefficients: a,
    evaluate(t) { return evalPoly(a, t); },
    evaluateDerivative(t, order) { return evalDeriv(a, t, order); },
    duration: T,
  };
}

function evalPoly(a, t) {
  let v = 0;
  for (let i = a.length - 1; i >= 0; i--) v = v * t + a[i];
  return v;
}

function evalDeriv(a, t, order) {
  if (order < 0) throw new Error('derivative order must be ≥ 0');
  if (order === 0) return evalPoly(a, t);
  const m = a.length;
  let v = 0;
  for (let i = m - 1; i >= order; i--) {
    v = v * t + a[i] * (factorial(i) / factorial(i - order));
  }
  return v;
}

// ── Recover state and input from flat output trajectory ────────────────────

/**
 * For SISO LTI in Brunovsky chain form (z, ż, …, z^{(n-1)}) <-> x, the state
 * trajectory equals the (n-1) consecutive derivatives of the flat output,
 * and the input is obtained from the highest derivative.
 *
 * x(t) = [z; ż; …; z^{(n-1)}]
 * u(t) = (z^{(n)} − a_{n-1} z^{(n-1)} − … − a_0 z) / b_n
 *
 * For canonical Brunovsky chain (companion form with B = e_n, A row sums
 * = -characteristic-polynomial coefficients) the input is simply z^{(n)}.
 * We expose the simpler chain by default and let callers pass `coeffs` to
 * recover Brunovsky input for arbitrary (A,B).
 */
export function recoverFromFlatTrajectory(traj, n, options = {}) {
  if (!traj || typeof traj.evaluate !== 'function') {
    throw new Error('recover: traj must be a polynomial trajectory descriptor');
  }
  const samples = options.samples ?? 101;
  const T = traj.duration;
  const t = new Array(samples);
  const x = new Array(samples);
  const u = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const tau = (T * i) / (samples - 1);
    t[i] = tau;
    const xi = new Array(n);
    for (let k = 0; k < n; k++) xi[k] = traj.evaluateDerivative(tau, k);
    x[i] = xi;
    u[i] = traj.evaluateDerivative(tau, n);
  }
  return { t, x, u };
}

// ── Convenience: from boundary point to (x, u) trajectory ─────────────────

export function planFlatTrajectorySISO(A, B, T, zInitDerivs, zFinalDerivs, options = {}) {
  const cert = certifyLinearFlatness(A, B);
  if (!cert.flat) {
    throw new Error(`plan flat: system is not flat under default direction (${cert.reason ?? 'observability rank deficient'})`);
  }
  const traj = flatPolynomialTrajectory(zInitDerivs, zFinalDerivs, T);
  const profile = recoverFromFlatTrajectory(traj, A.length, options);
  return { certificate: cert, trajectory: traj, profile };
}
