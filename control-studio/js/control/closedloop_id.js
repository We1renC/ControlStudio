/**
 * closedloop_id.js - Tier B2: closed-loop identification baseline.
 *
 * Baseline scope:
 *   - direct ARX identification from u -> y,
 *   - indirect identification from r -> y closed-loop T and scalar K,
 *   - joint I/O instrumental-variable estimate using r as instrument.
 *
 * The indirect path targets a first-order discrete plant:
 *   G(q) = b q^-1 / (1 - a q^-1)
 * under proportional feedback u = K(r - y), giving:
 *   T(q) = Kb q^-1 / (1 - (a - Kb) q^-1)
 * so b = T_b / K and a = T_a + T_b.
 */

import { identifyARX } from './sysid.js';

function variance(x) {
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  return x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length;
}

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  const aa = a.slice(0, n);
  const bb = b.slice(0, n);
  const ma = aa.reduce((s, v) => s + v, 0) / n;
  const mb = bb.reduce((s, v) => s + v, 0) / n;
  let num = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = aa[i] - ma;
    const db = bb[i] - mb;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  return num / Math.sqrt(Math.max(va * vb, 1e-24));
}

function solve2(A, b) {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (Math.abs(det) < 1e-12) throw new Error('jointIO instrument matrix is singular');
  return [
    (b[0] * A[1][1] - A[0][1] * b[1]) / det,
    (A[0][0] * b[1] - b[0] * A[1][0]) / det,
  ];
}

function oneStepPredictPlant(u, y, a, b) {
  const yhat = new Array(y.length).fill(NaN);
  for (let k = 1; k < y.length; k++) yhat[k] = a * y[k - 1] + b * u[k - 1];
  const residual = y.map((value, k) => Number.isFinite(yhat[k]) ? value - yhat[k] : 0);
  const mse = residual.slice(1).reduce((s, value) => s + value * value, 0) / Math.max(1, y.length - 1);
  return { yhat, residual, mse };
}

export function analyzeBiasRisk(data, controllerK = 1) {
  const { r, u, y } = data;
  if (!Array.isArray(r) || !Array.isArray(u) || !Array.isArray(y)) {
    throw new Error('r, u, y arrays are required');
  }
  const trackingError = r.map((value, i) => value - y[i]);
  const feedbackConsistency = corr(u, trackingError.map((e) => controllerK * e));
  const excitationRatio = variance(r) / Math.max(variance(y), 1e-12);
  const uyCorrelation = Math.abs(corr(u.slice(1), y.slice(0, -1)));
  const biasIndex = Math.max(0, Math.min(1, 0.55 * uyCorrelation + 0.45 * (1 - Math.min(excitationRatio, 1))));
  return {
    biasIndex,
    feedbackConsistency,
    excitationRatio,
    recommendation: biasIndex > 0.45
      ? 'Prefer indirect or jointIO identification; direct ARX is likely biased by feedback/noise correlation.'
      : 'Direct ARX risk is acceptable for this dataset.',
  };
}

export function identifyClosedLoop(args) {
  const {
    r, u, y, dt = 1, controllerK = 1,
    method = 'direct',
    structure = 'ARX',
    na = 1,
    nb = 1,
    nk = 1,
  } = args;
  if (structure !== 'ARX' && structure !== 'BJ') throw new Error('Only ARX/BJ structure labels are accepted in this baseline');
  if (!Array.isArray(r) || !Array.isArray(u) || !Array.isArray(y) || r.length !== y.length || u.length !== y.length) {
    throw new Error('r, u, y arrays of equal length are required');
  }

  const bias = analyzeBiasRisk({ r, u, y }, controllerK);

  if (method === 'direct') {
    const model = identifyARX(u, y, na, nb, nk, dt);
    return { method, structure, plant: model.tf, model, noiseModel: null, bias: bias.biasIndex > 0.45, conditionNumber: 1 / Math.max(1e-9, 1 - bias.biasIndex), biasRisk: bias };
  }

  if (method === 'indirect') {
    if (na !== 1 || nb !== 1 || nk !== 1) throw new Error('indirect baseline currently supports ARX(1,1,1)');
    if (Math.abs(controllerK) < 1e-12) throw new Error('controllerK must be non-zero');
    const closedLoop = identifyARX(r, y, 1, 1, 1, dt);
    const TclPole = -closedLoop.a[1]; // y[k] = TclPole*y[k-1] + Tb*r[k-1]
    const Tb = closedLoop.b[1];
    const bPlant = Tb / controllerK;
    const aPlant = TclPole + Tb;
    const prediction = oneStepPredictPlant(u, y, aPlant, bPlant);
    return {
      method,
      structure,
      plant: { a: [1, -aPlant], b: [0, bPlant], aPole: aPlant, bGain: bPlant, Ts: dt },
      closedLoop,
      noiseModel: null,
      bias: false,
      conditionNumber: 1 / Math.max(1e-9, Math.abs(controllerK)),
      biasRisk: bias,
      residual: prediction.residual,
      mse: prediction.mse,
    };
  }

  if (method === 'jointIO') {
    if (na !== 1 || nb !== 1 || nk !== 1) throw new Error('jointIO baseline currently supports ARX(1,1,1)');
    // IV equations: E[z * y[k]] = E[z * (a*y[k-1] + b*u[k-1])]
    // instruments z = [r[k-1], r[k-2]], less correlated with output noise.
    let A = [[0, 0], [0, 0]];
    let rhs = [0, 0];
    for (let k = 2; k < y.length; k++) {
      const z = [r[k - 1], r[k - 2]];
      const phi = [y[k - 1], u[k - 1]];
      for (let i = 0; i < 2; i++) {
        rhs[i] += z[i] * y[k];
        for (let j = 0; j < 2; j++) A[i][j] += z[i] * phi[j];
      }
    }
    const [aPlant, bPlant] = solve2(A, rhs);
    const prediction = oneStepPredictPlant(u, y, aPlant, bPlant);
    return {
      method,
      structure,
      plant: { a: [1, -aPlant], b: [0, bPlant], aPole: aPlant, bGain: bPlant, Ts: dt },
      noiseModel: { type: 'IV residual', mse: prediction.mse },
      bias: false,
      conditionNumber: Math.abs(A[0][0] * A[1][1] - A[0][1] * A[1][0]) < 1e-9 ? Infinity : 1,
      biasRisk: bias,
      residual: prediction.residual,
      mse: prediction.mse,
    };
  }

  throw new Error(`Unknown closed-loop identification method: ${method}`);
}

export default {
  identifyClosedLoop,
  analyzeBiasRisk,
};
