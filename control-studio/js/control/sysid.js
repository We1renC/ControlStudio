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
