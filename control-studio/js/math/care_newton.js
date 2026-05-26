/**
 * care_newton.js — Tier E1: Newton-CARE refinement
 *
 * Continuous Algebraic Riccati Equation (CARE):
 *   R(P) := A^T P + P A - P B R^-1 B^T P + Q = 0
 *
 * Newton's method linearises R(P) at P_k:
 *   R'(P_k)[ΔP] = (A - B R^-1 B^T P_k)^T ΔP + ΔP (A - B R^-1 B^T P_k)
 *
 * Newton step: solve the Lyapunov equation
 *   F_k^T ΔP + ΔP F_k = -R(P_k),  where  F_k = A - B R^-1 B^T P_k
 *
 * Then update P_{k+1} = P_k + ΔP.
 *
 * Properties:
 *   - Quadratic local convergence when P_k is close to the true stabilising P.
 *   - Each step requires solving a continuous Lyapunov equation (E2 dependency).
 *
 * Use as a refinement layer on top of Schur-CARE to push residual from
 * ~1e-8 down to ~1e-15.
 */

import {
  matCreate, matMul, matTranspose, matAdd, matSub, matInverse,
  matSymmetrize,
} from './matrix.js';
import { solveLyapunovCT } from './sylvester.js';

const NEWTON_TOL_DEFAULT = 1e-13;
const NEWTON_MAX_ITER = 20;

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateInputs(A, B, Q, R) {
  if (!Array.isArray(A) || A.length === 0) throw new Error('A non-empty required');
  const n = A.length;
  if (A[0].length !== n) throw new Error('A must be square');
  if (!Array.isArray(B) || B.length !== n) throw new Error(`B must have ${n} rows`);
  const m = B[0]?.length;
  if (!Number.isInteger(m) || m < 1) throw new Error('B must have >= 1 column');
  if (!Array.isArray(Q) || Q.length !== n || Q[0].length !== n) {
    throw new Error('Q must be n x n');
  }
  if (!Array.isArray(R) || R.length !== m || R[0].length !== m) {
    throw new Error(`R must be ${m} x ${m}`);
  }
  // Check B not all zero
  let allZero = true;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (B[i][j] !== 0) { allZero = false; break; }
    }
    if (!allZero) break;
  }
  if (allZero) throw new Error('B is zero matrix; CARE undefined (uncontrollable)');
}

/**
 * Compute the CARE residual:
 *   R(P) = A^T P + P A - P B R^-1 B^T P + Q
 */
function careResidual(P, A, B, Q, Rinv) {
  const At = matTranspose(A);
  const Bt = matTranspose(B);
  const AtP = matMul(At, P);
  const PA = matMul(P, A);
  const PB = matMul(P, B);
  const PBRinvBtP = matMul(matMul(PB, Rinv), matMul(Bt, P));
  // R = A'P + PA - P B R^-1 B' P + Q
  const term = matAdd(AtP, PA);
  const term2 = matSub(term, PBRinvBtP);
  const Rres = matAdd(term2, Q);
  return Rres;
}

function maxAbsMatrix(M) {
  let m = 0;
  for (const row of M) for (const v of row) m = Math.max(m, Math.abs(v));
  return m;
}

function approxIdentity(n, scale = 1) {
  const I = matCreate(n, n);
  for (let i = 0; i < n; i++) I[i][i] = scale;
  return I;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Solve / refine CARE via Newton iteration.
 *
 * @param {number[][]} A  n × n state matrix
 * @param {number[][]} B  n × m input matrix
 * @param {number[][]} Q  n × n state weight (symmetric PSD)
 * @param {number[][]} R  m × m input weight (symmetric PD)
 * @param {object} [opts]
 * @param {number[][]} [opts.P0]      Initial P; if absent, start from Q (poor but works).
 * @param {number}     [opts.maxIter=20]
 * @param {number}     [opts.tol=1e-13]
 * @returns {{ P, iter, residualNorm }}
 */
export function careNewton(A, B, Q, R, opts = {}) {
  validateInputs(A, B, Q, R);
  const n = A.length;
  const tol = opts.tol ?? NEWTON_TOL_DEFAULT;
  const maxIter = opts.maxIter ?? NEWTON_MAX_ITER;

  let P = opts.P0
    ? opts.P0.map((row) => row.slice())
    : Q.map((row) => row.slice());

  const Rinv = matInverse(R);
  const Bt = matTranspose(B);

  let res = careResidual(P, A, B, Q, Rinv);
  let resNorm = maxAbsMatrix(res);

  let iter = 0;
  while (iter < maxIter && resNorm > tol) {
    // F_k = A - B R^-1 B^T P
    const PB = matMul(P, B);
    const BRinvBtP = matMul(matMul(B, Rinv), matMul(Bt, P));
    const Fk = matSub(A, BRinvBtP);

    // Solve F_k^T ΔP + ΔP F_k = -R(P)
    // solveLyapunovCT solves A^T P + P A = -Q  → with A=F_k, Q=R(P), result is ΔP
    let dP;
    try {
      dP = solveLyapunovCT(Fk, res);
    } catch (e) {
      // F_k not stable (would mean P_k is far from solution)
      throw new Error(`Newton-CARE Lyapunov step failed at iter ${iter}: ${e.message}`);
    }

    // Update
    P = matSymmetrize(matAdd(P, dP));

    res = careResidual(P, A, B, Q, Rinv);
    resNorm = maxAbsMatrix(res);
    iter++;
  }

  return { P, iter, residualNorm: resNorm };
}

/**
 * Verify a candidate P satisfies CARE: returns ||R(P)||_inf
 */
export function verifyCARE(P, A, B, Q, R) {
  validateInputs(A, B, Q, R);
  const Rinv = matInverse(R);
  const res = careResidual(P, A, B, Q, Rinv);
  return maxAbsMatrix(res);
}
