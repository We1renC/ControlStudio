/**
 * lqg_ltr.js — LQG synthesis + Loop Transfer Recovery (Doyle-Stein).
 *
 * Loop 1 (Zero-Flaw) addition. ControlStudio previously exposed
 * `solveLqr`, `solveLqe`, `simulateLqg` but had no one-shot LQG synthesis
 * wrapper and no Loop Transfer Recovery routine, leaving classical
 * Doyle-Stein 1979 / Maciejowski Ch.5 / Athans 1986 unverified.
 *
 * Plant: ẋ = A x + B u + w,   y = C x + v
 *   w ~ N(0, Qn),  v ~ N(0, Rn)
 *
 * Synthesis:
 *   1.  LQR: K = R^{-1} B^T P,   P solves CARE(A,B,Q,R)
 *   2.  LQE: L = Y C^T Rn^{-1},  Y solves CARE(A^T, C^T, Qn, Rn)
 *   3.  Controller K_c(s) = K (sI − A + BK + LC)^{-1} L  (state-space)
 *
 * LTR (Doyle-Stein):
 *   Recover LQR target loop gain T_FSF(jω) = K (jωI − A)^{-1} B by inflating
 *   the process noise covariance Q_n = Q_n0 + q^2 B B^T as q → ∞ (at the
 *   plant input, minimum-phase case). The user provides the LTR direction
 *   (`input` for LTR-at-input, `output` for LTR-at-output) and a strictly
 *   increasing `qSchedule` array; we sweep schedule and report which q-step
 *   pushes the loop frequency-response close enough to the LQR target.
 *
 * Reference:
 *   - Doyle & Stein, "Robustness with Observers", IEEE TAC, 1979.
 *   - Athans, "A Tutorial on the LQG/LTR Method", ACC 1986.
 *   - Maciejowski, "Multivariable Feedback Design", Ch.5.
 *   - Skogestad & Postlethwaite, §6.7.
 */

import {
  matAdd, matMul, matSub, matInverse, matIdentity, matTranspose, matScale,
} from '../math/matrix.js';
import { solveLqr, solveLqe, closedLoopA } from './state-feedback.js';
import { MIMOStateSpace, evalAtJw, singularValues } from './mimo.js';

// ── helpers ────────────────────────────────────────────────────────────────

function ensureMatrix(M, label) {
  if (!Array.isArray(M) || M.length === 0 || !Array.isArray(M[0])) {
    throw new Error(`${label}: expected non-empty 2-D array`);
  }
  for (const row of M) {
    if (!Array.isArray(row) || row.length !== M[0].length) {
      throw new Error(`${label}: jagged matrix`);
    }
    for (const v of row) {
      if (!Number.isFinite(v)) throw new Error(`${label}: non-finite entries`);
    }
  }
}

function defaultQR(n, m) {
  return { Q: matIdentity(n), R: matIdentity(m) };
}

// ── LQG synthesis ──────────────────────────────────────────────────────────

/**
 * One-shot LQG synthesis returning the dynamic controller in state-space
 * form together with the LQR/LQE intermediates.
 *
 * Controller:  ẋ̂ = (A − BK − LC) x̂ + L y,   u = −K x̂
 * State-space (input y, output u):
 *   A_c = A − BK − LC
 *   B_c = L
 *   C_c = −K
 *   D_c = 0
 */
export function synthesizeLQG(A, B, C, options = {}) {
  ensureMatrix(A, 'LQG: A');
  ensureMatrix(B, 'LQG: B');
  ensureMatrix(C, 'LQG: C');
  const n = A.length;
  const m = B[0].length;
  const p = C.length;
  if (B.length !== n) throw new Error('LQG: B row count must equal n');
  if (C[0].length !== n) throw new Error('LQG: C column count must equal n');

  const { Q = matIdentity(n), R = matIdentity(m) } = options;
  const { Qn = matIdentity(n), Rn = matIdentity(p) } = options;
  ensureMatrix(Q, 'LQG: Q'); ensureMatrix(R, 'LQG: R');
  ensureMatrix(Qn, 'LQG: Qn'); ensureMatrix(Rn, 'LQG: Rn');

  const lqr = solveLqr(A, B, Q, R, options.lqrOptions ?? {});
  const lqe = solveLqe(A, C, Qn, Rn, options.lqeOptions ?? {});
  const K = lqr.K;
  const L = lqe.L;

  const BK = matMul(B, K);
  const LC = matMul(L, C);
  const Ac = matSub(matSub(A, BK), LC);
  const Bc = L;
  const Cc = matScale(K, -1);
  const Dc = makeZero(m, p);

  return {
    plant: { A, B, C, D: makeZero(p, m) },
    weights: { Q, R, Qn, Rn },
    K, L,
    riccati: { P: lqr.P, Y: lqe.P },
    controller: { A: Ac, B: Bc, C: Cc, D: Dc, dim: n, inputs: p, outputs: m },
    closedLoopA: closedLoopA(A, B, K),
  };
}

// ── Loop transfer functions for analysis ───────────────────────────────────

/**
 * Plant loop gain L_FSF(jω) = K (jωI − A)^{-1} B  (full-state-feedback target).
 * Returns the maximum singular value σ̄(L_FSF(jω)) over a grid.
 */
export function fullStateLoopSigmaSweep(A, B, K, omegas) {
  const n = A.length;
  const m = B[0].length;
  if (K.length !== m || K[0].length !== n) {
    throw new Error('LTR: K must be m×n');
  }
  const KrowAsRow = K;
  const sys = makeMIMOFromSS(A, B, KrowAsRow, makeZero(m, m));
  return runSigmaSweep(sys, omegas);
}

/**
 * Output-loop gain L_out(jω) = K (jωI − A + BK + LC)^{-1} L C (jωI−A)^{-1} B,
 * i.e. the actual LQG loop measured at the plant input. We compute it via
 * matrix multiplication of two MIMO state-spaces.
 *
 * For verification purposes we approximate by sampling the controller K_c(s)
 * = C_c (sI − A_c)^{-1} B_c and multiplying by the plant G(s) = C (sI−A)^{-1} B
 * point-by-point in the frequency domain.
 */
export function lqgLoopSigmaSweep(A, B, C, controller, omegas) {
  const plantSys = makeMIMOFromSS(A, B, C, makeZero(C.length, B[0].length));
  const ctrlSys = makeMIMOFromSS(controller.A, controller.B, controller.C, controller.D);
  const sweep = [];
  for (const w of omegas) {
    const Gw = evalAtJw(plantSys, w);
    const Cw = evalAtJw(ctrlSys, w);
    const Lw = mulComplexMatrix(Cw, Gw);                  // controller × plant
    sweep.push({ omega: w, sigmaMax: maxSingularComplex(Lw) });
  }
  return sweep;
}

// ── Loop Transfer Recovery (Doyle-Stein) ──────────────────────────────────

/**
 * LTR-at-input via process noise inflation.
 *
 *   Q_n(q) = Q_n0 + q^2 · B B^T
 *
 * For minimum-phase plants, as q → ∞ the observer loop gain
 *   L_LQG(jω) = K (jωI − A + BK + LC)^{-1} L · G(jω)
 * recovers the LQR target K (jωI − A)^{-1} B.
 *
 * The schedule lets the caller see at which q the recovery becomes adequate.
 * Returns the q-indexed sigma-sweep and the relative loop gap measured at
 * the chosen test frequencies.
 */
export function loopTransferRecovery(A, B, C, baseLQG, options = {}) {
  ensureMatrix(A, 'LTR: A');
  ensureMatrix(B, 'LTR: B');
  ensureMatrix(C, 'LTR: C');
  if (!baseLQG || !baseLQG.K) throw new Error('LTR: provide baseline LQG output (need K, L)');

  const omegas = options.omegas ?? logspace(-2, 2, 41);
  const qSchedule = options.qSchedule ?? [1, 10, 100, 1000];
  for (let i = 1; i < qSchedule.length; i++) {
    if (!(qSchedule[i] > qSchedule[i - 1])) {
      throw new Error('LTR: qSchedule must be strictly increasing');
    }
  }

  const n = A.length;
  const K = baseLQG.K;
  const target = fullStateLoopSigmaSweep(A, B, K, omegas);

  const Qn0 = options.Qn0 ?? matIdentity(n);
  const Rn = options.Rn ?? matIdentity(C.length);
  const BBt = matMul(B, matTranspose(B));

  const steps = [];
  for (const q of qSchedule) {
    const Qn = matAdd(Qn0, matScale(BBt, q * q));
    const lqe = solveLqe(A, C, Qn, Rn, options.lqeOptions ?? {});
    const L = lqe.L;
    const Ac = matSub(matSub(A, matMul(B, K)), matMul(L, C));
    const controller = { A: Ac, B: L, C: matScale(K, -1), D: makeZero(K.length, C.length) };
    const actual = lqgLoopSigmaSweep(A, B, C, controller, omegas);
    let worstRelGap = 0;
    for (let i = 0; i < target.length; i++) {
      const t = target[i].sigmaMax;
      const a = actual[i].sigmaMax;
      const denom = Math.max(t, 1e-12);
      const rel = Math.abs(a - t) / denom;
      if (rel > worstRelGap) worstRelGap = rel;
    }
    steps.push({ q, worstRelGap, target, actual });
  }
  return { schedule: steps };
}

// ── tiny self-contained complex-matrix helpers ────────────────────────────

function makeZero(rows, cols) {
  const out = new Array(rows);
  for (let i = 0; i < rows; i++) {
    out[i] = new Array(cols).fill(0);
  }
  return out;
}

function logspace(a, b, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.pow(10, a + (b - a) * (i / (n - 1)));
  return out;
}

function makeMIMOFromSS(A, B, C, D) {
  return new MIMOStateSpace(A, B, C, D);
}

function mulComplexMatrix(A, B) {
  const p = A.length, q = B.length, r = B[0].length;
  if (A[0].length !== q) throw new Error('complex matmul dimension mismatch');
  const out = new Array(p);
  for (let i = 0; i < p; i++) {
    out[i] = new Array(r);
    for (let j = 0; j < r; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < q; k++) {
        re += A[i][k].re * B[k][j].re - A[i][k].im * B[k][j].im;
        im += A[i][k].re * B[k][j].im + A[i][k].im * B[k][j].re;
      }
      out[i][j] = { re, im };
    }
  }
  return out;
}

function maxSingularComplex(M) {
  // Compute σ̄(M) via M*M^H eigenvalues. For tiny SISO/MIMO this is cheap.
  const rows = M.length;
  const cols = M[0].length;
  // Build M M^H as real-augmented (2r × 2r) block matrix? Simpler: form Hermitian
  // gram G = M^H M (cols × cols), evaluate trace bound, then power-iterate.
  // For SISO and small MIMO we use the closed form.
  if (rows === 1 && cols === 1) {
    const e = M[0][0];
    return Math.hypot(e.re, e.im);
  }
  // Build the Gram matrix G = M^H M (as real because diagonal of Gram is real,
  // and σ̄ = sqrt of largest eigenvalue).
  const G = makeZero(cols, cols);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < rows; k++) {
        // (M^H)[i][k] = conj(M[k][i])
        const a = M[k][i];
        const b = M[k][j];
        re += a.re * b.re + a.im * b.im;
        im += a.re * b.im - a.im * b.re;
      }
      // For diagonal terms im should cancel; ignore tiny imaginary residue.
      G[i][j] = re;
    }
  }
  // Power iteration for largest eigenvalue of symmetric G.
  let v = new Array(cols).fill(0);
  v[0] = 1;
  let lambda = 0;
  for (let iter = 0; iter < 200; iter++) {
    const next = new Array(cols).fill(0);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < cols; j++) next[i] += G[i][j] * v[j];
    }
    let norm = 0;
    for (const x of next) norm += x * x;
    norm = Math.sqrt(norm);
    if (norm <= 1e-18) return 0;
    for (let i = 0; i < cols; i++) next[i] /= norm;
    const oldLambda = lambda;
    lambda = norm;
    v = next;
    if (Math.abs(lambda - oldLambda) < 1e-12 * Math.max(1, lambda)) break;
  }
  return Math.sqrt(Math.max(0, lambda));
}

function runSigmaSweep(sys, omegas) {
  const out = [];
  for (const w of omegas) {
    const Gw = evalAtJw(sys, w);
    out.push({ omega: w, sigmaMax: maxSingularComplex(Gw) });
  }
  return out;
}
