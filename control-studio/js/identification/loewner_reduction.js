/**
 * loewner_reduction.js — Loewner-framework data-driven model reduction.
 *
 * Loop 13 (Zero-Flaw) addition.
 *
 * Setup: given frequency-response samples (left and right interpolation
 * points)
 *   λ_i ∈ ℂ, w_i ∈ ℂ^{p}   (right tangent directions / outputs)
 *   μ_j ∈ ℂ, v_j ∈ ℂ^{m}   (left tangent directions / inputs)
 *   H(λ_i) ≈ w_i,   v_j^T H(μ_j) ≈ b_j
 *
 * The Loewner matrix L_{ij} and shifted Loewner σL_{ij} encode the
 * interpolation conditions:
 *   L_{ij}   = (w_i^T r_j − l_i^T w_j) / (λ_i − μ_j)
 *   σL_{ij}  = (λ_i w_i^T r_j − l_i^T w_j μ_j) / (λ_i − μ_j)
 *
 * A reduced model of order r is obtained by truncating the SVD of L and
 * forming
 *   E_r = X_r^T L Y_r,   A_r = X_r^T σL Y_r
 *   B_r = X_r^T b,        C_r = w^T Y_r
 *
 * Reference:
 *   - Mayo, Antoulas, "A framework for the solution of the generalized
 *     realization problem", Linear Algebra Appl. 425, 2007.
 *   - Antoulas, Lefteriu, Ionita, "A tutorial introduction to the Loewner
 *     framework for model reduction", Model Reduction and Approximation
 *     (SIAM 2017).
 *
 * The implementation works in the SISO real-rational case: the user
 * supplies a list of frequency points and corresponding G(jω_k) complex
 * scalars; the reduction returns descriptor (E, A, B, C) of order r.
 */

import {
  matCreate, matMul, matTranspose, matAdd, matSub, matInverse,
} from '../math/matrix.js';

/**
 * Compute the SISO Loewner matrices L and σL from a list of complex
 * frequency-response samples.
 *
 * @param {Array<{omega:number, G:{re:number, im:number}}>} samples
 * @returns { L, sigmaL, splitOmegasLeft, splitOmegasRight, splitGLeft, splitGRight }
 */
export function buildLoewnerMatrices(samples) {
  if (!Array.isArray(samples) || samples.length < 4) {
    throw new Error('Loewner: need at least 4 samples');
  }
  // Split half-half into left/right interpolation sets.
  const N = samples.length;
  const half = Math.floor(N / 2);
  const left  = samples.slice(0, half);
  const right = samples.slice(half);
  // Use the imaginary axis as interpolation points: λ_i = jω_i.
  const sLeft  = left.map((s) => ({ re: 0, im: s.omega }));
  const sRight = right.map((s) => ({ re: 0, im: s.omega }));
  const gLeft  = left.map((s) => s.G);
  const gRight = right.map((s) => s.G);
  const L = matCreate(sLeft.length, sRight.length, 0);
  const sL = matCreate(sLeft.length, sRight.length, 0);
  for (let i = 0; i < sLeft.length; i++) {
    for (let j = 0; j < sRight.length; j++) {
      // (G(μ_i) − G(λ_j)) / (μ_i − λ_j) with complex arithmetic; we store
      // the real part of the resulting Loewner entry. For real-rational
      // transfer functions sampled symmetrically about the real axis the
      // imaginary parts cancel.
      const num = { re: gLeft[i].re - gRight[j].re, im: gLeft[i].im - gRight[j].im };
      const den = { re: sLeft[i].re - sRight[j].re, im: sLeft[i].im - sRight[j].im };
      const denMag = den.re * den.re + den.im * den.im;
      L[i][j] = (num.re * den.re + num.im * den.im) / denMag;

      // shifted Loewner: (μ_i G(μ_i) − λ_j G(λ_j)) / (μ_i − λ_j)
      const muG = { re: sLeft[i].re * gLeft[i].re - sLeft[i].im * gLeft[i].im,
                    im: sLeft[i].re * gLeft[i].im + sLeft[i].im * gLeft[i].re };
      const lamG = { re: sRight[j].re * gRight[j].re - sRight[j].im * gRight[j].im,
                     im: sRight[j].re * gRight[j].im + sRight[j].im * gRight[j].re };
      const num2 = { re: muG.re - lamG.re, im: muG.im - lamG.im };
      sL[i][j] = (num2.re * den.re + num2.im * den.im) / denMag;
    }
  }
  return {
    L, sigmaL: sL,
    sLeft, sRight, gLeft, gRight,
  };
}

/**
 * Build a reduced descriptor model (E_r, A_r, B_r, C_r) from a list of
 * frequency-response samples using the Loewner framework.
 *
 * @param {Array<{omega:number, G:{re:number, im:number}}>} samples
 * @param {number} order - desired reduced order r
 * @returns { E, A, B, C, singularValues }
 */
export function loewnerReduction(samples, order) {
  if (!Number.isInteger(order) || order < 1) {
    throw new Error('Loewner: reduction order must be ≥ 1 integer');
  }
  const { L, sigmaL, gLeft, gRight } = buildLoewnerMatrices(samples);
  // SVD via M^T M eigenvalues for the small dimensions we handle.
  const Lt = matTranspose(L);
  const LtL = matMul(Lt, L);
  const { eigenvalues, eigenvectors } = symmetricEigen(LtL);
  // Order singular values descending.
  const idxSorted = eigenvalues
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .map((e) => e.i);
  if (order > idxSorted.length) {
    throw new Error(`Loewner: order ${order} exceeds available singular dim ${idxSorted.length}`);
  }
  const Y = matCreate(L[0].length, order, 0);
  for (let r = 0; r < order; r++) {
    const vec = eigenvectors[idxSorted[r]];
    for (let i = 0; i < L[0].length; i++) Y[i][r] = vec[i];
  }
  // Build X from L Y orthogonalised
  const LY = matMul(L, Y);
  const X = orthogonalise(LY);

  const Xt = matTranspose(X);
  const Yt = matTranspose(Y);
  const E = matMul(Xt, matMul(L, Y));
  const Asys = matMul(Xt, matMul(sigmaL, Y));
  const bVec = gLeft.map((g) => g.re);
  const cVec = gRight.map((g) => g.re);
  const B = matMul(Xt, columnFromArray(bVec));
  const C = matMul(rowFromArray(cVec), Y);
  const singularValues = idxSorted.slice(0, Math.min(order, idxSorted.length))
    .map((i) => Math.sqrt(Math.max(0, eigenvalues[i])));
  return { E, A: Asys, B, C, singularValues };
}

// ── helpers ────────────────────────────────────────────────────────────────

function columnFromArray(arr) {
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = [arr[i]];
  return out;
}

function rowFromArray(arr) {
  return [arr.slice()];
}

function orthogonalise(M) {
  // Gram-Schmidt on columns.
  const rows = M.length;
  const cols = M[0].length;
  const Q = matCreate(rows, cols, 0);
  for (let j = 0; j < cols; j++) {
    let v = M.map((row) => row[j]);
    for (let k = 0; k < j; k++) {
      const qk = Q.map((row) => row[k]);
      let proj = 0;
      for (let i = 0; i < rows; i++) proj += qk[i] * v[i];
      for (let i = 0; i < rows; i++) v[i] -= proj * qk[i];
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm);
    if (norm < 1e-14) continue;
    for (let i = 0; i < rows; i++) Q[i][j] = v[i] / norm;
  }
  return Q;
}

function symmetricEigen(A) {
  const n = A.length;
  let V = new Array(n);
  for (let i = 0; i < n; i++) { V[i] = new Array(n).fill(0); V[i][i] = 1; }
  let M = A.map((row) => row.slice());
  for (let sweep = 0; sweep < 200; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += Math.abs(M[p][q]);
    if (off < 1e-12) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = M[p][q];
        if (Math.abs(apq) < 1e-14) continue;
        const theta = (M[q][q] - M[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        for (let i = 0; i < n; i++) {
          const mip = M[i][p], miq = M[i][q];
          M[i][p] = c * mip - s * miq;
          M[i][q] = s * mip + c * miq;
        }
        for (let j = 0; j < n; j++) {
          const mpj = M[p][j], mqj = M[q][j];
          M[p][j] = c * mpj - s * mqj;
          M[q][j] = s * mpj + c * mqj;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  const eigenvalues = new Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = M[i][i];
  const eigenvectors = new Array(n);
  for (let i = 0; i < n; i++) {
    eigenvectors[i] = new Array(n);
    for (let j = 0; j < n; j++) eigenvectors[i][j] = V[j][i];
  }
  return { eigenvalues, eigenvectors };
}
