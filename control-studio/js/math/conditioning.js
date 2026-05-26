/**
 * conditioning.js — Tier E7: Condition number gating
 *
 * Provides:
 *   estimateCondition(A)             - 1-norm condition number estimate via LU + condest
 *   withConditionCheck(A, b, solveFn) - wrap any linear solve with kappa check + warning
 *   scaleAndSolve(A, b)              - apply diagonal scaling (equilibration) then solve
 *
 * Thresholds:
 *   kappa > 1e6  -> CAUTION  (loss of ~6 digits in IEEE 754)
 *   kappa > 1e10 -> SEVERE   (loss of ~10 digits, results probably unreliable)
 */

import {
  matClone, matInverse, matSolve, matIdentity, matCreate, matScale,
  SingularMatrixError,
} from './matrix.js';

export const CONDITION_WARN_THRESHOLD = 1e6;
export const CONDITION_SEVERE_THRESHOLD = 1e10;

/**
 * 1-norm of a matrix (max column sum of absolute values).
 */
function norm1(A) {
  const n = A.length;
  const m = A[0]?.length ?? 0;
  let max = 0;
  for (let j = 0; j < m; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.abs(A[i][j]);
    if (s > max) max = s;
  }
  return max;
}

/**
 * Validate a matrix is non-empty square (or at least rectangular with consistent rows).
 */
function validateMatrix(A) {
  if (!Array.isArray(A) || A.length === 0) {
    throw new Error('estimateCondition: matrix must be non-empty');
  }
  const cols = A[0]?.length;
  if (!Number.isInteger(cols) || cols === 0) {
    throw new Error('estimateCondition: matrix rows must be non-empty arrays');
  }
  for (const row of A) {
    if (!Array.isArray(row) || row.length !== cols) {
      throw new Error('estimateCondition: matrix must be rectangular (consistent row lengths)');
    }
  }
}

/**
 * Estimate condition number kappa_1(A) = ||A||_1 * ||A^-1||_1
 *
 * Uses direct inverse for matrices up to small size. For larger or singular
 * matrices, returns Infinity.
 *
 * @param {number[][]} A
 * @returns {number} kappa estimate (Infinity if singular)
 */
export function estimateCondition(A) {
  validateMatrix(A);
  const n = A.length;
  if (n !== A[0].length) {
    // non-square: use SVD-based for general; for now return Infinity to caller
    return Infinity;
  }
  if (n === 1) {
    return A[0][0] === 0 ? Infinity : 1;
  }
  const nA = norm1(A);
  let nAi;
  try {
    const Ainv = matInverse(A);
    nAi = norm1(Ainv);
  } catch (e) {
    if (e instanceof SingularMatrixError) return Infinity;
    throw e;
  }
  if (!Number.isFinite(nAi)) return Infinity;
  return nA * nAi;
}

/**
 * Classify a condition number into severity level.
 */
export function conditionSeverity(kappa) {
  if (!Number.isFinite(kappa)) return 'singular';
  if (kappa > CONDITION_SEVERE_THRESHOLD) return 'severe';
  if (kappa > CONDITION_WARN_THRESHOLD) return 'caution';
  return 'ok';
}

/**
 * Wrap a linear-solve operation with a pre-solve condition check.
 * Returns {x, kappa, warning} where warning is a string (or null).
 *
 * @param {number[][]} A
 * @param {number[][]} b
 * @param {()=>number[][]} solveFn callable that returns the actual solution
 */
export function withConditionCheck(A, b, solveFn) {
  const kappa = estimateCondition(A);
  const severity = conditionSeverity(kappa);
  let warning = null;
  if (severity === 'singular') {
    warning = 'Matrix is singular or numerically singular (kappa = Inf)';
  } else if (severity === 'severe') {
    warning = `Severe ill-conditioning: kappa = ${kappa.toExponential(2)} (>${CONDITION_SEVERE_THRESHOLD.toExponential(0)}). Results likely unreliable; consider scaling or regularization.`;
  } else if (severity === 'caution') {
    warning = `Caution: kappa = ${kappa.toExponential(2)} (>${CONDITION_WARN_THRESHOLD.toExponential(0)}). Some precision loss expected.`;
  }
  const x = solveFn();
  return { x, kappa, severity, warning };
}

/**
 * Equilibrate via simple row + column diagonal scaling (Ruiz / Sinkhorn-Knopp style, 1 sweep)
 * then solve. Returns {x, kappa_before, kappa_after}.
 *
 * Scaling:
 *   D_r[i] = 1 / sqrt(max_j |A[i][j]|)
 *   D_c[j] = 1 / sqrt(max_i |D_r[i] * A[i][j]|)
 *   A' = D_r * A * D_c
 *   b' = D_r * b
 *   solve A' x' = b' -> x = D_c * x'
 *
 * @param {number[][]} A
 * @param {number[][]} b
 * @param {object}     [opts]
 * @param {string}     [opts.method='Sinkhorn']  ('Sinkhorn'|'Ruiz')
 */
export function scaleAndSolve(A, b, opts = {}) {
  validateMatrix(A);
  const n = A.length;
  if (n !== A[0].length) throw new Error('scaleAndSolve requires square matrix');
  const kBefore = estimateCondition(A);

  // Row scaling
  const Dr = new Array(n);
  for (let i = 0; i < n; i++) {
    let maxAbs = 0;
    for (let j = 0; j < n; j++) {
      const v = Math.abs(A[i][j]);
      if (v > maxAbs) maxAbs = v;
    }
    Dr[i] = maxAbs > 0 ? 1 / Math.sqrt(maxAbs) : 1;
  }
  // Scaled A (row)
  const Arow = Array.from({ length: n }, (_, i) =>
    A[i].map((v) => v * Dr[i])
  );
  // Column scaling
  const Dc = new Array(n);
  for (let j = 0; j < n; j++) {
    let maxAbs = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.abs(Arow[i][j]);
      if (v > maxAbs) maxAbs = v;
    }
    Dc[j] = maxAbs > 0 ? 1 / Math.sqrt(maxAbs) : 1;
  }
  const Ascaled = Array.from({ length: n }, (_, i) =>
    Arow[i].map((v, j) => v * Dc[j])
  );
  // Scaled b
  const m = b[0].length;
  const bScaled = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, k) => b[i][k] * Dr[i])
  );
  // Solve
  const xScaled = matSolve(Ascaled, bScaled);
  // Unscale
  const x = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, k) => xScaled[i][k] * Dc[i])
  );
  const kAfter = estimateCondition(Ascaled);
  return { x, kappa_before: kBefore, kappa_after: kAfter };
}
