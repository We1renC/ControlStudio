// sysid.js — Discrete-time system identification from input-output data.
//
// Currently implements ARX (AutoRegressive with eXogenous input) via least-squares:
//   y[k] = -a_1 y[k-1] - a_2 y[k-2] - ... + b_1 u[k-nk] + b_2 u[k-nk-1] + ...
// where (na, nb, nk) specify denominator order, numerator order, and input delay.
//
// References:
//   - Ljung, "System Identification: Theory for the User" (2nd ed.) §7
//   - MATLAB System Identification Toolbox arx() reference

import { DiscreteTransferFunction } from './discrete-transfer-function.js';

/**
 * Build the ARX regression matrix Φ and target vector y.
 * Returns { Phi, y, validRange } where validRange describes which samples were used.
 */
function buildARXRegressors(u, y, na, nb, nk) {
  if (!Array.isArray(u) || !Array.isArray(y) || u.length !== y.length) {
    throw new Error('ARX: u and y must be arrays of equal length');
  }
  const N = u.length;
  const startIdx = Math.max(na, nb + nk - 1);
  if (startIdx >= N) throw new Error('ARX: not enough samples for the chosen (na, nb, nk) order');

  const rows = N - startIdx;
  const cols = na + nb;
  const Phi = [];
  const yvec = [];
  for (let k = startIdx; k < N; k++) {
    const row = new Array(cols);
    // -y[k-1], ..., -y[k-na]
    for (let i = 1; i <= na; i++) row[i - 1] = -y[k - i];
    // u[k-nk], ..., u[k-nk-nb+1]
    for (let j = 0; j < nb; j++) row[na + j] = u[k - nk - j];
    Phi.push(row);
    yvec.push(y[k]);
  }
  return { Phi, y: yvec, validRange: [startIdx, N - 1] };
}

/**
 * Solve the normal equations (Φᵀ Φ) θ = Φᵀ y by Gaussian elimination with partial pivoting.
 */
function normalEquations(Phi, y) {
  const n = Phi[0].length;
  const m = Phi.length;
  // Form ΦᵀΦ (n×n) and Φᵀy (n)
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    const row = Phi[i];
    for (let p = 0; p < n; p++) {
      b[p] += row[p] * y[i];
      for (let q = p; q < n; q++) A[p][q] += row[p] * row[q];
    }
  }
  for (let p = 0; p < n; p++) for (let q = 0; q < p; q++) A[p][q] = A[q][p];

  // Solve via Gaussian elimination
  const aug = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(aug[i][k]) > Math.abs(aug[pivot][k])) pivot = i;
    if (Math.abs(aug[pivot][k]) < 1e-14) throw new Error('ARX: regression matrix is rank-deficient — try smaller order');
    if (pivot !== k) { const t = aug[k]; aug[k] = aug[pivot]; aug[pivot] = t; }
    const akk = aug[k][k];
    for (let j = k; j <= n; j++) aug[k][j] /= akk;
    for (let i = 0; i < n; i++) if (i !== k) {
      const f = aug[i][k];
      for (let j = k; j <= n; j++) aug[i][j] -= f * aug[k][j];
    }
  }
  return aug.map((r) => r[n]);
}

/**
 * Fit an ARX model.
 *
 * @param {number[]} u - input signal
 * @param {number[]} y - output signal
 * @param {number} na - denominator order (AR part)
 * @param {number} nb - numerator order (X part)
 * @param {number} nk - input delay in samples (default 1)
 * @param {number} Ts - sample time (default 1)
 * @returns {{
 *   a: number[],     // [1, a_1, ..., a_na] (high-order first)
 *   b: number[],     // [0,..0, b_1, ..., b_nb] (with leading zeros for nk)
 *   tf: DiscreteTransferFunction,
 *   yhat: number[],  // predicted output (one-step-ahead)
 *   residual: number[],
 *   fitPercent: number,
 *   mse: number,
 *   aic: number,
 * }}
 */
export function identifyARX(u, y, na, nb, nk = 1, Ts = 1) {
  if (!Number.isInteger(na) || na < 0) throw new Error('na must be a non-negative integer');
  if (!Number.isInteger(nb) || nb < 1) throw new Error('nb must be a positive integer');
  if (!Number.isInteger(nk) || nk < 0) throw new Error('nk must be a non-negative integer');

  const { Phi, y: yvec, validRange } = buildARXRegressors(u, y, na, nb, nk);
  const theta = normalEquations(Phi, yvec);

  const aTail = theta.slice(0, na);                  // [a_1, ..., a_na]
  const bTail = theta.slice(na);                     // [b_1, ..., b_nb]
  const a = [1, ...aTail];                           // A(z) leading coefficient = 1
  // For DiscreteTransferFunction we use z^-1 convention: B(z⁻¹) = b_1 z^-nk + b_2 z^-(nk+1) + ...
  // Prepend nk zeros to numerator
  const b = [...new Array(nk).fill(0), ...bTail];

  // One-step-ahead prediction
  const yhat = new Array(y.length).fill(NaN);
  for (let k = validRange[0]; k <= validRange[1]; k++) {
    let s = 0;
    for (let i = 1; i <= na; i++) s += -aTail[i - 1] * y[k - i];
    for (let j = 0; j < nb; j++) s += bTail[j] * u[k - nk - j];
    yhat[k] = s;
  }
  const residual = y.map((yk, k) => Number.isFinite(yhat[k]) ? yk - yhat[k] : 0);
  const N = validRange[1] - validRange[0] + 1;
  const sse = residual.slice(validRange[0], validRange[1] + 1).reduce((s, r) => s + r * r, 0);
  const yMean = y.slice(validRange[0], validRange[1] + 1).reduce((s, yi) => s + yi, 0) / N;
  const sst = y.slice(validRange[0], validRange[1] + 1).reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const fitPercent = sst > 1e-12 ? 100 * (1 - Math.sqrt(sse / sst)) : NaN;
  const mse = sse / N;
  const k_params = na + nb;
  const aic = N * Math.log(mse + 1e-300) + 2 * k_params;

  return {
    a, b,
    tf: new DiscreteTransferFunction(b, a, Ts),
    yhat, residual,
    fitPercent, mse, aic,
    order: { na, nb, nk },
  };
}

/**
 * Solve the normal equations with Tikhonov (ridge) regularization:
 * (ΦᵀΦ + λI) θ = Φᵀy
 * Used inside ARMAX where some columns may be near-zero (e.g. residuals ≈ 0).
 */
function normalEquationsRidge(Phi, y, lambda = 1e-8) {
  const n = Phi[0].length;
  const m = Phi.length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    const row = Phi[i];
    for (let p = 0; p < n; p++) {
      b[p] += row[p] * y[i];
      for (let q = p; q < n; q++) A[p][q] += row[p] * row[q];
    }
  }
  for (let p = 0; p < n; p++) {
    for (let q = 0; q < p; q++) A[p][q] = A[q][p];
    A[p][p] += lambda; // ridge
  }
  const aug = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(aug[i][k]) > Math.abs(aug[pivot][k])) pivot = i;
    if (pivot !== k) { const t = aug[k]; aug[k] = aug[pivot]; aug[pivot] = t; }
    const akk = aug[k][k];
    if (Math.abs(akk) < 1e-300) continue; // still singular after ridge — skip
    for (let j = k; j <= n; j++) aug[k][j] /= akk;
    for (let i = 0; i < n; i++) if (i !== k) {
      const f = aug[i][k];
      for (let j = k; j <= n; j++) aug[i][j] -= f * aug[k][j];
    }
  }
  return aug.map((r) => r[n]);
}

/**
 * ARMAX model identification via iterative pseudo-linear regression.
 * A(q)y = B(q)u + C(q)e, where C(q) = 1 + c₁z⁻¹ + ... + cₙcz⁻ⁿc
 *
 * @param {number[]} u - input sequence
 * @param {number[]} y - output sequence
 * @param {number} na - A polynomial order
 * @param {number} nb - B polynomial order
 * @param {number} nc - C polynomial order (noise MA order)
 * @param {number} nk - input delay (≥1)
 * @param {number} Ts - sample time
 * @param {{ maxIter?: number, tol?: number }} [options]
 * @returns {{ a, b, c, tf, yhat, residual, fitPercent, mse, aic, iterations }}
 *   a[i]: coefficients of A (i=1..na), b[j]: coefficients of B (j=0..nb-1), c[k]: C coefficients
 *   tf: estimated discrete TransferFunction B(z⁻¹)/A(z⁻¹) (noise model separate)
 */
export function identifyARMAX(u, y, na, nb, nc, nk = 1, Ts = 1, options = {}) {
  if (!Number.isInteger(na) || na < 0) throw new Error('ARMAX: na must be a non-negative integer');
  if (!Number.isInteger(nb) || nb < 1) throw new Error('ARMAX: nb must be a positive integer');
  if (!Number.isInteger(nc) || nc < 0) throw new Error('ARMAX: nc must be a non-negative integer');
  if (!Number.isInteger(nk) || nk < 0) throw new Error('ARMAX: nk must be a non-negative integer');

  // nc=0 degenerates to ARX
  if (nc === 0) {
    const arxResult = identifyARX(u, y, na, nb, nk, Ts);
    return { ...arxResult, c: [], iterations: 1 };
  }

  const maxIter = options.maxIter ?? 20;
  const tol = options.tol ?? 1e-6;
  const N = y.length;
  const maxLag = Math.max(na, nb + nk - 1, nc);

  if (N < maxLag + 10) throw new Error('ARMAX: not enough data points for given orders');

  // Initialize with ARX estimate (C=1)
  const arxInit = identifyARX(u, y, na, nb, nk, Ts);
  // a/b from ARX are in [1, a1, ..., ana] and [0..0, b1, ...] form
  // We need the raw coefficient arrays for the iterative loop
  let aTail = arxInit.a.slice(1);   // [a1, ..., ana]
  let bTail = arxInit.b.slice(nk);  // [b1, ..., bnb]
  let c = new Array(nc).fill(0);    // start with C=1 (zero MA coefficients)

  let prevParams = [...aTail, ...bTail, ...c];
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Compute residuals from current model
    const yhat = _computeARMAXOutput(u, y, aTail, bTail, c, na, nb, nc, nk, N);
    const e = y.map((yi, k) => yi - yhat[k]);

    // Build extended regressor: [past y, past u, past e]
    const Phi = [];
    const yVec = [];

    for (let k = maxLag; k < N; k++) {
      const row = [];
      for (let i = 1; i <= na; i++) row.push(-(y[k - i] ?? 0));
      for (let j = 0; j < nb; j++) row.push(u[k - nk - j] ?? 0);
      for (let l = 1; l <= nc; l++) row.push(e[k - l] ?? 0);
      Phi.push(row);
      yVec.push(y[k]);
    }

    // Solve normal equations with small Tikhonov ridge regularization
    // to handle near-singular columns (e.g. residuals ≈ 0 on first iterations).
    const result = normalEquationsRidge(Phi, yVec, 1e-8);
    aTail = result.slice(0, na);
    bTail = result.slice(na, na + nb);
    c = result.slice(na + nb);

    const newParams = [...aTail, ...bTail, ...c];
    const diff = Math.max(...newParams.map((p, i) => Math.abs(p - prevParams[i])));
    prevParams = newParams;
    iterations = iter + 1;
    if (diff < tol) break;
  }

  // Final output and metrics.
  // Use the same valid range as the regression (k = maxLag … N−1) for SSE,
  // MSE, and AIC so that cross-model AIC comparisons (ARX vs ARMAX vs OE vs BJ)
  // are computed on the same effective sample count N_v = N − maxLag.
  const yhat = _computeARMAXOutput(u, y, aTail, bTail, c, na, nb, nc, nk, N);
  const residuals = y.map((yi, k) => yi - yhat[k]);
  const N_v = N - maxLag; // valid (non-transient) sample count
  const validResid = residuals.slice(maxLag);
  const sse = validResid.reduce((s, ei) => s + ei * ei, 0);
  const mse = sse / N_v;
  const yMean = y.slice(maxLag).reduce((s, v) => s + v, 0) / N_v;
  const ssTot = y.slice(maxLag).reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const fitPercent = ssTot > 1e-12
    ? Math.max(0, (1 - Math.sqrt(sse / ssTot)) * 100)
    : NaN;
  const nParams = na + nb + nc;
  const aic = N_v * Math.log(mse + 1e-300) + 2 * nParams;

  // Build discrete TF: B(z⁻¹)/A(z⁻¹) (noise model C is separate)
  const aFull = [1, ...aTail];                        // [1, a1, ..., ana]
  const bFull = [...new Array(nk).fill(0), ...bTail]; // with leading delay zeros

  return {
    a: aTail, b: bTail, c,
    tf: new DiscreteTransferFunction(bFull, aFull, Ts),
    yhat, residual: residuals,
    fitPercent, mse, aic, iterations,
    order: { na, nb, nc, nk },
  };
}

function _computeARMAXOutput(u, y, aTail, bTail, c, na, nb, nc, nk, N) {
  const yhat = new Array(N).fill(0);
  const e = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let yk = 0;
    for (let i = 1; i <= na; i++) yk -= (aTail[i - 1] ?? 0) * (y[k - i] ?? 0);
    for (let j = 0; j < nb; j++) yk += (bTail[j] ?? 0) * (u[k - nk - j] ?? 0);
    for (let l = 1; l <= nc; l++) yk += (c[l - 1] ?? 0) * (e[k - l] ?? 0);
    yhat[k] = yk;
    e[k] = y[k] - yk;
  }
  return yhat;
}

/**
 * Identify Output Error (OE) model using Steiglitz-McBride iteration.
 * Model: y[k] = (B(z^-1) / F(z^-1)) u[k] + e[k]
 * 
 * @param {number[]} u - input sequence
 * @param {number[]} y - output sequence
 * @param {number} nb - numerator order (B)
 * @param {number} nf - denominator order (F)
 * @param {number} nk - input delay
 * @param {number} Ts - sample time
 * @param {object} options - { maxIter, tol }
 */
export function identifyOE(u, y, nb, nf, nk = 1, Ts = 1, options = {}) {
  if (nf === 0) {
    // If nf = 0, this is just an FIR filter: y = B u + e, which ARX can solve natively (na=0).
    const arx = identifyARX(u, y, 0, nb, nk, Ts);
    return { b: arx.b, f: [], tf: arx.tf, yhat: arx.yhat, residual: arx.residual, fitPercent: arx.fitPercent, mse: arx.mse, aic: arx.aic, iterations: 1, order: { nb, nf, nk } };
  }

  const maxIter = options.maxIter ?? 20;
  const tol = options.tol ?? 1e-6;
  const N = y.length;
  const maxLag = Math.max(nf, nb + nk - 1); // first valid sample index

  // Initialize F(q) using ARX(nf, nb, nk)
  const arxInit = identifyARX(u, y, nf, nb, nk, Ts);
  let fTail = arxInit.a.slice(1); // F initial guess (like A)
  let bTail = arxInit.b.slice(nk); // B initial guess
  
  let prevParams = [...fTail, ...bTail];
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Filter u and y by 1/F(q)
    // w[k] + f1 w[k-1] + ... = u[k]  => w[k] = u[k] - f1 w[k-1] ...
    const uf = new Array(N).fill(0);
    const yf = new Array(N).fill(0);
    for (let k = 0; k < N; k++) {
      let suf = u[k], syf = y[k];
      for (let i = 1; i <= nf; i++) {
        suf -= (fTail[i - 1] || 0) * (uf[k - i] || 0);
        syf -= (fTail[i - 1] || 0) * (yf[k - i] || 0);
      }
      uf[k] = suf;
      yf[k] = syf;
    }

    // Regress y_f on past y_f and past u_f
    // y_f[k] + f1 y_f[k-1] + ... = b1 u_f[k-nk] + ...
    // => y_f[k] = -f1 y_f[k-1] ... + b1 u_f[k-nk] ...
    const Phi = [];
    const yVec = [];
    for (let k = maxLag; k < N; k++) {
      const row = [];
      for (let i = 1; i <= nf; i++) row.push(-yf[k - i]);
      for (let j = 0; j < nb; j++) row.push(uf[k - nk - j]);
      Phi.push(row);
      yVec.push(yf[k]); // note: regressing to yf[k], NOT y[k] in Steiglitz-McBride
    }

    const result = normalEquationsRidge(Phi, yVec, 1e-8);
    fTail = result.slice(0, nf);
    bTail = result.slice(nf, nf + nb);

    const newParams = [...fTail, ...bTail];
    const diff = Math.max(...newParams.map((p, i) => Math.abs(p - prevParams[i])));
    prevParams = newParams;
    iterations = iter + 1;
    if (diff < tol) break;
  }

  // Simulate final OE model to get yhat and residuals
  // yhat[k] = -f1 yhat[k-1] ... + b1 u[k-nk] ...
  const yhat = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let i = 1; i <= nf; i++) s -= (fTail[i - 1] || 0) * (yhat[k - i] || 0);
    for (let j = 0; j < nb; j++) s += (bTail[j] || 0) * (u[k - nk - j] || 0);
    yhat[k] = s;
  }

  const residuals = y.map((yi, k) => yi - yhat[k]);
  // Use valid range k = maxLag … N-1 for consistent AIC cross-model comparison.
  const N_v = N - maxLag;
  const validResid = residuals.slice(maxLag);
  const sse = validResid.reduce((s, ei) => s + ei * ei, 0);
  const mse = sse / N_v;
  const yMean = y.slice(maxLag).reduce((s, v) => s + v, 0) / N_v;
  const ssTot = y.slice(maxLag).reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const fitPercent = ssTot > 1e-12
    ? Math.max(0, (1 - Math.sqrt(sse / ssTot)) * 100)
    : NaN;
  const nParams = nf + nb;
  const aic = N_v * Math.log(mse + 1e-300) + 2 * nParams;

  const fFull = [1, ...fTail];
  const bFull = [...new Array(nk).fill(0), ...bTail];

  return {
    b: bTail, f: fTail,
    tf: new DiscreteTransferFunction(bFull, fFull, Ts),
    yhat, residual: residuals,
    fitPercent, mse, aic, iterations,
    order: { nb, nf, nk },
  };
}

// ---------------------------------------------------------------------------
// Private helpers shared by OE / BJ
// ---------------------------------------------------------------------------

/**
 * AR filter: out[k] = signal[k] − a[0]*out[k-1] − a[1]*out[k-2] − ...
 * Equivalent to dividing by A(q) = 1 + a[0]q⁻¹ + a[1]q⁻² + …
 */
function _arFilter(signal, aTail, N) {
  const out = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let s = signal[k] ?? 0;
    for (let i = 0; i < aTail.length; i++) s -= (aTail[i] || 0) * (out[k - 1 - i] || 0);
    out[k] = s;
  }
  return out;
}

/**
 * Simulate OE model output (model-predicted, no noise):
 *   yhat[k] = −f[0]*yhat[k-1] − … + b[0]*u[k-nk] + …
 */
function _oeSimulate(u, fTail, bTail, nk, N) {
  const yhat = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let i = 0; i < fTail.length; i++) s -= (fTail[i] || 0) * (yhat[k - 1 - i] || 0);
    for (let j = 0; j < bTail.length; j++) s += (bTail[j] || 0) * (u[k - nk - j] || 0);
    yhat[k] = s;
  }
  return yhat;
}

/**
 * Fit ARMA(nc, nd) to signal r via iterative pseudo-linear regression.
 * Noise model: D(q)·r = C(q)·e  ↔  r[k] = −d·r_past + c·e_past
 * Returns [cTail, dTail].
 */
function _fitARMA(r, nc, nd, N, maxLag, innerIter = 6) {
  let cTail = new Array(nc).fill(0);
  let dTail = new Array(nd).fill(0);
  if (nc === 0 && nd === 0) return [cTail, dTail];

  for (let it = 0; it < innerIter; it++) {
    // Compute innovations from current C, D
    const e = new Array(N).fill(0);
    for (let k = 0; k < N; k++) {
      let ek = r[k] ?? 0;
      for (let i = 0; i < nd; i++) ek += (dTail[i] || 0) * (r[k - 1 - i] || 0);
      for (let l = 0; l < nc; l++) ek -= (cTail[l] || 0) * (e[k - 1 - l] || 0);
      e[k] = ek;
    }
    const Phi = [], yVec = [];
    for (let k = maxLag; k < N; k++) {
      const row = [];
      for (let i = 0; i < nd; i++) row.push(-(r[k - 1 - i] ?? 0));
      for (let l = 0; l < nc; l++) row.push(e[k - 1 - l] ?? 0);
      Phi.push(row);
      yVec.push(r[k]);
    }
    if (Phi.length > 0 && Phi[0].length > 0) {
      const res = normalEquationsRidge(Phi, yVec, 1e-8);
      dTail = res.slice(0, nd);
      cTail = res.slice(nd, nd + nc);
    }
  }
  return [cTail, dTail];
}

// ---------------------------------------------------------------------------
// CS-P21-02: Box-Jenkins (BJ) Model
// ---------------------------------------------------------------------------

/**
 * Identify a Box-Jenkins model: y = B(q)/F(q)·u + C(q)/D(q)·e
 *
 * Uses alternating optimisation (extended Steiglitz-McBride for B/F;
 * pseudo-linear ARMA regression for C/D).
 *
 * Degenerates correctly:
 *   nc=nd=0 → OE;   nf=nd=0 → ARMAX-like (no AR on noise)
 *
 * @param {number[]} u   - input sequence
 * @param {number[]} y   - output sequence
 * @param {number}   nb  - process numerator order (B)
 * @param {number}   nf  - process denominator order (F)
 * @param {number}   nc  - noise MA order (C)
 * @param {number}   nd  - noise AR order (D)
 * @param {number}   nk  - input delay (≥1)
 * @param {number}   Ts  - sample time
 * @returns {{ b, f, c, d, tf, yhat, residual, fitPercent, mse, aic, iterations, order }}
 */
export function identifyBJ(u, y, nb, nf, nc, nd, nk = 1, Ts = 1, options = {}) {
  if (!Number.isInteger(nb) || nb < 1) throw new Error('BJ: nb must be a positive integer');
  if (!Number.isInteger(nf) || nf < 0) throw new Error('BJ: nf must be a non-negative integer');
  if (!Number.isInteger(nc) || nc < 0) throw new Error('BJ: nc must be a non-negative integer');
  if (!Number.isInteger(nd) || nd < 0) throw new Error('BJ: nd must be a non-negative integer');
  if (!Number.isInteger(nk) || nk < 0) throw new Error('BJ: nk must be a non-negative integer');

  // Degenerate to OE when noise model is trivial
  if (nc === 0 && nd === 0) {
    const oe = identifyOE(u, y, nb, nf, nk, Ts, options);
    return { ...oe, c: [], d: [], order: { nb, nf, nc, nd, nk } };
  }

  const maxIter = options.maxIter ?? 30;
  const tol = options.tol ?? 1e-6;
  const N = y.length;
  const maxLagBF = Math.max(nf, nb + nk - 1);
  const maxLagCD = Math.max(nc, nd);
  if (N < Math.max(maxLagBF, maxLagCD) + 10) throw new Error('BJ: not enough samples');

  // Initialise B, F from OE; C = 1, D = 1 (zero tails)
  const oeInit = identifyOE(u, y, nb, nf > 0 ? nf : 1, nk, Ts);
  let fTail = nf > 0 ? oeInit.f.slice() : [];
  let bTail = oeInit.b.slice();
  let [cTail, dTail] = _fitARMA(oeInit.residual, nc, nd, N, maxLagCD);

  let prevParams = [...bTail, ...fTail, ...cTail, ...dTail];
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // ── Step 1: Update B, F (Steiglitz-McBride on D-filtered signals) ──
    if (nf > 0 || nb > 0) {
      const yD = _arFilter(y, dTail, N);
      const uD = _arFilter(u, dTail, N);
      const yDF = _arFilter(yD, fTail, N);
      const uDF = _arFilter(uD, fTail, N);

      const PhiBF = [], yVecBF = [];
      for (let k = maxLagBF; k < N; k++) {
        const row = [];
        for (let i = 1; i <= nf; i++) row.push(-(yDF[k - i] ?? 0));
        for (let j = 0; j < nb; j++) row.push(uDF[k - nk - j] ?? 0);
        PhiBF.push(row);
        yVecBF.push(yDF[k]);
      }
      if (PhiBF.length > 0 && PhiBF[0].length > 0) {
        const res = normalEquationsRidge(PhiBF, yVecBF, 1e-8);
        fTail = res.slice(0, nf);
        bTail = res.slice(nf, nf + nb);
      }
    }

    // ── Step 2: Update C, D (ARMA on OE residuals) ──
    const resid = y.map((yi, k) => yi - _oeSimulate(u, fTail, bTail, nk, N)[k]);
    [cTail, dTail] = _fitARMA(resid, nc, nd, N, maxLagCD);

    const newParams = [...bTail, ...fTail, ...cTail, ...dTail];
    const diff = Math.max(...newParams.map((p, i) => Math.abs(p - (prevParams[i] ?? 0))));
    prevParams = newParams;
    iterations = iter + 1;
    if (diff < tol) break;
  }

  // Final metrics (OE simulation as yhat — the process model output).
  // Valid range k = maxLagBF … N-1 for consistent cross-model AIC comparison.
  const yhat = _oeSimulate(u, fTail, bTail, nk, N);
  const residuals = y.map((yi, k) => yi - yhat[k]);
  const N_v = N - maxLagBF;
  const validResid = residuals.slice(maxLagBF);
  const sse = validResid.reduce((s, ei) => s + ei * ei, 0);
  const mse = sse / N_v;
  const yMean = y.slice(maxLagBF).reduce((s, v) => s + v, 0) / N_v;
  const ssTot = y.slice(maxLagBF).reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const fitPercent = ssTot > 1e-12
    ? Math.max(0, (1 - Math.sqrt(sse / ssTot)) * 100)
    : NaN;
  const nParams = nb + nf + nc + nd;
  const aic = N_v * Math.log(mse + 1e-300) + 2 * nParams;
  const fFull = [1, ...fTail];
  const bFull = [...new Array(nk).fill(0), ...bTail];

  return {
    b: bTail, f: fTail, c: cTail, d: dTail,
    tf: new DiscreteTransferFunction(bFull, fFull, Ts),
    yhat, residual: residuals,
    fitPercent, mse, aic, iterations,
    order: { nb, nf, nc, nd, nk },
  };
}

// ---------------------------------------------------------------------------
// CS-P21-04: Residual Validation + Model Uncertainty Export
// ---------------------------------------------------------------------------

/**
 * Compute sample autocorrelation of signal at lags 0…nlags.
 * Returns normalised values (r[0] = 1).
 */
function _sampleACF(signal, nlags) {
  const N = signal.length;
  const mean = signal.reduce((s, v) => s + v, 0) / N;
  const variance = signal.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
  if (variance < 1e-15) return new Array(nlags + 1).fill(0);
  const ac = new Array(nlags + 1);
  for (let lag = 0; lag <= nlags; lag++) {
    let sum = 0;
    for (let k = lag; k < N; k++) sum += (signal[k] - mean) * (signal[k - lag] - mean);
    ac[lag] = sum / (N * variance);
  }
  return ac;
}

/**
 * Chi-square 95th-percentile critical value via Wilson-Hilferty approximation.
 * Error < 0.5 % for df ≥ 4.  Used for Ljung-Box and portmanteau tests.
 * @param {number} df - degrees of freedom
 * @returns {number}
 */
function _chi2Critical95(df) {
  const z = 1.6449; // z_{0.95} from standard normal
  const mu = 1 - 2 / (9 * df);
  const sigma = Math.sqrt(2 / (9 * df));
  return df * Math.pow(mu + z * sigma, 3);
}

/**
 * Residual whiteness test (autocorrelation + Ljung-Box).
 *
 * A well-fitted model leaves white (uncorrelated) residuals.
 * `passed` is the formal Ljung-Box test at the 5 % significance level:
 *   Q = N(N+2)·Σ r_k²/(N−k) < χ²(nlags, 0.95)
 * The per-lag ±1.96/√N band is provided for visual inspection only.
 *
 * @param {number[]} residuals
 * @param {number}   nlags   - number of lags to test (default 20)
 * @returns {{
 *   autocorr:         number[],  // ACF at lags 1…nlags
 *   bound95:          number,    // ±1.96/√N pointwise band
 *   withinBounds:     boolean[], // per-lag flag (visual aid only)
 *   ljungBox:         number,    // Ljung-Box Q statistic
 *   ljungBoxDf:       number,    // degrees of freedom (= nlags)
 *   ljungBoxCritical: number,    // χ²(nlags, 0.95) — formal threshold
 *   passed:           boolean,   // true iff Q < χ²(nlags, 0.95)
 * }}
 */
export function residualWhitenessTest(residuals, nlags = 20) {
  const N = residuals.length;
  const bound95 = 1.96 / Math.sqrt(N);
  const ac = _sampleACF(residuals, nlags);
  const autocorr = ac.slice(1); // lags 1…nlags

  const withinBounds = autocorr.map(r => Math.abs(r) <= bound95);

  // Ljung-Box Q = N(N+2) · Σ_{k=1}^{m} r_k² / (N−k)
  let ljungBox = 0;
  for (let k = 1; k <= nlags; k++) ljungBox += ac[k] ** 2 / (N - k);
  ljungBox *= N * (N + 2);

  const ljungBoxCritical = _chi2Critical95(nlags);
  // Formal test: reject H₀ (white residuals) if Q ≥ critical value
  const passed = ljungBox < ljungBoxCritical;

  return { autocorr, bound95, withinBounds, ljungBox, ljungBoxDf: nlags, ljungBoxCritical, passed };
}

/**
 * Cross-correlation test between residuals and input.
 *
 * For a correctly identified model, residuals e[k] must be uncorrelated with
 * all past inputs u[k-j], j ≥ 1.  The `passed` criterion is the one-sided
 * portmanteau test on negative lags (past inputs):
 *   Q_cc = N · Σ_{j=1}^{nlags} r_{eu}(−j)² < χ²(nlags, 0.95)
 * Lag 0 and positive lags are provided for inspection but excluded from the
 * test statistic because lag 0 is model-dependent and positive lags are trivially
 * zero for causal systems.
 *
 * @param {number[]} residuals
 * @param {number[]} u       - input signal (same length)
 * @param {number}   nlags   - one-sided lag count (default 20)
 * @returns {{
 *   crossCorr:           number[],  // CCF at lags −nlags…+nlags
 *   lags:                number[],  // corresponding lag values
 *   bound95:             number,
 *   withinBounds:        boolean[],
 *   portmanteau:         number,    // Q_cc on negative lags 1..nlags
 *   portmanteauCritical: number,    // χ²(nlags, 0.95)
 *   passed:              boolean,   // true iff Q_cc < χ²(nlags, 0.95)
 * }}
 */
export function crossCorrelationTest(residuals, u, nlags = 20) {
  const N = Math.min(residuals.length, u.length);
  const bound95 = 1.96 / Math.sqrt(N);

  const eMean = residuals.reduce((s, v) => s + v, 0) / N;
  const uMean = u.slice(0, N).reduce((s, v) => s + v, 0) / N;
  const eVar = residuals.reduce((s, v) => s + (v - eMean) ** 2, 0) / N;
  const uVar = u.slice(0, N).reduce((s, v) => s + (v - uMean) ** 2, 0) / N;
  const denom = Math.sqrt(eVar * uVar);

  const lags = Array.from({ length: 2 * nlags + 1 }, (_, i) => i - nlags);
  const crossCorr = lags.map(lag => {
    let sum = 0, cnt = 0;
    const kStart = Math.max(0, -lag);
    const kEnd   = Math.min(N, N - lag);
    for (let k = kStart; k < kEnd; k++) {
      sum += (residuals[k] - eMean) * (u[k + lag] - uMean);
      cnt++;
    }
    return denom > 1e-15 ? sum / (cnt * denom) : 0;
  });

  const withinBounds = crossCorr.map(r => Math.abs(r) <= bound95);

  // Portmanteau on past-input lags (lag = -1 … -nlags → indices 0 … nlags-1):
  // Q_cc = N · Σ_{j=1}^{nlags} r_{eu}(−j)²
  let portmanteau = 0;
  for (let i = 0; i < nlags; i++) portmanteau += crossCorr[i] ** 2;
  portmanteau *= N;

  const portmanteauCritical = _chi2Critical95(nlags);
  const passed = portmanteau < portmanteauCritical;

  return { crossCorr, lags, bound95, withinBounds, portmanteau, portmanteauCritical, passed };
}

/**
 * Compute parameter covariance from a normal-equations regression.
 * cov(θ) = σ² · (ΦᵀΦ)⁻¹
 *
 * @param {number[][]} Phi    - regressor matrix (N × p)
 * @param {number}     sigma2 - noise variance (mse from fit)
 * @returns {{ cov: number[][], stderr: number[] }}
 */
export function computeParameterCovariance(Phi, sigma2) {
  const p = Phi[0].length;
  const AtA = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const row of Phi) {
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        AtA[i][j] += row[i] * row[j];
  }
  // Invert via Gauss-Jordan
  const aug = AtA.map((r, i) => {
    const e = new Array(p).fill(0); e[i] = 1;
    return [...r, ...e];
  });
  for (let k = 0; k < p; k++) {
    let pivot = k;
    for (let i = k + 1; i < p; i++) if (Math.abs(aug[i][k]) > Math.abs(aug[pivot][k])) pivot = i;
    if (pivot !== k) { const t = aug[k]; aug[k] = aug[pivot]; aug[pivot] = t; }
    const akk = aug[k][k];
    if (Math.abs(akk) < 1e-14) continue;
    for (let j = k; j < 2 * p; j++) aug[k][j] /= akk;
    for (let i = 0; i < p; i++) if (i !== k) {
      const f = aug[i][k];
      for (let j = k; j < 2 * p; j++) aug[i][j] -= f * aug[k][j];
    }
  }
  const invAtA = aug.map(r => r.slice(p));
  const cov = invAtA.map(row => row.map(v => v * sigma2));
  const stderr = cov.map((row, i) => Math.sqrt(Math.max(0, row[i])));
  return { cov, stderr };
}

/**
 * Export model uncertainty as a multiplicative frequency-domain bound,
 * compatible with Phase 18 robust validation input format.
 *
 * Uses Monte Carlo sampling from N(θ̂, cov(θ̂)) to compute ±2σ magnitude
 * bounds at each frequency, then reports the maximum relative deviation
 * as a scalar gain variation and worst-case phase spread.
 *
 * @param {number[]}   num    - identified numerator (z⁻¹ polynomial, nk zeros prepended)
 * @param {number[]}   den    - identified denominator (length na+1, leading 1)
 * @param {number[][]} cov    - parameter covariance (from computeParameterCovariance)
 * @param {number}     nSamples - Monte Carlo draws (default 200)
 * @param {number}     nFreqs   - frequency grid points (default 100)
 * @returns {{
 *   gainVariation:   number,    // max relative magnitude deviation (0–1) for ±2σ → Phase 18 gain knob
 *   phaseVariation:  number,    // max absolute phase spread in degrees
 *   freqNorm:        number[],  // normalised freq grid [0, π]
 *   nominalMagDB:    number[],  // |H(e^jω)| in dB
 *   upperMagDB:      number[],  // 97.5th-percentile sample magnitude in dB
 *   lowerMagDB:      number[],  // 2.5th-percentile sample magnitude in dB
 *   multiplicativeW: number[],  // |ΔH/H_nominal| at each frequency (for w(jω))
 * }}
 */
export function exportModelUncertainty(num, den, cov, nSamples = 200, nFreqs = 100) {
  const nb = num.length;
  const na = den.length - 1; // excluding leading 1
  const nParams = nb + na;
  const freqs = Array.from({ length: nFreqs }, (_, i) => (Math.PI * i) / (nFreqs - 1));

  // Evaluate H(e^jω) for a given num/den
  function evalH(n, d, omega) {
    let nRe = 0, nIm = 0, dRe = 0, dIm = 0;
    let cosK = 1, sinK = 0; // e^{-j0}
    for (let k = 0; k < n.length; k++) {
      nRe += n[k] * cosK; nIm -= n[k] * sinK;
      const c2 = cosK * Math.cos(omega) + sinK * Math.sin(omega);
      const s2 = sinK * Math.cos(omega) - cosK * Math.sin(omega);
      cosK = c2; sinK = s2;
    }
    cosK = 1; sinK = 0;
    for (let k = 0; k < d.length; k++) {
      dRe += d[k] * cosK; dIm -= d[k] * sinK;
      const c2 = cosK * Math.cos(omega) + sinK * Math.sin(omega);
      const s2 = sinK * Math.cos(omega) - cosK * Math.sin(omega);
      cosK = c2; sinK = s2;
    }
    const dMag2 = dRe * dRe + dIm * dIm;
    if (dMag2 < 1e-30) return { mag: 0, phase: 0 };
    const Hre = (nRe * dRe + nIm * dIm) / dMag2;
    const Him = (nIm * dRe - nRe * dIm) / dMag2;
    return { mag: Math.sqrt(Hre * Hre + Him * Him), phase: Math.atan2(Him, Hre) * 180 / Math.PI };
  }

  // Nominal response
  const nominal = freqs.map(w => evalH(num, den, w));

  // Cholesky decomposition for sampling N(0, cov)
  function choleskyLower(C) {
    const n = C.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = C[i][j];
        for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
        L[i][j] = i === j ? Math.sqrt(Math.max(0, sum)) : (L[j][j] > 1e-14 ? sum / L[j][j] : 0);
      }
    }
    return L;
  }

  // Simple LCG for deterministic sampling (seed 42)
  let lcgState = 42;
  function lcgNormal() {
    // Box-Muller using LCG
    lcgState = (lcgState * 1664525 + 1013904223) & 0xffffffff;
    const u1 = ((lcgState >>> 0) + 0.5) / 4294967296;
    lcgState = (lcgState * 1664525 + 1013904223) & 0xffffffff;
    const u2 = ((lcgState >>> 0) + 0.5) / 4294967296;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Build reduced covariance (only parameters that exist)
  const nP = Math.min(nParams, cov.length);
  const L = choleskyLower(cov.slice(0, nP).map(r => r.slice(0, nP)));

  // Sample and accumulate per-frequency magnitudes
  const magSamples = freqs.map(() => []);
  const phaseSamples = freqs.map(() => []);

  for (let s = 0; s < nSamples; s++) {
    // Sample z ~ N(0, I), then θ_s = θ̂ + L·z
    const z = Array.from({ length: nP }, lcgNormal);
    const dTheta = L.map(row => row.reduce((acc, l, j) => acc + l * z[j], 0));

    // Perturb num (first nb params) and den tail (next na params)
    const numS = num.map((v, i) => v + (i < nP ? dTheta[i] : 0));
    const denS = den.map((v, i) => i === 0 ? 1 : v + (i - 1 + nb < nP ? dTheta[i - 1 + nb] : 0));

    for (let f = 0; f < freqs.length; f++) {
      const h = evalH(numS, denS, freqs[f]);
      magSamples[f].push(h.mag);
      phaseSamples[f].push(h.phase);
    }
  }

  // Per-frequency 2.5 / 97.5 percentile
  function percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  const upperMagDB = [], lowerMagDB = [], nominalMagDB = [], multW = [];
  let maxGainDev = 0, maxPhaseDev = 0;

  for (let f = 0; f < freqs.length; f++) {
    const nomMag = nominal[f].mag;
    const hi = percentile(magSamples[f], 97.5);
    const lo = percentile(magSamples[f], 2.5);
    nominalMagDB.push(20 * Math.log10(Math.max(nomMag, 1e-30)));
    upperMagDB.push(20 * Math.log10(Math.max(hi, 1e-30)));
    lowerMagDB.push(20 * Math.log10(Math.max(lo, 1e-30)));
    const relDev = nomMag > 1e-10 ? Math.max(Math.abs(hi - nomMag), Math.abs(nomMag - lo)) / nomMag : 0;
    multW.push(relDev);
    maxGainDev = Math.max(maxGainDev, relDev);

    const phaseArr = phaseSamples[f];
    const phiHi = percentile(phaseArr, 97.5);
    const phiLo = percentile(phaseArr, 2.5);
    maxPhaseDev = Math.max(maxPhaseDev, Math.abs(phiHi - phiLo) / 2);
  }

  return {
    gainVariation: maxGainDev,
    phaseVariation: maxPhaseDev,
    freqNorm: freqs,
    nominalMagDB,
    upperMagDB,
    lowerMagDB,
    multiplicativeW: multW,
  };
}

// ---------------------------------------------------------------------------

/**
 * Convenience: try several (na, nb) combinations and pick the one with lowest AIC.
 */
export function autoARXOrder(u, y, options = {}) {
  const naMax = options.naMax ?? 4;
  const nbMax = options.nbMax ?? 4;
  const nk = options.nk ?? 1;
  const Ts = options.Ts ?? 1;
  let best = null;
  const candidates = [];
  for (let na = 1; na <= naMax; na++) {
    for (let nb = 1; nb <= nbMax; nb++) {
      try {
        const model = identifyARX(u, y, na, nb, nk, Ts);
        candidates.push({ na, nb, aic: model.aic, fitPercent: model.fitPercent });
        if (!best || model.aic < best.aic) best = { ...model };
      } catch { /* skip ill-conditioned */ }
    }
  }
  return { best, candidates };
}
