/**
 * polytopic_stability.js — Quadratic stability for polytopic uncertainty
 * (Bernussou-Geromel-Peres, Boyd-El Ghaoui-Feron-Balakrishnan).
 *
 * Loop 13 (Zero-Flaw) addition.
 *
 * Setup: uncertain LTI system ẋ = A(α) x where
 *   A(α) = Σ_i α_i A_i,   α_i ≥ 0,   Σ_i α_i = 1
 * is a convex combination of vertex matrices A_i, i = 1, ..., L.
 *
 * Quadratic stability (Boyd-Vandenberghe §10.7):
 *   The polytopic system is *quadratically stable* iff there exists a
 *   common P ≻ 0 such that for *every* vertex A_i,
 *     A_i^T P + P A_i ≺ 0.
 *
 * Quadratic stabilisation (extends to ẋ = A(α) x + B u with state feedback
 * u = K x, then A_i + B_i K shares a common Lyapunov function):
 *   The closed-loop polytope is quadratically stable iff for every vertex i,
 *     (A_i + B_i K)^T P + P (A_i + B_i K) ≺ 0.
 *
 * The implementation uses the existing logdet-barrier LMI solver to find
 * (P, λ) feasible for each vertex constraint stacked together.
 *
 * Reference:
 *   - Bernussou, Geromel, Peres, "A linear programming oriented procedure
 *     for quadratic stabilization of uncertain systems", Sys. & Ctrl.
 *     Letters 13 (1989).
 *   - Boyd, El Ghaoui, Feron, Balakrishnan, "Linear Matrix Inequalities in
 *     System and Control Theory", SIAM 1994.
 *   - Skogestad, Postlethwaite, "Multivariable Feedback Control" §8.8.
 */

import {
  matAdd, matMul, matTranspose, matIdentity, matCreate, matSymmetrize,
  matEigenvaluesSymmetric,
} from '../math/matrix.js';
import { lmiFeasibility } from '../optimization/lmi_solver.js';

function ensureSquareList(matrices, label) {
  if (!Array.isArray(matrices) || matrices.length === 0) {
    throw new Error(`${label}: expected non-empty list`);
  }
  const n = matrices[0].length;
  for (const M of matrices) {
    if (M.length !== n || M.some((row) => row.length !== n)) {
      throw new Error(`${label}: all matrices must be square ${n}×${n}`);
    }
  }
  return n;
}

/**
 * Test polytopic quadratic stability: find P ≻ 0 such that
 *   A_i^T P + P A_i ≺ 0 for every vertex i.
 *
 * Returns { stable, P, residual } where residual is the maximum eigenvalue
 * across all vertex LMIs.
 */
export function polytopicQuadraticStability(vertexAs, options = {}) {
  const n = ensureSquareList(vertexAs, 'polytopic: A_i');
  const L = vertexAs.length;
  // Symmetric basis for P (n×n).
  const symBasis = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const E = matCreate(n, n, 0);
      if (i === j) E[i][i] = 1;
      else { E[i][j] = 1; E[j][i] = 1; }
      symBasis.push(E);
    }
  }
  const nSym = symBasis.length;

  // Block-diagonal LMI: P − I ⪰ 0  +  for each vertex: −(A_i^T P + P A_i) − I ⪰ 0.
  const blockSize = n + L * n;
  const F0 = matCreate(blockSize, blockSize, 0);
  for (let i = 0; i < n; i++) F0[i][i] = -1;          // P − I block, constant −I
  for (let v = 0; v < L; v++) {
    for (let i = 0; i < n; i++) F0[n + v * n + i][n + v * n + i] = -1;   // −I per vertex
  }
  const Fs = symBasis.map((E) => {
    const F = matCreate(blockSize, blockSize, 0);
    // P block: +E
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F[i][j] = E[i][j];
    // vertex blocks: −(A_v^T E + E A_v)
    for (let v = 0; v < L; v++) {
      const AtE = matMul(matTranspose(vertexAs[v]), E);
      const EA = matMul(E, vertexAs[v]);
      const sum = matAdd(AtE, EA);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        F[n + v * n + i][n + v * n + j] = -sum[i][j];
      }
    }
    return F;
  });

  let res;
  try {
    res = lmiFeasibility(F0, Fs, { maxIter: options.maxIter ?? 100 });
  } catch (e) {
    // LMI inner solver may hit singularity when the system is genuinely
    // infeasible; return P = I as nominal fallback so the residual check
    // can still report worst-case eigenvalue.
    res = { feasible: false, x: new Array(nSym).fill(0).map((_, k) => k < n ? 1 : 0), lambdaMin: NaN };
  }

  // Recover P from x.
  const P = matCreate(n, n, 0);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      P[i][j] += res.x[idx];
      if (i !== j) P[j][i] += res.x[idx];
      idx++;
    }
  }
  // Authoritative residual: largest eigenvalue across vertex LMIs (≤ 0 ⇒ stable).
  let worst = -Infinity;
  for (const Av of vertexAs) {
    const M = matAdd(matMul(matTranspose(Av), P), matMul(P, Av));
    const eigs = matEigenvaluesSymmetric(matSymmetrize(M));
    const worstHere = Math.max(...eigs);
    if (worstHere > worst) worst = worstHere;
  }
  return {
    stable: worst <= 1e-6,
    feasible: res.feasible,
    P,
    residual: worst,
  };
}
