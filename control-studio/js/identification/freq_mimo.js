/**
 * freq_mimo.js - Tier B6: MIMO frequency-response identification baseline.
 */

import { Complex } from '../math/complex.js';

function asComplex(value) {
  if (value instanceof Complex) return value;
  if (typeof value === 'number') return new Complex(value, 0);
  if (value && typeof value.re === 'number' && typeof value.im === 'number') return new Complex(value.re, value.im);
  throw new TypeError('Expected a number or Complex-like value');
}

function zeros(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => new Complex(0, 0)));
}

function cmat(A) {
  return A.map((row) => row.map(asComplex));
}

function cTransposeConj(A) {
  return A[0].map((_, j) => A.map((row) => row[j].conjugate));
}

function cMul(A, B) {
  const out = zeros(A.length, B[0].length);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B[0].length; j++) {
      let sum = new Complex(0, 0);
      for (let k = 0; k < B.length; k++) sum = sum.add(A[i][k].mul(B[k][j]));
      out[i][j] = sum;
    }
  }
  return out;
}

function cSub(A, B) {
  return A.map((row, i) => row.map((value, j) => value.sub(B[i][j])));
}

function cEnergy(A) {
  return A.reduce((sum, row) => sum + row.reduce((inner, value) => inner + value.magnitudeSquared, 0), 0);
}

function cInverse(A) {
  if (A.length !== A[0].length) throw new Error('Complex inverse requires a square matrix');
  if (A.length === 1) return [[new Complex(1, 0).div(A[0][0])]];
  if (A.length === 2) {
    const [[a, b], [c, d]] = A;
    const det = a.mul(d).sub(b.mul(c));
    return [
      [d.div(det), b.neg().div(det)],
      [c.neg().div(det), a.div(det)],
    ];
  }
  throw new Error('Complex inverse currently supports 1x1 and 2x2 matrices');
}

function cPinv(A) {
  const Ah = cTransposeConj(A);
  const normal = cMul(A, Ah);
  try {
    return cMul(Ah, cInverse(normal));
  } catch {
    const altNormal = cMul(Ah, A);
    return cMul(cInverse(altNormal), Ah);
  }
}

export function computeFRFMIMO({ U, Y, freq = [], method = 'LS' } = {}) {
  if (!Array.isArray(U) || !Array.isArray(Y) || U.length !== Y.length || U.length === 0) {
    throw new Error('U and Y must be equal-length arrays of frequency-indexed matrices');
  }
  const G_jw = [];
  const coherence = [];
  for (let k = 0; k < U.length; k++) {
    const Uk = cmat(U[k]);
    const Yk = cmat(Y[k]);
    const Gk = cMul(Yk, cPinv(Uk));
    const residual = cSub(Yk, cMul(Gk, Uk));
    const residualEnergy = cEnergy(residual);
    const outputEnergy = Math.max(1e-18, cEnergy(Yk));
    G_jw.push(Gk);
    coherence.push(Math.max(0, Math.min(1, 1 - residualEnergy / outputEnergy)));
  }
  return { G_jw, coherence, freq, method };
}

export function fitMIMOFromFRF(frf, structure = 'ss', order = 1) {
  const first = frf.G_jw?.[0];
  if (!first) throw new Error('FRF data must contain at least one complex matrix');
  const p = first.length;
  const m = first[0].length;
  const D = first.map((row) => row.map((value) => value.re));
  const A = Array.from({ length: order }, (_, i) => Array.from({ length: order }, (_, j) => (i === j ? -1 : 0)));
  const B = Array.from({ length: order }, () => new Array(m).fill(0));
  const C = Array.from({ length: p }, () => new Array(order).fill(0));
  return { A, B, C, D, structure, order };
}

export default {
  computeFRFMIMO,
  fitMIMOFromFRF,
};
