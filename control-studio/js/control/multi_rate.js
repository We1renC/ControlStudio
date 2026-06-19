/**
 * multi_rate.js — Multi-rate / lifted system baseline.
 *
 * Loop 3 (Zero-Flaw) addition. Dual-rate ZOH lifting is the standard
 * sampled-data framework of Chen & Francis ("Optimal Sampled-Data Control",
 * Springer 1995). ControlStudio previously only embedded a Toeplitz lifted
 * form inside ILC; this module exposes the lifting as a first-class API for
 * any literature using multi-rate frameworks.
 *
 * Given a continuous LTI plant ẋ = A x + B u, y = C x + D u sampled at the
 * fast period h with output downsampled by integer N (slow period T = N h),
 * the lifted slow-system is:
 *
 *   x[k+1] = A_T x[k] + Σ_{i=0..N-1} A^{N-1-i} B u[k h + i h]
 *   ỹ[k]  = [ y[k h]; y[k h + h]; …; y[k h + (N-1) h] ]
 *
 * with A_T = exp(A T) and discrete fast matrices (A_h, B_h) = ZOH(A, B, h).
 *
 * The lifted representation produces a finite-dimensional discrete-time
 * system with stacked input vector u_lift ∈ R^{N m} per slow period and
 * stacked output ỹ ∈ R^{N p}. Stability and L2-induced norm can then be
 * analysed on the slow system using standard discrete tools.
 */

import {
  matAdd, matMul, matExp, matIdentity, matCreate, matScale,
} from '../math/matrix.js';

function ensureSquare(M, label) {
  if (!Array.isArray(M) || M.length === 0) throw new Error(`${label}: empty matrix`);
  const n = M.length;
  for (const row of M) if (!Array.isArray(row) || row.length !== n) {
    throw new Error(`${label}: not square`);
  }
}

/**
 * Discretise (A, B) with zero-order hold over period h.
 * Returns (A_h, B_h) using exact matrix exponential (block expm trick).
 */
export function zohDiscretize(A, B, h) {
  ensureSquare(A, 'ZOH: A');
  if (!Array.isArray(B) || B.length !== A.length) throw new Error('ZOH: B must have n rows');
  if (!(h > 0)) throw new Error('ZOH: h must be > 0');
  const n = A.length;
  const m = B[0].length;
  // Build [[A B];[0 0]] of size (n+m)
  const M = matCreate(n + m, n + m, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = A[i][j];
    for (let j = 0; j < m; j++) M[i][n + j] = B[i][j];
  }
  const E = matExp(matScale(M, h));
  const Ah = matCreate(n, n, 0);
  const Bh = matCreate(n, m, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) Ah[i][j] = E[i][j];
    for (let j = 0; j < m; j++) Bh[i][j] = E[i][n + j];
  }
  return { Ah, Bh };
}

/**
 * Build the lifted (slow-period) discrete model of a continuous plant
 * sampled at fast h with downsample factor N (slow T = N h).
 *
 * The lifted state-space (A_T, B_lift, C_lift, D_lift) has the same state
 * dimension as the continuous plant; input is the stacked vector of fast-rate
 * inputs over one slow period, output is the stacked fast-rate measurement.
 */
export function liftedDualRate(A, B, C, D, h, N) {
  ensureSquare(A, 'lift: A');
  if (!Number.isInteger(N) || N < 1) throw new Error('lift: N must be positive integer');
  if (!(h > 0)) throw new Error('lift: h must be > 0');
  const n = A.length;
  const m = B[0].length;
  const p = C.length;
  const { Ah, Bh } = zohDiscretize(A, B, h);

  // A_T = A_h^N
  let AT = matIdentity(n);
  for (let i = 0; i < N; i++) AT = matMul(Ah, AT);

  // B_lift columns 0..N-1: A_h^{N-1-i} B_h
  const BlIFT = matCreate(n, N * m, 0);
  let power = matIdentity(n);
  // Precompute powers A_h^0, A_h^1, …, A_h^{N-1}
  const powers = [matIdentity(n)];
  for (let i = 1; i < N; i++) powers.push(matMul(Ah, powers[i - 1]));
  for (let i = 0; i < N; i++) {
    const Pi = powers[N - 1 - i];
    const block = matMul(Pi, Bh);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < m; c++) BlIFT[r][i * m + c] = block[r][c];
    }
  }

  // C_lift: block-diag of C measuring x[k h + i h] = A_h^i x[k] + ...
  // Output ỹ_i = C (A_h^i x[k] + Σ_{j=0..i-1} A_h^{i-1-j} B_h u_{k,j}) + D u_{k,i}
  const CLIFT = matCreate(N * p, n, 0);
  const DLIFT = matCreate(N * p, N * m, 0);
  for (let i = 0; i < N; i++) {
    const CAi = matMul(C, powers[i]);
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < n; c++) CLIFT[i * p + r][c] = CAi[r][c];
    }
    // D blocks
    for (let j = 0; j < N; j++) {
      if (j < i) {
        const CAB = matMul(matMul(C, powers[i - 1 - j]), Bh);
        for (let r = 0; r < p; r++) {
          for (let c = 0; c < m; c++) DLIFT[i * p + r][j * m + c] = CAB[r][c];
        }
      } else if (j === i) {
        for (let r = 0; r < p; r++) {
          for (let c = 0; c < m; c++) DLIFT[i * p + r][j * m + c] = D[r][c];
        }
      }
    }
  }

  return {
    A: AT,
    B: BlIFT,
    C: CLIFT,
    D: DLIFT,
    fastPeriod: h,
    slowPeriod: h * N,
    fastInputs: m,
    fastOutputs: p,
    blocksPerSlow: N,
  };
}
