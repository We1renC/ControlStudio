/**
 * matrix.js — Lightweight matrix operations for state-space models
 */

/**
 * Custom error for singular matrices so callers can wrap with
 * context-specific guidance (e.g. RGA, LQR, Lyapunov) instead of
 * leaking a raw "Singular matrix" string to the user.
 */
export class SingularMatrixError extends Error {
  constructor(message = 'Matrix is singular and cannot be inverted') {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

export function matCreate(rows, cols, fill = 0) {
  return Array.from({ length: rows }, () => new Array(cols).fill(fill));
}

export function matClone(A) {
  return A.map((row) => [...row]);
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

export function matTrace(A) {
  return A.reduce((sum, row, i) => sum + row[i], 0);
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

/**
 * Determinant with O(n³) LU fallback for n > 6.
 *
 * The recursive cofactor expansion is O(n!) and becomes impractically slow
 * beyond n=8 (~40 320 recursive calls for n=8, ~3.6M for n=10). For n ≤ 3
 * we use closed-form formulas; for 4 ≤ n ≤ 6 we keep cofactor expansion
 * (at most 720 calls); for n > 6 we use Gaussian elimination with partial
 * pivoting (O(n³)).
 */
export function matDet(A) {
  const n = A.length;
  if (n === 1) return A[0][0];
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (n === 3) {
    // Sarrus rule — faster than recursion
    return (A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
          - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
          + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]));
  }
  if (n > 6) return _matDetLU(A);   // O(n³) for large matrices
  // Cofactor expansion for 4 ≤ n ≤ 6 (at most 720 recursive calls total)
  let det = 0;
  for (let j = 0; j < n; j++) {
    const minor = A.slice(1).map(row => [...row.slice(0, j), ...row.slice(j + 1)]);
    det += (j % 2 === 0 ? 1 : -1) * A[0][j] * matDet(minor);
  }
  return det;
}

/**
 * LU determinant via Gaussian elimination with partial pivoting.
 * Accumulates the product of diagonal pivots; sign tracks row swaps.
 * @param {number[][]} A
 * @returns {number}
 */
function _matDetLU(A) {
  const n = A.length;
  const M = A.map(row => [...row]);   // clone — do not mutate input
  let sign = 1;
  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (maxRow !== i) {
      [M[i], M[maxRow]] = [M[maxRow], M[i]];
      sign = -sign;
    }
    if (Math.abs(M[i][i]) < 1e-15) return 0;  // singular
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j < n; j++) M[k][j] -= f * M[i][j];
    }
  }
  let det = sign;
  for (let i = 0; i < n; i++) det *= M[i][i];
  return det;
}

function matMaxAbs(A) {
  let max = 0;
  for (const row of A) {
    for (const value of row) max = Math.max(max, Math.abs(value));
  }
  return max;
}

function relativePivotTolerance(A, base = 1e-14) {
  const scale = matMaxAbs(A);
  return scale === 0 ? base : base * scale;
}

/** Matrix inverse via Gauss-Jordan (for small matrices) */
export function matInverse(A) {
  const n = A.length;
  const pivotTolerance = relativePivotTolerance(A);
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
    if (Math.abs(pivot) < pivotTolerance) throw new SingularMatrixError('Singular matrix');
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = aug[k][i];
      for (let j = 0; j < 2 * n; j++) aug[k][j] -= f * aug[i][j];
    }
  }
  return aug.map(row => row.slice(n));
}

/** Solve AX=B via Gauss-Jordan elimination (small dense systems). */
export function matSolve(A, B) {
  const n = A.length;
  const pivotTolerance = relativePivotTolerance(A);
  const rhs = Array.isArray(B[0]) ? B : B.map((value) => [value]);
  const m = rhs[0].length;
  const aug = A.map((row, i) => [...row, ...rhs[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    const pivot = aug[i][i];
    if (Math.abs(pivot) < pivotTolerance) throw new SingularMatrixError('Singular matrix');
    for (let j = i; j < n + m; j++) aug[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = aug[k][i];
      for (let j = i; j < n + m; j++) aug[k][j] -= f * aug[i][j];
    }
  }

  const out = aug.map((row) => row.slice(n));
  return Array.isArray(B[0]) ? out : out.map((row) => row[0]);
}

export function matKronecker(A, B) {
  const rows = A.length * B.length;
  const cols = A[0].length * B[0].length;
  const out = matCreate(rows, cols, 0);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[0].length; j++) {
      for (let r = 0; r < B.length; r++) {
        for (let c = 0; c < B[0].length; c++) {
          out[i * B.length + r][j * B[0].length + c] = A[i][j] * B[r][c];
        }
      }
    }
  }
  return out;
}

export function matSymmetrize(A) {
  return A.map((row, i) => row.map((value, j) => 0.5 * (value + A[j][i])));
}

/**
 * Matrix exponential via scaling-and-squaring + truncated Taylor series.
 * Accurate for small / moderate matrices; sufficient for control workbench use.
 */
export function matExp(A) {
  const n = A.length;
  // Infinity-norm of A
  let norm = 0;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let j = 0; j < n; j++) row += Math.abs(A[i][j]);
    if (row > norm) norm = row;
  }
  const k = norm < 1 ? 0 : Math.ceil(Math.log2(norm) + 1);
  const factor = 1 / Math.pow(2, k);
  const X = matScale(A, factor);
  // Taylor series for e^X with X scaled to have ||X|| < 1
  let result = matIdentity(n);
  let term = matIdentity(n);
  for (let i = 1; i <= 60; i++) {
    term = matScale(matMul(term, X), 1 / i);
    result = matAdd(result, term);
    let tnorm = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const v = Math.abs(term[r][c]);
        if (v > tnorm) tnorm = v;
      }
    }
    if (tnorm < 1e-18) break;
  }
  // Square k times to undo scaling
  for (let i = 0; i < k; i++) result = matMul(result, result);
  return result;
}

/** Calculate the rank of a matrix using Gaussian elimination */
export function matRank(A, tolerance = 1e-12) {
  if (!A || !A.length) return 0;
  const m = A.length, n = A[0].length;
  let rank = 0;
  const mat = A.map(row => [...row]);
  const scale = matMaxAbs(mat);
  const pivotTolerance = scale === 0 ? tolerance : tolerance * scale;
  
  for (let c = 0; c < n; c++) {
    let pivot = rank;
    for (let i = rank + 1; i < m; i++) {
      if (Math.abs(mat[i][c]) > Math.abs(mat[pivot][c])) pivot = i;
    }
    if (Math.abs(mat[pivot][c]) < pivotTolerance) continue;
    
    [mat[rank], mat[pivot]] = [mat[pivot], mat[rank]];
    
    const lead = mat[rank][c];
    for (let i = rank + 1; i < m; i++) {
      const f = mat[i][c] / lead;
      for (let j = c; j < n; j++) {
        mat[i][j] -= f * mat[rank][j];
      }
    }
    rank++;
    if (rank === m) break;
  }
  return rank;
}

export function matEigenvaluesSymmetric(A, tolerance = 1e-12, maxSweeps = 100) {
  const n = A.length;
  const M = matClone(matSymmetrize(A));

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const value = Math.abs(M[i][j]);
        if (value > max) {
          max = value;
          p = i;
          q = j;
        }
      }
    }
    if (max < tolerance) break;
    const theta = 0.5 * Math.atan2(2 * M[p][q], M[q][q] - M[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const app = c * c * M[p][p] - 2 * s * c * M[p][q] + s * s * M[q][q];
    const aqq = s * s * M[p][p] + 2 * s * c * M[p][q] + c * c * M[q][q];
    M[p][p] = app;
    M[q][q] = aqq;
    M[p][q] = 0;
    M[q][p] = 0;
    for (let k = 0; k < n; k++) {
      if (k === p || k === q) continue;
      const mkp = M[k][p];
      const mkq = M[k][q];
      M[k][p] = c * mkp - s * mkq;
      M[p][k] = M[k][p];
      M[k][q] = s * mkp + c * mkq;
      M[q][k] = M[k][q];
    }
  }

  return M.map((row, i) => row[i]).sort((a, b) => a - b);
}

export function matIsPositiveDefinite(A, tolerance = 1e-10) {
  const eigenvalues = matEigenvaluesSymmetric(A);
  const scale = matMaxAbs(A);
  const threshold = scale === 0 ? tolerance : tolerance * scale;
  return eigenvalues.every((value) => value > threshold);
}
