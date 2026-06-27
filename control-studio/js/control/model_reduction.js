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
  matEigenvaluesSymmetric, matTrace,
} from '../math/matrix.js';
import { estimateCondition } from '../math/conditioning.js';
import { polyroots } from '../math/polynomial.js';
import { solveLyapunovCT, solveLyapunovDT } from '../math/sylvester.js';
import { controllabilityMatrix, observabilityMatrix } from './state-space.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Solve continuous Lyapunov: A·X + X·Aᵀ + Q = 0  (Q symmetric ≥ 0). */
function solveLyapunov(A, Q) {
  return solveLyapunovCT(matTranspose(A), Q);
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

function validateStateSpaceDimensions(A, B, C) {
  const n = A.length;
  if (n === 0 || A.some((row) => !Array.isArray(row) || row.length !== n)) {
    throw new Error('Gramian diagnostics require a non-empty square A matrix');
  }
  if (B.length !== n || B.some((row) => !Array.isArray(row) || row.length === 0)) {
    throw new Error('Gramian diagnostics require B to have n non-empty rows');
  }
  const inputs = B[0].length;
  if (B.some((row) => row.length !== inputs)) {
    throw new Error('Gramian diagnostics require a rectangular B matrix');
  }
  if (!Array.isArray(C) || C.length === 0 || C.some((row) => !Array.isArray(row) || row.length !== n)) {
    throw new Error('Gramian diagnostics require C to have n columns');
  }
  for (const matrix of [A, B, C]) {
    if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
      throw new Error('Gramian diagnostics require finite matrix entries');
    }
  }
}

function characteristicPolynomial(A) {
  const n = A.length;
  const coefficients = [1];
  let Bk = matIdentity(n);
  for (let k = 1; k <= n; k++) {
    const AB = matMul(A, Bk);
    const coefficient = -matTrace(AB) / k;
    coefficients.push(coefficient);
    Bk = matAdd(AB, matScale(matIdentity(n), coefficient));
  }
  return coefficients;
}

function stateMatrixPoles(A) {
  return polyroots(characteristicPolynomial(A));
}

function frobeniusNorm(A) {
  return Math.sqrt(A.reduce(
    (sum, row) => sum + row.reduce((rowSum, value) => rowSum + value * value, 0),
    0,
  ));
}

function relativeResidual(residual, forcing) {
  return frobeniusNorm(residual) / Math.max(1, frobeniusNorm(forcing));
}

function hankelSingularValuesFromGramians(Wc, Wo, tol) {
  const n = Wc.length;
  const WcRegularized = matSymmetrize(Wc).map((row) => [...row]);
  const WoRegularized = matSymmetrize(Wo).map((row) => [...row]);
  for (let i = 0; i < n; i++) {
    WcRegularized[i][i] = Math.max(WcRegularized[i][i], tol);
    WoRegularized[i][i] = Math.max(WoRegularized[i][i], tol);
  }
  const Lc = cholesky(WcRegularized);
  const Lo = cholesky(WoRegularized);
  const { S } = computeSVD(matMul(matTranspose(Lc), Lo));
  return Array.from(S).sort((a, b) => b - a);
}

/**
 * Compute continuous- or discrete-time controllability/observability Gramians
 * and Hankel singular values from the exact Lyapunov/Stein equations.
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {number[][]} C
 * @param {number[][]} D
 * @param {{domain?: 'continuous'|'discrete', tolerance?: number}} [opts]
 * @returns {{
 *   Wc:number[][], Wo:number[][], wcEigenvalues:number[], woEigenvalues:number[],
 *   wcTrace:number, woTrace:number, wcCondition:number, woCondition:number,
 *   hsv:number[], hsvSum:number, poles:Array<{re:number,im:number}>,
 *   controllabilityResidual:number, observabilityResidual:number, domain:string
 * }}
 */
export function gramianDiagnostics(A, B, C, D = [[0]], opts = {}) {
  validateStateSpaceDimensions(A, B, C);
  const domain = opts.domain ?? 'continuous';
  const tolerance = opts.tolerance ?? 1e-10;
  if (!['continuous', 'discrete'].includes(domain)) {
    throw new Error("Gramian diagnostics domain must be 'continuous' or 'discrete'");
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('Gramian diagnostics tolerance must be finite and positive');
  }

  const poles = stateMatrixPoles(A);
  const stable = domain === 'continuous'
    ? poles.every((pole) => pole.re < -tolerance)
    : poles.every((pole) => Math.hypot(pole.re, pole.im) < 1 - tolerance);
  if (!stable) {
    throw new Error(
      `Gramian diagnostics require a ${domain === 'continuous' ? 'Hurwitz' : 'Schur-stable'} A matrix`,
    );
  }

  const At = matTranspose(A);
  const BBt = matMul(B, matTranspose(B));
  const CtC = matMul(matTranspose(C), C);
  let Wc;
  let Wo;
  let controllabilityEquation;
  let observabilityEquation;
  if (domain === 'continuous') {
    Wc = solveLyapunovCT(At, BBt);
    Wo = solveLyapunovCT(A, CtC);
    controllabilityEquation = matAdd(matAdd(matMul(A, Wc), matMul(Wc, At)), BBt);
    observabilityEquation = matAdd(matAdd(matMul(At, Wo), matMul(Wo, A)), CtC);
  } else {
    Wc = solveLyapunovDT(At, BBt);
    Wo = solveLyapunovDT(A, CtC);
    controllabilityEquation = matSub(matAdd(matMul(matMul(A, Wc), At), BBt), Wc);
    observabilityEquation = matSub(matAdd(matMul(matMul(At, Wo), A), CtC), Wo);
  }

  Wc = matSymmetrize(Wc);
  Wo = matSymmetrize(Wo);
  const wcEigenvalues = matEigenvaluesSymmetric(Wc).sort((a, b) => b - a);
  const woEigenvalues = matEigenvaluesSymmetric(Wo).sort((a, b) => b - a);
  const scale = Math.max(
    1,
    ...wcEigenvalues.map(Math.abs),
    ...woEigenvalues.map(Math.abs),
  );
  if (wcEigenvalues.some((value) => value < -tolerance * scale)
      || woEigenvalues.some((value) => value < -tolerance * scale)) {
    throw new Error('Gramian diagnostics produced a non-positive-semidefinite Gramian');
  }

  const hsv = hankelSingularValuesFromGramians(Wc, Wo, tolerance);
  return {
    Wc,
    Wo,
    wcEigenvalues,
    woEigenvalues,
    wcTrace: matTrace(Wc),
    woTrace: matTrace(Wo),
    wcCondition: estimateCondition(Wc),
    woCondition: estimateCondition(Wo),
    hsv,
    hsvSum: hsv.reduce((sum, value) => sum + value, 0),
    poles,
    controllabilityResidual: relativeResidual(controllabilityEquation, BBt),
    observabilityResidual: relativeResidual(observabilityEquation, CtC),
    domain,
  };
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
 *   3. SVD: Lo'·Lc = U·Σ·V'  →  Hankel singular values σᵢ = Σ[i]
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

  // ── Step 3: SVD of Loᵀ · Lc ────────────────────────────────────────────
  // For LoᵀLc = UΣVᵀ, the square-root balancing maps are
  // T = Lc V Σ^-1/2 and T^-1 = Σ^-1/2 Uᵀ Loᵀ.
  const LoT   = matTranspose(Lo);
  const LoTLc = matMul(LoT, Lc);  // n×n
  const { U, S: hsvd, V } = computeSVD(LoTLc);

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

// ══════════════════════════════════════════════════════════════════════════════
// P25-02: Balanced Truncation Error Audit
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Solve the Sylvester equation  A·X + X·B = C
 * where A is n×n, B is m×m, X and C are n×m.
 *
 * Uses Kronecker vectorisation:  (I_m ⊗ A + Bᵀ ⊗ I_n) vec(X) = vec(C)
 * followed by Gaussian elimination with partial pivoting.
 */
function solveSylvester(A, B, C) {
  const n = A.length;
  const m = B.length;
  const nm = n * m;

  // Build (I_m ⊗ A + Bᵀ ⊗ I_n) in column-major index ordering:
  //   X[i,j]  ↔  index  j*n + i
  const M   = Array.from({ length: nm }, () => new Array(nm).fill(0));
  const rhs = new Array(nm).fill(0);

  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const row = j * n + i;
      rhs[row]  = C[i][j];
      // I_m ⊗ A  → A[i,k] contributes to M[j*n+i][j*n+k]
      for (let k = 0; k < n; k++) M[row][j * n + k] += A[i][k];
      // Bᵀ ⊗ I_n → B[l,j] contributes to M[j*n+i][l*n+i]
      for (let l = 0; l < m; l++) M[row][l * n + i] += B[l][j];
    }
  }

  const aug = M.map((row, r) => [...row, rhs[r]]);
  for (let col = 0; col < nm; col++) {
    let maxRow = col;
    for (let r = col + 1; r < nm; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-14) continue;
    for (let r = 0; r < nm; r++) {
      if (r === col) continue;
      const f = aug[r][col] / piv;
      for (let c = col; c <= nm; c++) aug[r][c] -= f * aug[col][c];
    }
  }

  // Reshape vec(X) → n×m (column-major: X[i,j] = aug[j*n+i] solution)
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      const r = j * n + i;
      return Math.abs(aug[r][r]) > 1e-14 ? aug[r][nm] / aug[r][r] : 0;
    })
  );
}

/**
 * Compute the Hankel norm of a stable LTI system via Gramian SVD.
 * ‖G‖_H = σ_max(Lc^T · Lo)  where Wc = Lc Lc^T, Wo = Lo Lo^T (Cholesky).
 */
function _hankelNormFromGramians(Wc, Wo, tol = 1e-10) {
  return hankelSingularValuesFromGramians(Wc, Wo, tol)[0] ?? 0;
}

/**
 * Compute Hankel singular values of a stable LTI system (A, B, C, D).
 *
 * The Hankel singular values are the square roots of the eigenvalues of
 * Wc · Wo, where Wc and Wo are the controllability and observability Gramians.
 * Equivalently, they are the singular values of Lc^T · Lo.
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {number[][]} C
 * @param {number[][]} D  (unused — included for API consistency)
 * @param {object}    [opts]
 * @param {number}   [opts.tol=1e-10]
 * @returns {number[]}  HSVs sorted descending.
 */
export function hankelSingularValues(A, B, C, D, opts = {}) {
  const tol = opts.tol ?? 1e-10;
  const BBt = matMul(B, matTranspose(B));
  const CtC = matMul(matTranspose(C), C);
  let Wc = solveLyapunov(A,               BBt);
  let Wo = solveLyapunov(matTranspose(A), CtC);
  Wc = matSymmetrize(Wc);
  Wo = matSymmetrize(Wo);
  return hankelSingularValuesFromGramians(Wc, Wo, tol);
}

/**
 * Hankel norm of a stable LTI system — the largest Hankel singular value.
 *
 * ‖G‖_H = σ₁(Wc, Wo)
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {number[][]} C
 * @param {number[][]} D
 * @param {object}    [opts]
 * @returns {number}
 */
export function hankelNorm(A, B, C, D, opts = {}) {
  return hankelSingularValues(A, B, C, D, opts)[0] ?? 0;
}

/**
 * Audit the Hankel- and H-infinity-error contracts of an order-k balanced
 * truncation model.
 *
 * Balanced truncation is not the Glover optimal Hankel-norm approximation.
 * The AAK/Glover theorem makes σ_{k+1} a lower bound on every order-k
 * approximation error in Hankel norm. Balanced truncation instead guarantees
 * the H-infinity upper bound 2·Σ_{i>k}σ_i. The actual Hankel norm of the
 * balanced-truncation error system is computed from its Gramians.
 *
 * Contracts:
 *   σ_{k+1} ≤ ‖G − G_bt‖_H ≤ ‖G − G_bt‖_∞
 *   ‖G − G_bt‖_∞ ≤ 2·Σᵢ₌ₖ₊₁ⁿ σᵢ
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {number[][]} C
 * @param {number[][]} D
 * @param {number}     k    Desired reduced order (1 ≤ k < n).
 * @param {object}    [opts]
 * @param {number}   [opts.tol=1e-10]
 * @returns {{
 *   A: number[][], B: number[][], C: number[][], D: number[][],
 *   hsvd: number[],
 *   hankelNormError: number,
 *   hankelLowerBound: number,
 *   hankelNormBound: number,
 *   hankelNormBoundType: 'lower',
 *   hankelOptimalityGap: number,
 *   hinfErrorBound: number,
 *   lowerBoundSatisfied: boolean,
 *   hinfUpperBoundSatisfied: boolean,
 *   order: number,
 *   method: string,
 *   algorithm: string,
 *   isOptimalHankelApproximation: boolean,
 * }}
 */
export function balancedTruncationErrorAudit(A, B, C, D, k, opts = {}) {
  const tol = opts.tol ?? 1e-10;
  const n   = A.length;

  if (k <= 0 || k >= n) {
    throw new Error(`balancedTruncationErrorAudit: k must be in [1, ${n - 1}], got ${k}`);
  }

  // ── Step 1: Balanced truncation for state matrices ──────────────────────
  const bt = balancedTruncation(A, B, C, D, k, { tol });
  const { A: Ar, B: Br, C: Cr, D: Dr, hsvd } = bt;

  // σ_{k+1} — AAK/Glover lower bound for every order-k approximation.
  const sigma_kp1 = hsvd[k];

  // ── Step 2: Build error system (G − Ĝ) and solve its Lyapunov equations ──
  // Error system: A_E = blkdiag(A, Ar),  B_E = [B; Br],  C_E = [C, −Cr]
  const nr = k;           // reduced order
  const ne = n + nr;      // error system order
  const m  = B[0].length;
  const p  = C.length;

  const AE = Array.from({ length: ne }, (_, i) =>
    Array.from({ length: ne }, (_, j) => {
      if (i < n  && j < n)  return A[i][j];
      if (i >= n && j >= n) return Ar[i - n][j - n];
      return 0;
    })
  );
  const BE = Array.from({ length: ne }, (_, i) =>
    i < n ? [...B[i]] : [...Br[i - n]]
  );
  const CE = C.map((row, i) =>
    [...row, ...((Cr[i] ?? []).map(v => -v))]
  );

  const BEBEt = matMul(BE, matTranspose(BE));
  const CEtCE = matMul(matTranspose(CE), CE);

  let WcE = matSymmetrize(solveLyapunov(AE,                BEBEt));
  let WoE = matSymmetrize(solveLyapunov(matTranspose(AE),  CEtCE));
  for (let i = 0; i < ne; i++) {
    WcE[i][i] = Math.max(WcE[i][i], tol);
    WoE[i][i] = Math.max(WoE[i][i], tol);
  }

  // Hankel norm of error = σ_max(Lc_E^T · Lo_E)
  const hankelNormError = _hankelNormFromGramians(WcE, WoE, tol);

  // ── Step 3: H∞ error bound (same as balanced truncation) ────────────────
  const hinfErrorBound = bt.errorBound;
  const comparisonScale = Math.max(1, hankelNormError, sigma_kp1, hinfErrorBound);
  const comparisonTol = Math.max(tol, Math.sqrt(Number.EPSILON)) * comparisonScale;
  const lowerBoundSatisfied = hankelNormError + comparisonTol >= sigma_kp1;
  const hinfUpperBoundSatisfied = hankelNormError <= hinfErrorBound + comparisonTol;

  return {
    A: Ar,
    B: Br,
    C: Cr,
    D: Dr,
    hsvd,
    hankelNormError,
    hankelLowerBound: sigma_kp1,
    // Compatibility alias. This is explicitly a lower bound, not an upper bound.
    hankelNormBound: sigma_kp1,
    hankelNormBoundType: 'lower',
    hankelOptimalityGap: Math.max(0, hankelNormError - sigma_kp1),
    hinfErrorBound,
    lowerBoundSatisfied,
    hinfUpperBoundSatisfied,
    order:  k,
    method: 'balanced-truncation-error-audit',
    algorithm: 'balanced-truncation',
    isOptimalHankelApproximation: false,
  };
}

/**
 * Backward-compatible alias for the former P25 API.
 *
 * This function performs balanced truncation plus an error audit. It does not
 * implement Glover's optimal Hankel-norm approximation.
 */
export function hankelNormApprox(A, B, C, D, k, opts = {}) {
  return balancedTruncationErrorAudit(A, B, C, D, k, opts);
}
