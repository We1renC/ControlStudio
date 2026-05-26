/**
 * sylvester.js — Tier E2: Sylvester / Lyapunov / Stein equation solvers
 *
 * Solves:
 *   solveSylvester:    A X + X B = C            (continuous Sylvester)
 *   solveLyapunovCT:   A^T P + P A = -Q         (continuous Lyapunov)
 *   solveLyapunovDT:   A^T P A - P = -Q         (discrete Stein / Lyapunov)
 *
 * Implementation note: this version uses the vec-trick (Kronecker product
 * form) which is O(n^3 m^3) but extremely robust and avoids the realSchur
 * reordering quirks that affect general spectra. For the matrix sizes used in
 * ControlStudio (typically n, m <= 20) this gives sub-millisecond solves.
 *
 * Kronecker identities used:
 *   vec(A X B) = (B^T ⊗ A) vec(X)
 *   vec(A X)   = (I ⊗ A) vec(X)
 *   vec(X B)   = (B^T ⊗ I) vec(X)
 *
 * Sylvester:  A X + X B = C
 *   (I_m ⊗ A + B^T ⊗ I_n) vec(X) = vec(C)
 *   where vec stacks columns: vec(X)[j*n + i] = X[i][j]
 *
 * A future version may switch to a true Bartels-Stewart with a corrected
 * Schur reordering — kept open in functional-roadmap as a refinement task.
 */

import {
  matCreate, matMul, matTranspose, matSymmetrize, matSolve,
} from './matrix.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateSquare(M, name) {
  if (!Array.isArray(M) || M.length === 0) {
    throw new Error(`${name}: must be non-empty`);
  }
  const n = M.length;
  if (!Array.isArray(M[0]) || M[0].length !== n) {
    throw new Error(`${name}: must be square (got ${n}x${M[0]?.length ?? '?'})`);
  }
}

/**
 * Build the Sylvester coefficient matrix S = I_m ⊗ A + B^T ⊗ I_n
 * (column-major vec convention)
 *
 * Layout: vec(X)[j*n + i] = X[i][j]
 * S has rows/cols indexed by (i, j) flattened to j*n + i.
 *
 * (I_m ⊗ A)[(j*n+i), (l*n+k)] = I_m[j,l] * A[i,k] = (j==l) ? A[i,k] : 0
 * (B^T ⊗ I_n)[(j*n+i), (l*n+k)] = B^T[j,l] * I_n[i,k] = B[l,j] * (i==k ? 1 : 0)
 */
function buildSylvesterMatrix(A, B) {
  const n = A.length;
  const m = B.length;
  const N = n * m;
  const S = matCreate(N, N);
  // (I_m ⊗ A) block-diagonal: for each j in 0..m-1, place A in rows/cols [j*n..j*n+n-1]
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        S[j * n + i][j * n + k] += A[i][k];
      }
    }
  }
  // (B^T ⊗ I_n): for each (j, l), block (j*n..j*n+n-1, l*n..l*n+n-1) gets B[l,j] * I_n
  // i.e. S[j*n + i, l*n + i] += B[l][j]
  for (let j = 0; j < m; j++) {
    for (let l = 0; l < m; l++) {
      const bLJ = B[l][j];
      if (bLJ === 0) continue;
      for (let i = 0; i < n; i++) {
        S[j * n + i][l * n + i] += bLJ;
      }
    }
  }
  return S;
}

function vecColMajor(X) {
  const n = X.length;
  const m = X[0].length;
  const v = matCreate(n * m, 1);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      v[j * n + i][0] = X[i][j];
    }
  }
  return v;
}

function unvecColMajor(v, n, m) {
  const X = matCreate(n, m);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      X[i][j] = v[j * n + i][0];
    }
  }
  return X;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Solve A X + X B = C  via vec-trick.
 * Unique solution exists iff spectra of A and -B are disjoint.
 *
 * @param {number[][]} A  n x n
 * @param {number[][]} B  m x m
 * @param {number[][]} C  n x m
 * @returns {number[][]} X (n x m)
 */
export function solveSylvester(A, B, C) {
  validateSquare(A, 'A');
  validateSquare(B, 'B');
  if (!Array.isArray(C) || C.length === 0) throw new Error('C must be non-empty');
  const n = A.length;
  const m = B.length;
  if (C.length !== n || C[0].length !== m) {
    throw new Error(`C must be ${n}x${m}, got ${C.length}x${C[0]?.length ?? '?'}`);
  }

  const S = buildSylvesterMatrix(A, B);
  const rhs = vecColMajor(C);
  let vecX;
  try {
    vecX = matSolve(S, rhs);
  } catch (e) {
    throw new Error(`Sylvester unsolvable (A and -B likely share an eigenvalue): ${e.message}`);
  }
  // Finite check
  for (let i = 0; i < n * m; i++) {
    if (!Number.isFinite(vecX[i][0])) {
      throw new Error('Sylvester solution non-finite (A and -B likely share an eigenvalue)');
    }
  }
  return unvecColMajor(vecX, n, m);
}

/**
 * Continuous-time Lyapunov:  A^T P + P A = -Q
 * Reformulated as Sylvester:  (A^T) P + P (A) = -Q
 *
 * @param {number[][]} A  n x n
 * @param {number[][]} Q  n x n (typically symmetric PSD)
 * @returns {number[][]} P (symmetrised)
 */
export function solveLyapunovCT(A, Q) {
  validateSquare(A, 'A');
  validateSquare(Q, 'Q');
  if (Q.length !== A.length) throw new Error('Q must match A dimensions');
  const At = matTranspose(A);
  const negQ = Q.map((row) => row.map((v) => -v));
  const P = solveSylvester(At, A, negQ);
  return matSymmetrize(P);
}

/**
 * Discrete-time Lyapunov (Stein):  A^T P A - P = -Q
 *
 * vec form:  ((A^T ⊗ A^T) - I_{n²}) vec(P) = -vec(Q)
 *
 * @param {number[][]} A  n x n (stable: eigenvalues |λ| < 1)
 * @param {number[][]} Q  n x n
 * @returns {number[][]} P (symmetrised)
 */
export function solveLyapunovDT(A, Q) {
  validateSquare(A, 'A');
  validateSquare(Q, 'Q');
  const n = A.length;
  if (Q.length !== n) throw new Error('Q must match A dimensions');
  const N = n * n;
  const M = matCreate(N, N);
  const r = matCreate(N, 1);
  // vec column-major: vec(P)[j*n + i] = P[i][j]
  // vec(A^T P A) = (A^T ⊗ A^T) vec(P)
  // (A^T ⊗ A^T)[(j*n+i), (l*n+k)] = A^T[j,l] * A^T[i,k] = A[l][j] * A[k][i]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const rowIdx = j * n + i;
      for (let k = 0; k < n; k++) {
        for (let l = 0; l < n; l++) {
          const colIdx = l * n + k;
          M[rowIdx][colIdx] = A[l][j] * A[k][i];
        }
      }
      M[rowIdx][rowIdx] -= 1;            // subtract I
      r[rowIdx][0] = -Q[i][j];           // RHS: -vec(Q)
    }
  }
  let vecP;
  try {
    vecP = matSolve(M, r);
  } catch (e) {
    throw new Error(`Discrete Lyapunov unsolvable (A may have eigenvalue with |λ|=1): ${e.message}`);
  }
  const P = matCreate(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      P[i][j] = vecP[j * n + i][0];
    }
  }
  return matSymmetrize(P);
}
