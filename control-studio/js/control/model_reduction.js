/**
 * model_reduction.js — Model Order Reduction for LTI State-Space Systems.
 *
 * Implements:
 *   1. minrealSS   — Kalman structural decomposition (P25-03)
 *      Removes uncontrollable and/or unobservable states via SVD-based
 *      rank tests on the controllability and observability Gramians.
 *
 *   2. balancedTruncation — Balanced Truncation MOR (P25-01)
 *      Computes balanced realisation via Gramian Cholesky + SVD, then
 *      retains the 'order' largest Hankel singular values.
 *      Error bound: ‖G − Ĝ‖∞ ≤ 2 · Σ σᵢ (i > order)
 */

import { computeSVD }        from '../math/svd.js';
import {
  matMul, matTranspose, matAdd, matSub, matScale,
  matIdentity, matInverse, matSolve, matSymmetrize,
} from '../math/matrix.js';
import { controllabilityMatrix, observabilityMatrix } from './state-space.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Solve continuous Lyapunov: A·X + X·Aᵀ + Q = 0  (Q symmetric ≥ 0). */
function solveLyapunov(A, Q) {
  const n = A.length;
  // Vectorise: (I⊗A + A⊗I) vec(X) = −vec(Q)
  // Build the (n²)×(n²) Kronecker system and solve with Gaussian elimination.
  const n2 = n * n;
  const M  = Array.from({ length: n2 }, () => new Array(n2).fill(0));
  const rhs = new Array(n2).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const row = i * n + j;
      rhs[row] = -Q[i][j];
      for (let k = 0; k < n; k++) {
        M[row][k * n + j] += A[i][k]; // I ⊗ A (row-major)
        M[row][i * n + k] += A[j][k]; // A ⊗ I
      }
    }
  }

  // Gaussian elimination with partial pivoting
  const aug = M.map((row, r) => [...row, rhs[r]]);
  for (let col = 0; col < n2; col++) {
    // Pivot
    let maxRow = col;
    for (let r = col + 1; r < n2; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-14) continue; // rank-deficient column
    for (let r = 0; r < n2; r++) {
      if (r === col) continue;
      const f = aug[r][col] / piv;
      for (let c = col; c <= n2; c++) aug[r][c] -= f * aug[col][c];
    }
  }

  const vecX = aug.map((row) => row[n2] / (Math.abs(row[row.indexOf(Math.max(...row.map(Math.abs)))])<1e-14 ? 1 : row[row.findIndex(v=>Math.abs(v)>1e-14)]));
  // Simpler back-substitute
  const sol = new Array(n2).fill(0);
  for (let r = n2 - 1; r >= 0; r--) {
    let s = aug[r][n2];
    for (let c = r + 1; c < n2; c++) s -= aug[r][c] * sol[c];
    sol[r] = Math.abs(aug[r][r]) > 1e-14 ? s / aug[r][r] : 0;
  }

  // Reshape sol → n×n matrix X
  const X = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => sol[i * n + j])
  );
  return matSymmetrize(X); // enforce symmetry
}

/** Cholesky decomposition: A = L·Lᵀ (A must be SPD, returns L lower-triangular). */
function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s < 0) s = 0; // clamp tiny negatives from floating-point noise
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = Math.abs(L[j][j]) > 1e-14 ? s / L[j][j] : 0;
      }
    }
  }
  return L;
}

/** Solve lower-triangular L·x = b (forward substitution). */
function forwardSolve(L, b) {
  const n = b.length;
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let j = 0; j < i; j++) s -= L[i][j] * x[j];
    x[i] = Math.abs(L[i][i]) > 1e-14 ? s / L[i][i] : 0;
  }
  return x;
}

/** Solve upper-triangular Lᵀ·x = b (backward substitution). */
function backSolve(L, b) {
  const n = b.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= L[j][i] * x[j]; // L[j][i] = Lᵀ[i][j]
    x[i] = Math.abs(L[i][i]) > 1e-14 ? s / L[i][i] : 0;
  }
  return x;
}

/**
 * Compute numeric matrix rank using SVD singular values.
 * @param {number[][]} A
 * @param {number} [tol]
 * @returns {number}
 */
function svdRank(A, tol = 1e-8) {
  const m = A.length, n = A[0].length;
  // SVD requires m >= n; transpose if needed
  let { S } = m >= n ? computeSVD(A) : computeSVD(matTranspose(A));
  const sigma0 = S[0] || 0;
  const thresh = tol * Math.max(m, n) * sigma0;
  return S.filter((s) => s > thresh).length;
}

// ---------------------------------------------------------------------------
// P25-03: Minimum Realisation via Kalman Structural Decomposition
// ---------------------------------------------------------------------------

/**
 * Compute the minimum realisation of a state-space system (A, B, C, D) by
 * removing uncontrollable and unobservable states using SVD-based rank tests
 * on the controllability and observability Gramians (or matrices).
 *
 * Algorithm:
 *   1. Compute Wc = controllability Gramian (or Kalman matrix if A unstable)
 *   2. SVD of Wc; retain states with σ > tol·σ_max → controllable subspace Tc
 *   3. Project: (A,B,C,D) → (Tc'·A·Tc, Tc'·B, C·Tc, D)
 *   4. Repeat for observability in the reduced system
 *   5. Return minimal (Ar, Br, Cr, D), the transformation T, and removed count
 *
 * @param {number[][]} A   - n×n state matrix
 * @param {number[][]} B   - n×nu input matrix
 * @param {number[][]} C   - ny×n output matrix
 * @param {number[][]} D   - ny×nu feedthrough matrix
 * @param {object} [opts]
 * @param {number} [opts.tol=1e-8]  - Relative SVD tolerance for rank test
 * @param {boolean} [opts.useGramian=true] - Use Gramian (true) or Kalman matrix (false)
 * @returns {{
 *   A: number[][], B: number[][], C: number[][], D: number[][],
 *   order: number,
 *   removedStates: number,
 *   isControllable: boolean,
 *   isObservable: boolean,
 *   controllableRank: number,
 *   observableRank: number,
 * }}
 */
export function minrealSS(A, B, C, D, opts = {}) {
  const tol        = opts.tol        ?? 1e-8;
  const useGramian = opts.useGramian ?? true;

  const n  = A.length;
  const nu = B[0].length;
  const ny = C.length;

  if (n === 0) return { A, B, C, D, order: 0, removedStates: 0,
    isControllable: true, isObservable: true, controllableRank: 0, observableRank: 0 };

  // ── Step 1: controllability rank ────────────────────────────────────────
  let Wc_mat;
  if (useGramian) {
    try {
      // Wc = solveLyapunov(A, B·Bᵀ): A·Wc + Wc·Aᵀ + B·Bᵀ = 0
      const BBt = matMul(B, matTranspose(B));
      Wc_mat = solveLyapunov(A, BBt);
    } catch {
      useGramian === false; // fall through to Kalman matrix
      Wc_mat = null;
    }
  }
  if (!Wc_mat) {
    // Fallback: use Kalman controllability matrix [B, AB, A²B, ...]
    const Ck = controllabilityMatrix(A, B);
    Wc_mat = matMul(Ck, matTranspose(Ck)); // approximate Gramian
  }

  // SVD of Wc to find controllable subspace
  let { U: Uc, S: Sc } = computeSVD(Wc_mat);
  const sigma0c  = Sc[0] || 0;
  const threshC  = tol * n * sigma0c;
  const rankC    = Sc.filter((s) => s > threshC).length;

  // Controllable subspace basis: columns 0..rankC-1 of Uc
  // Tc: n × rankC
  const Tc = Array.from({ length: n }, (_, i) =>
    Array.from({ length: rankC }, (_, j) => Uc[i][j])
  );

  // Project onto controllable subspace
  const TcT    = matTranspose(Tc);
  const A1 = rankC > 0 ? matMul(matMul(TcT, A), Tc) : [[]];
  const B1 = rankC > 0 ? matMul(TcT, B)              : [[]];
  const C1 = rankC > 0 ? matMul(C, Tc)               : [[]];
  const D1 = D;

  if (rankC === 0) {
    return { A: [[]], B: [[]], C: [[]], D: D1,
      order: 0, removedStates: n,
      isControllable: n === rankC, isObservable: false,
      controllableRank: 0, observableRank: 0 };
  }

  // ── Step 2: observability rank (on reduced system) ───────────────────────
  let Wo_mat;
  if (useGramian) {
    try {
      const CtC = matMul(matTranspose(C1), C1);
      Wo_mat = solveLyapunov(matTranspose(A1), CtC);
    } catch { Wo_mat = null; }
  }
  if (!Wo_mat) {
    const Ok = observabilityMatrix(A1, C1);
    Wo_mat = matMul(matTranspose(Ok), Ok);
  }

  let { U: Uo, S: So } = computeSVD(Wo_mat);
  const sigma0o  = So[0] || 0;
  const threshO  = tol * rankC * sigma0o;
  const rankO    = So.filter((s) => s > threshO).length;

  // Observable subspace basis: columns 0..rankO-1 of Uo
  const To = Array.from({ length: rankC }, (_, i) =>
    Array.from({ length: rankO }, (_, j) => Uo[i][j])
  );
  const ToT = matTranspose(To);

  const Ar = rankO > 0 ? matMul(matMul(ToT, A1), To) : [[]];
  const Br = rankO > 0 ? matMul(ToT, B1)              : [[]];
  const Cr = rankO > 0 ? matMul(C1, To)               : [[]];

  return {
    A: Ar, B: Br, C: Cr, D: D1,
    order: rankO,
    removedStates: n - rankO,
    isControllable: rankC === n,
    isObservable:   rankO === rankC,
    controllableRank: rankC,
    observableRank:   rankO,
  };
}

// ---------------------------------------------------------------------------
// P25-01: Balanced Truncation
// ---------------------------------------------------------------------------

/**
 * Balanced Truncation model order reduction for stable LTI systems.
 *
 * Algorithm (square-root method):
 *   1. Solve Gramians: A·Wc + Wc·Aᵀ + B·Bᵀ = 0
 *                      Aᵀ·Wo + Wo·A + Cᵀ·C  = 0
 *   2. Cholesky: Wc = Lc·Lc', Wo = Lo·Lo'
 *   3. SVD: Lc'·Lo = U·Σ·V'  →  Hankel singular values σᵢ = Σ[i]
 *   4. Balancing transformation: T = Lc·V·Σ^{-½}, T⁻¹ = Σ^{-½}·U'·Lo'
 *   5. Truncate to first 'order' states
 *   6. Error bound: ‖G − Ĝ‖∞ ≤ 2·Σᵢ₌ₒᵣdₑᵣ₊₁ⁿ σᵢ
 *
 * @param {number[][]} A   - n×n (must be stable: all eigenvalues Re<0)
 * @param {number[][]} B   - n×nu
 * @param {number[][]} C   - ny×n
 * @param {number[][]} D   - ny×nu
 * @param {number}     order - Desired reduced order (1 ≤ order < n)
 * @param {object}     [opts]
 * @param {number}     [opts.tol=1e-10] - Tolerance for Cholesky/SVD
 * @returns {{
 *   A: number[][], B: number[][], C: number[][], D: number[][],
 *   hsvd: number[],
 *   errorBound: number,
 *   order: number,
 * }}
 */
export function balancedTruncation(A, B, C, D, order, opts = {}) {
  const tol = opts.tol ?? 1e-10;
  const n   = A.length;

  if (order <= 0 || order >= n) {
    throw new Error(`balancedTruncation: order must be in [1, ${n - 1}], got ${order}`);
  }

  // ── Step 1: Solve Gramians ──────────────────────────────────────────────
  const BBt = matMul(B, matTranspose(B));
  const CtC = matMul(matTranspose(C), C);

  let Wc, Wo;
  try {
    Wc = solveLyapunov(A,               BBt);
    Wo = solveLyapunov(matTranspose(A), CtC);
  } catch (e) {
    throw new Error(`balancedTruncation: Gramian solve failed — system may be unstable or marginally stable. ${e.message}`);
  }

  // Symmetrise to counter floating-point drift
  Wc = matSymmetrize(Wc);
  Wo = matSymmetrize(Wo);

  // ── Step 2: Cholesky factors ────────────────────────────────────────────
  // Regularise diagonal slightly for numerical stability
  for (let i = 0; i < n; i++) {
    Wc[i][i] = Math.max(Wc[i][i], tol);
    Wo[i][i] = Math.max(Wo[i][i], tol);
  }
  const Lc = cholesky(Wc); // Wc = Lc · Lcᵀ
  const Lo = cholesky(Wo); // Wo = Lo · Loᵀ

  // ── Step 3: SVD of Lcᵀ · Lo ────────────────────────────────────────────
  const LcT   = matTranspose(Lc);
  const LcTLo = matMul(LcT, Lo);  // n×n
  const { U, S: hsvd, V } = computeSVD(LcTLo);

  // ── Step 4: Balancing transformation (square-root method) ───────────────
  // T  = Lc · V · Σ^{-½}   (n×n)
  // Ti = Σ^{-½} · Uᵀ · Loᵀ  (n×n)
  const sqrtSigmaInv = hsvd.map((s) => (s > tol ? 1.0 / Math.sqrt(s) : 0));

  // T columns: T[:,j] = Lc · V[:,j] · sqrtSigmaInv[j]
  const T = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const sInv = sqrtSigmaInv[j];
    for (let i = 0; i < n; i++) {
      let val = 0;
      for (let k = 0; k < n; k++) val += Lc[i][k] * V[k][j];
      T[i][j] = val * sInv;
    }
  }

  // Ti rows: Ti[j,:] = sqrtSigmaInv[j] · Uᵀ[j,:] · Loᵀ = sqrtSigmaInv[j] · Lo[:,U[:,j]] via Uᵀ
  // Ti = diag(sqrtSigmaInv) · Uᵀ · Loᵀ
  const LoT = matTranspose(Lo);
  const Ti = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const sInv = sqrtSigmaInv[j];
    for (let k = 0; k < n; k++) {
      let val = 0;
      for (let l = 0; l < n; l++) val += U[l][j] * LoT[l][k]; // Uᵀ[j,l] = U[l,j]
      Ti[j][k] = val * sInv;
    }
  }

  // ── Step 5: Truncate to first 'order' states ────────────────────────────
  // T1  = T[:,  0..order-1]   (n×order)
  // Ti1 = Ti[0..order-1, :]  (order×n)
  const T1 = Array.from({ length: n }, (_, i) =>
    Array.from({ length: order }, (_, j) => T[i][j])
  );
  const Ti1 = Array.from({ length: order }, (_, i) =>
    Array.from({ length: n }, (_, j) => Ti[i][j])
  );

  const Ar = matMul(matMul(Ti1, A), T1);
  const Br = matMul(Ti1, B);
  const Cr = matMul(C, T1);
  const Dr = D;

  // ── Step 6: Error bound ─────────────────────────────────────────────────
  const errorBound = 2 * hsvd.slice(order).reduce((s, v) => s + v, 0);

  return { A: Ar, B: Br, C: Cr, D: Dr, hsvd: Array.from(hsvd), errorBound, order };
}
