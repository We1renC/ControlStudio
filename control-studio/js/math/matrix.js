/**
 * matrix.js — Lightweight matrix operations for state-space models
 */

export function matCreate(rows, cols, fill = 0) {
  return Array.from({ length: rows }, () => new Array(cols).fill(fill));
}

export function matIdentity(n) {
  const m = matCreate(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}

export function matAdd(A, B) {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function matSub(A, B) {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

export function matMul(A, B) {
  const m = A.length, n = B[0].length, p = B.length;
  const C = matCreate(m, n);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < p; k++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

export function matScale(A, s) {
  return A.map(row => row.map(v => v * s));
}

export function matTranspose(A) {
  return A[0].map((_, j) => A.map(row => row[j]));
}

export function matVecMul(A, v) {
  return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}

export function vecAdd(a, b) {
  return a.map((v, i) => v + b[i]);
}

export function vecScale(v, s) {
  return v.map(x => x * s);
}

/** Determinant (recursive, for small matrices) */
export function matDet(A) {
  const n = A.length;
  if (n === 1) return A[0][0];
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
  let det = 0;
  for (let j = 0; j < n; j++) {
    const minor = A.slice(1).map(row => [...row.slice(0, j), ...row.slice(j + 1)]);
    det += (j % 2 === 0 ? 1 : -1) * A[0][j] * matDet(minor);
  }
  return det;
}

/** Matrix inverse via Gauss-Jordan (for small matrices) */
export function matInverse(A) {
  const n = A.length;
  const aug = A.map((row, i) => {
    const id = new Array(n).fill(0);
    id[i] = 1;
    return [...row, ...id];
  });
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++)
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    const pivot = aug[i][i];
    if (Math.abs(pivot) < 1e-14) throw new Error('Singular matrix');
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = aug[k][i];
      for (let j = 0; j < 2 * n; j++) aug[k][j] -= f * aug[i][j];
    }
  }
  return aug.map(row => row.slice(n));
}
