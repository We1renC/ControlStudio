/**
 * gp.js - Tier B4: Gaussian-process NARX / regression baseline.
 */

import { matInverse, matVecMul } from '../math/matrix.js';

function sqDist(a, b) {
  return a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
}

function kernelValue(x, z, hyper) {
  const variance = hyper.variance ?? 1;
  const lengthScale = hyper.lengthScale ?? 1;
  const d2 = sqDist(x, z);
  const r = Math.sqrt(d2) / Math.max(lengthScale, 1e-12);
  if (hyper.kernel === 'matern32') return variance * (1 + Math.sqrt(3) * r) * Math.exp(-Math.sqrt(3) * r);
  if (hyper.kernel === 'matern52') return variance * (1 + Math.sqrt(5) * r + 5 * r * r / 3) * Math.exp(-Math.sqrt(5) * r);
  if (hyper.kernel === 'periodic') {
    const period = hyper.period ?? 1;
    const s = Math.sin(Math.PI * Math.sqrt(d2) / period);
    return variance * Math.exp(-2 * s * s / (lengthScale * lengthScale));
  }
  return variance * Math.exp(-0.5 * d2 / (lengthScale * lengthScale));
}

function buildKernelMatrix(X, hyper, noiseVar = 1e-6) {
  const N = X.length;
  const K = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      const value = kernelValue(X[i], X[j], hyper);
      K[i][j] = value;
      K[j][i] = value;
    }
    K[i][i] += noiseVar;
  }
  return K;
}

function logMarginalLikelihood(X, y, hyper, noiseVar) {
  const K = buildKernelMatrix(X, hyper, noiseVar);
  const Kinv = matInverse(K);
  const alpha = matVecMul(Kinv, y);
  const quad = y.reduce((sum, value, i) => sum + value * alpha[i], 0);
  const det = Math.max(1e-300, determinantViaLU(K));
  return -0.5 * quad - 0.5 * Math.log(det) - 0.5 * X.length * Math.log(2 * Math.PI);
}

function determinantViaLU(A) {
  const M = A.map((row) => row.slice());
  let sign = 1;
  let det = 1;
  for (let i = 0; i < M.length; i++) {
    let pivot = i;
    for (let r = i + 1; r < M.length; r++) if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r;
    if (Math.abs(M[pivot][i]) < 1e-15) return 0;
    if (pivot !== i) {
      [M[i], M[pivot]] = [M[pivot], M[i]];
      sign *= -1;
    }
    const p = M[i][i];
    det *= p;
    for (let r = i + 1; r < M.length; r++) {
      const f = M[r][i] / p;
      for (let c = i; c < M.length; c++) M[r][c] -= f * M[i][c];
    }
  }
  return Math.abs(sign * det);
}

export function optimizeHyper(initial, X, y, opts = {}) {
  const kernel = initial.kernel ?? opts.kernel ?? 'rbf';
  const noiseVar = opts.noiseVar ?? initial.noiseVar ?? 1e-5;
  const baseLength = initial.lengthScale ?? 1;
  const baseVar = initial.variance ?? Math.max(1e-6, y.reduce((s, v) => s + v * v, 0) / y.length);
  const lengthCandidates = [0.25, 0.5, 1, 2, 4].map((m) => baseLength * m);
  const varCandidates = [0.25, 0.5, 1, 2, 4].map((m) => baseVar * m);
  let best = { kernel, lengthScale: baseLength, variance: baseVar, noiseVar };
  let bestScore = -Infinity;
  for (const lengthScale of lengthCandidates) {
    for (const variance of varCandidates) {
      const candidate = { kernel, lengthScale, variance, period: initial.period };
      const score = logMarginalLikelihood(X, y, candidate, noiseVar);
      if (score > bestScore) {
        bestScore = score;
        best = { ...candidate, noiseVar, logLikelihood: score, converged: true };
      }
    }
  }
  return best;
}

export function fitGP({ X, y, kernel = 'rbf', noiseVar = 1e-5, hyper = null, optimize = false } = {}) {
  if (!Array.isArray(X) || !Array.isArray(y) || X.length !== y.length || X.length === 0) {
    throw new Error('X and y arrays of equal non-zero length are required');
  }
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const centeredY = y.map((value) => value - yMean);
  const initialHyper = hyper ?? { kernel, lengthScale: 1, variance: Math.max(1e-6, varianceOf(y)), noiseVar };
  const fittedHyper = optimize ? optimizeHyper(initialHyper, X, centeredY, { noiseVar, kernel }) : { ...initialHyper, kernel, noiseVar };
  const K = buildKernelMatrix(X, fittedHyper, noiseVar);
  const Kinv = matInverse(K);
  const alpha = matVecMul(Kinv, centeredY);
  return { X: X.map((row) => row.slice()), y: y.slice(), yMean, hyper: fittedHyper, K_inv: Kinv, alpha, kernelObj: { kernel } };
}

export function predictGP(gpModel, X_test) {
  const mean = [];
  const variance = [];
  for (const x of X_test) {
    const kStar = gpModel.X.map((xi) => kernelValue(x, xi, gpModel.hyper));
    const mu = (gpModel.yMean ?? 0) + kStar.reduce((sum, value, i) => sum + value * gpModel.alpha[i], 0);
    const KinvK = matVecMul(gpModel.K_inv, kStar);
    const cov = kernelValue(x, x, gpModel.hyper) + (gpModel.hyper.noiseVar ?? 0) -
      kStar.reduce((sum, value, i) => sum + value * KinvK[i], 0);
    const v = Math.max(1e-12, cov);
    mean.push(mu);
    variance.push(v);
  }
  const ci95 = mean.map((mu, i) => [mu - 1.96 * Math.sqrt(variance[i]), mu + 1.96 * Math.sqrt(variance[i])]);
  return { mean, var: variance, variance, '95CI': ci95, ci95 };
}

export function buildNARXRegressors(u, y, na = 1, nb = 1) {
  const N = Math.min(u.length, y.length);
  const lag = Math.max(na, nb);
  const X = [];
  const target = [];
  for (let k = lag; k < N; k++) {
    const row = [];
    for (let i = 1; i <= na; i++) row.push(y[k - i]);
    for (let j = 1; j <= nb; j++) row.push(u[k - j]);
    X.push(row);
    target.push(y[k]);
  }
  return { X, y: target };
}

function varianceOf(y) {
  const m = y.reduce((s, v) => s + v, 0) / y.length;
  return y.reduce((s, v) => s + (v - m) ** 2, 0) / y.length;
}

export default {
  fitGP,
  predictGP,
  optimizeHyper,
  buildNARXRegressors,
};
