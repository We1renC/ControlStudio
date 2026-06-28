/**
 * mjls.js — Markov Jump Linear Systems (MJLS) coupled DARE / LQR.
 *
 * Loop 12 (Zero-Flaw) addition.
 *
 * MJLS: x_{k+1} = A_{σ_k} x_k + B_{σ_k} u_k
 *        σ_k ∈ {1, ..., M} discrete-time Markov chain with transition
 *        probability matrix Π = [π_{ij}].
 *
 * Coupled DARE (Costa-Fragoso-Marques 2005):
 *   P_i = A_i^T E_i(P) A_i + Q_i − A_i^T E_i(P) B_i (R_i + B_i^T E_i(P) B_i)^{-1} B_i^T E_i(P) A_i
 *   E_i(P) = Σ_j π_{ij} P_j
 *
 * Optimal mode-dependent gain:
 *   K_i = (R_i + B_i^T E_i(P) B_i)^{-1} B_i^T E_i(P) A_i
 *
 * The implementation iterates the coupled DARE until contraction.
 *
 * Reference:
 *   - Costa, Fragoso, Marques, "Discrete-Time Markov Jump Linear Systems",
 *     Springer 2005.
 *   - Mariton, "Jump Linear Systems in Automatic Control", Marcel Dekker
 *     1990.
 *   - Boukas, "Stochastic Switching Systems: Analysis and Design",
 *     Birkhäuser 2006.
 */

import {
  matCreate, matAdd, matMul, matSub, matInverse, matTranspose, matIdentity,
} from '../math/matrix.js';

function validateMJLS(As, Bs, Pi) {
  const M = As.length;
  if (Bs.length !== M) throw new Error('MJLS: A and B mode lists must have same length');
  if (!Array.isArray(Pi) || Pi.length !== M) throw new Error('MJLS: Π must be M×M');
  for (let i = 0; i < M; i++) {
    if (Pi[i].length !== M) throw new Error('MJLS: each Π row must have length M');
    const sum = Pi[i].reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > 1e-9) {
      throw new Error(`MJLS: Π row ${i} must sum to 1 (got ${sum})`);
    }
    for (const v of Pi[i]) if (v < -1e-12) throw new Error('MJLS: Π entries must be ≥ 0');
  }
  return M;
}

/**
 * Solve the coupled DARE for an MJLS and return the mode-dependent LQR
 * gains K_i and stationary value matrices P_i.
 *
 * @param {Array<number[][]>} As - mode-indexed A matrices
 * @param {Array<number[][]>} Bs - mode-indexed B matrices
 * @param {number[][]} Pi - Markov transition matrix
 * @param {Array<number[][]>} Qs - mode-indexed state weight (default I)
 * @param {Array<number[][]>} Rs - mode-indexed input weight (default I)
 */
export function solveMJLS_LQR(As, Bs, Pi, Qs = null, Rs = null, options = {}) {
  const M = validateMJLS(As, Bs, Pi);
  const n = As[0].length;
  const m = Bs[0][0].length;
  Qs = Qs ?? As.map(() => matIdentity(n));
  Rs = Rs ?? As.map(() => matIdentity(m));
  const maxIter = options.maxIter ?? 1000;
  const tol = options.tol ?? 1e-9;

  let P = As.map(() => matIdentity(n));
  let converged = false;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const Pnew = new Array(M);
    for (let i = 0; i < M; i++) {
      let Ei = matCreate(n, n, 0);
      for (let j = 0; j < M; j++) {
        const scaled = scaleMatrix(P[j], Pi[i][j]);
        Ei = matAdd(Ei, scaled);
      }
      const BtEi = matMul(matTranspose(Bs[i]), Ei);
      const RplusBtEiB = matAdd(Rs[i], matMul(BtEi, Bs[i]));
      const Inv = matInverse(RplusBtEiB);
      const AtEi = matMul(matTranspose(As[i]), Ei);
      const term = matMul(matMul(AtEi, Bs[i]), matMul(Inv, matMul(matTranspose(Bs[i]), matMul(Ei, As[i]))));
      Pnew[i] = matAdd(matSub(matMul(AtEi, As[i]), term), Qs[i]);
    }
    let diff = 0;
    for (let i = 0; i < M; i++) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          diff = Math.max(diff, Math.abs(Pnew[i][r][c] - P[i][r][c]));
        }
      }
    }
    P = Pnew;
    if (diff < tol) { converged = true; break; }
  }
  // Recover gains
  const Ks = new Array(M);
  for (let i = 0; i < M; i++) {
    let Ei = matCreate(n, n, 0);
    for (let j = 0; j < M; j++) Ei = matAdd(Ei, scaleMatrix(P[j], Pi[i][j]));
    const BtEi = matMul(matTranspose(Bs[i]), Ei);
    const RplusBtEiB = matAdd(Rs[i], matMul(BtEi, Bs[i]));
    const Inv = matInverse(RplusBtEiB);
    Ks[i] = matMul(Inv, matMul(BtEi, As[i]));
  }
  return { Ks, P, iterations: iter, converged };
}

/**
 * Simulate an MJLS under mode-dependent LQR feedback for verification of
 * stability in mean-square sense.
 */
export function simulateMJLS(As, Bs, Pi, Ks, x0, options = {}) {
  const M = As.length;
  const steps = options.steps ?? 100;
  const seed = options.seed ?? 1;
  let rng = seed;
  function nextRng() { rng = (1664525 * rng + 1013904223) >>> 0; return rng / 0x100000000; }
  let mode = options.mode0 ?? 0;
  let x = x0.slice();
  const xs = new Array(steps + 1);
  const modes = new Array(steps + 1);
  xs[0] = x.slice();
  modes[0] = mode;
  for (let k = 0; k < steps; k++) {
    // Apply mode-dependent control
    const Ki = Ks[mode];
    const u = new Array(Ki.length).fill(0);
    for (let r = 0; r < Ki.length; r++)
      for (let c = 0; c < x.length; c++)
        u[r] -= Ki[r][c] * x[c];
    const A = As[mode], B = Bs[mode];
    const xn = new Array(x.length).fill(0);
    for (let r = 0; r < x.length; r++) {
      for (let c = 0; c < x.length; c++) xn[r] += A[r][c] * x[c];
      for (let c = 0; c < u.length; c++) xn[r] += B[r][c] * u[c];
    }
    x = xn;
    // Sample next mode from Π
    const draw = nextRng();
    let cdf = 0;
    let nextMode = mode;
    for (let j = 0; j < M; j++) {
      cdf += Pi[mode][j];
      if (draw <= cdf) { nextMode = j; break; }
    }
    mode = nextMode;
    xs[k + 1] = x.slice();
    modes[k + 1] = mode;
  }
  return { xs, modes };
}

function scaleMatrix(M, s) { return M.map((row) => row.map((v) => v * s)); }
