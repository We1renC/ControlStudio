/**
 * hammerstein_wiener.js - Tier B5: block-oriented nonlinear identification.
 *
 * Scope: deterministic small-data baseline for Hammerstein and Wiener models.
 * The implementation intentionally favors transparent least-squares routines
 * that are easy to verify against closed-form synthetic benchmarks.
 */

import { matInverse, matMul, matTranspose, matVecMul } from '../math/matrix.js';

function validateSeries(u, y) {
  if (!Array.isArray(u) || !Array.isArray(y) || u.length !== y.length || u.length < 4) {
    throw new Error('u and y must be equal-length arrays with at least 4 samples');
  }
}

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

function polynomialRow(x, order) {
  const row = [];
  let value = 1;
  for (let i = 0; i <= order; i++) {
    row.push(value);
    value *= x;
  }
  return row;
}

function solveLeastSquares(Phi, target, ridge = 1e-10) {
  const Pt = matTranspose(Phi);
  const normal = matMul(Pt, Phi);
  for (let i = 0; i < normal.length; i++) normal[i][i] += ridge;
  return matVecMul(matInverse(normal), matVecMul(Pt, target));
}

function fitArxBlock(uEff, y, na = 1, nb = 1) {
  const lag = Math.max(na, nb);
  const Phi = [];
  const target = [];
  for (let k = lag; k < y.length; k++) {
    const row = [];
    for (let i = 1; i <= na; i++) row.push(y[k - i]);
    for (let j = 1; j <= nb; j++) row.push(uEff[k - j]);
    Phi.push(row);
    target.push(y[k]);
  }
  const theta = solveLeastSquares(Phi, target);
  const yhat = y.slice(0, lag);
  for (let k = lag; k < y.length; k++) {
    let pred = 0;
    let idx = 0;
    for (let i = 1; i <= na; i++) pred += theta[idx++] * yhat[k - i];
    for (let j = 1; j <= nb; j++) pred += theta[idx++] * uEff[k - j];
    yhat[k] = pred;
  }
  return { theta, yhat, lag };
}

function fitPercent(y, yhat, start = 0) {
  const values = y.slice(start);
  const preds = yhat.slice(start);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const err = Math.sqrt(values.reduce((sum, value, i) => sum + (value - preds[i]) ** 2, 0));
  const denom = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0));
  if (denom < 1e-12) return err < 1e-12 ? 100 : 0;
  return Math.max(-Infinity, 100 * (1 - err / denom));
}

function linspace(min, max, n) {
  if (n <= 1) return [min];
  return Array.from({ length: n }, (_, i) => min + (max - min) * i / (n - 1));
}

export function identifyHammerstein({ u, y, na = 1, nb = 1, nlOrder = 1, dt = 1 } = {}) {
  validateSeries(u, y);
  const maxAbs = Math.max(...u.map((value) => Math.abs(value)));
  if (maxAbs <= 0) throw new Error('Hammerstein identification requires a non-zero input signal');

  let best = null;
  const coarse = linspace(0.35 * maxAbs, maxAbs, 80);
  for (const level of coarse) {
    const uEff = u.map((value) => clamp(value, level));
    const block = fitArxBlock(uEff, y, na, nb);
    const score = fitPercent(y, block.yhat, block.lag);
    if (!best || score > best.fitPercent) {
      best = { level, uEff, block, fitPercent: score };
    }
  }

  const refineSpan = Math.max(maxAbs * 0.08, best.level * 0.08);
  const refineMin = Math.max(maxAbs * 0.05, best.level - refineSpan);
  const refineMax = Math.min(maxAbs, best.level + refineSpan);
  for (const level of linspace(refineMin, refineMax, 80)) {
    const uEff = u.map((value) => clamp(value, level));
    const block = fitArxBlock(uEff, y, na, nb);
    const score = fitPercent(y, block.yhat, block.lag);
    if (score > best.fitPercent) {
      best = { level, uEff, block, fitPercent: score };
    }
  }

  const a = best.block.theta.slice(0, na);
  const b = best.block.theta.slice(na, na + nb);
  return {
    f_coeffs: [best.level],
    nonlinearity: { type: 'saturation', level: best.level, nlOrder },
    G: {
      type: 'arx',
      na,
      nb,
      a,
      b,
      num: [0, ...b],
      den: [1, ...a.map((value) => -value)],
      dt,
    },
    fitPercent: best.fitPercent,
    yhat: best.block.yhat,
  };
}

export function identifyWiener({ u, y, na = 0, nb = 1, nlOrder = 2, dt = 1 } = {}) {
  validateSeries(u, y);
  const delay = Math.max(0, nb - 1);
  const Phi = [];
  const target = [];
  const x = [];
  for (let k = delay; k < y.length; k++) {
    const linearOutput = u[k - delay];
    x.push(linearOutput);
    Phi.push(polynomialRow(linearOutput, nlOrder));
    target.push(y[k]);
  }
  const coeffs = solveLeastSquares(Phi, target);
  const yhat = new Array(y.length).fill(y[0]);
  for (let i = 0; i < x.length; i++) {
    yhat[i + delay] = polynomialRow(x[i], nlOrder).reduce((sum, value, j) => sum + value * coeffs[j], 0);
  }
  return {
    f_coeffs: coeffs,
    h_coeffs: coeffs,
    nonlinearity: { type: 'polynomial', coeffs, nlOrder },
    G: { type: 'static-gain', num: [1], den: [1], na, nb, dt },
    fitPercent: fitPercent(y, yhat, delay),
    yhat,
  };
}

export default {
  identifyHammerstein,
  identifyWiener,
};
