/**
 * qz_descriptor.js - Tier E3: descriptor-system generalized eigenvalue baseline.
 */

import { matInverse, matMul } from './matrix.js';

function det2(A) {
  return A[0][0] * A[1][1] - A[0][1] * A[1][0];
}

function eig2(A) {
  const tr = A[0][0] + A[1][1];
  const det = det2(A);
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const root = Math.sqrt(disc);
    return [{ re: (tr + root) / 2, im: 0 }, { re: (tr - root) / 2, im: 0 }];
  }
  return [{ re: tr / 2, im: Math.sqrt(-disc) / 2 }, { re: tr / 2, im: -Math.sqrt(-disc) / 2 }];
}

export function generalizedEigenvalues(E, A) {
  if (E.length !== A.length || E[0].length !== A[0].length) {
    throw new Error('generalizedEigenvalues requires equal-size square matrices');
  }
  if (E.length === 1) {
    return [Math.abs(E[0][0]) < 1e-14 ? { re: Infinity, im: 0, infinite: true } : { re: A[0][0] / E[0][0], im: 0 }];
  }
  if (E.length !== 2) throw new Error('baseline generalized eigen solver supports 1x1 and 2x2 pencils');
  if (Math.abs(det2(E)) > 1e-14) return eig2(matMul(matInverse(E), A));

  // Singular descriptor pencil: solve det(A - lambda E) = 0.
  const a = det2(E);
  const b = -(A[0][0] * E[1][1] + E[0][0] * A[1][1] - A[0][1] * E[1][0] - E[0][1] * A[1][0]);
  const c = det2(A);
  if (Math.abs(a) < 1e-14 && Math.abs(b) < 1e-14) return [{ re: Infinity, im: 0, infinite: true }, { re: Infinity, im: 0, infinite: true }];
  const finite = { re: -c / b, im: 0 };
  return [finite, { re: Infinity, im: 0, infinite: true }];
}

export function descriptorCanonicalForm(E, A) {
  return {
    T: E.map((row) => row.slice()),
    S: A.map((row) => row.slice()),
    Q: E.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))),
    Z: E.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))),
    eigenvalues: generalizedEigenvalues(E, A),
  };
}

export default { generalizedEigenvalues, descriptorCanonicalForm };
