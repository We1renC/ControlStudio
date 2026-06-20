/**
 * adp_lqr.js — Approximate Dynamic Programming / Q-iteration LQR.
 *
 * Loop 10 (Zero-Flaw) addition. Model-free policy iteration for
 * discrete-time LQR using Q-function parameterisation (Bradtke-Barto 1994,
 * Lewis-Vamvoudakis 2009).
 *
 * Discrete-time LQR: x_{k+1} = A x_k + B u_k. Cost J = Σ x^T Q x + u^T R u.
 * Optimal policy u = -K* x with K* = (R + B^T P* B)^{-1} B^T P* A,
 * P* satisfies DARE.
 *
 * Q-function under policy u = -K x:
 *   Q^K(x, u) = [x; u]^T H^K [x; u]
 *   where H^K = [[Q + A^T P^K A,    A^T P^K B],
 *                [B^T P^K A,         R + B^T P^K B]]
 *   P^K solves the Lyapunov equation (A − BK)^T P (A − BK) + Q + K^T R K = P.
 *
 * Policy iteration alternates:
 *   1. Policy evaluation: solve for H^K via least squares on collected
 *      (x, u) trajectory samples.
 *   2. Policy improvement: K_{new} = H_{uu}^{-1} H_{ux}.
 *
 * For verification we provide the deterministic, model-knowing oracle
 * variant of policy iteration (Lewis §3) so the convergence to K* is exact
 * up to numerical precision.
 *
 * Reference:
 *   - Bradtke, "Reinforcement learning applied to linear quadratic
 *     regulation", NeurIPS 1992.
 *   - Lewis, Vamvoudakis, "Reinforcement learning for partially observable
 *     dynamic processes", IEEE TSMC 41(1), 2011.
 *   - Sutton, Barto, "Reinforcement Learning: An Introduction", §10 (LQR).
 */

import {
  matAdd, matMul, matSub, matTranspose, matInverse, matIdentity, matCreate,
} from '../math/matrix.js';

/**
 * Solve discrete Lyapunov equation A^T P A − P + Q = 0  for P (A is Schur).
 * Implementation: iterate P_{n+1} = A^T P_n A + Q until contraction.
 */
function discreteLyapunov(A, Q, options = {}) {
  const tol = options.tol ?? 1e-12;
  const maxIter = options.maxIter ?? 500;
  let P = Q.map((row) => row.slice());
  for (let it = 0; it < maxIter; it++) {
    const next = matAdd(matMul(matTranspose(A), matMul(P, A)), Q);
    let diff = 0;
    for (let i = 0; i < P.length; i++)
      for (let j = 0; j < P.length; j++)
        diff = Math.max(diff, Math.abs(next[i][j] - P[i][j]));
    P = next;
    if (diff < tol) return P;
  }
  throw new Error('ADP: discrete Lyapunov iteration did not converge (A likely not Schur)');
}

/**
 * Discrete-time policy iteration LQR.
 * Requires initial *stabilising* gain K0; iterates evaluation/improvement
 * until convergence.
 */
export function policyIterationLQR(A, B, Q, R, K0, options = {}) {
  const maxIter = options.maxIter ?? 50;
  const tol = options.tol ?? 1e-10;
  let K = K0.map((row) => row.slice());
  const history = [];
  for (let it = 0; it < maxIter; it++) {
    const Acl = matSub(A, matMul(B, K));
    const KtRK = matMul(matTranspose(K), matMul(R, K));
    const QK = matAdd(Q, KtRK);
    const P = discreteLyapunov(Acl, QK);
    // Improvement
    const BtPA = matMul(matTranspose(B), matMul(P, A));
    const BtPB = matMul(matTranspose(B), matMul(P, B));
    const Hu_u = matAdd(R, BtPB);
    const HuuInv = matInverse(Hu_u);
    const Knew = matMul(HuuInv, BtPA);
    let diff = 0;
    for (let i = 0; i < Knew.length; i++)
      for (let j = 0; j < Knew[0].length; j++)
        diff = Math.max(diff, Math.abs(Knew[i][j] - K[i][j]));
    history.push({ iter: it, K, P, deltaK: diff });
    K = Knew;
    if (diff < tol) break;
  }
  return { K, history };
}

/**
 * Q-function least-squares evaluation given (x_k, u_k, x_{k+1}) tuples.
 * This is the data-driven step: at convergence H satisfies the Bellman
 * equation H = (stage cost) + γ E[Q(x', u')]. With γ = 1 and known terminal
 * cost zero we form the normal equations.
 *
 * Returns the symmetric H matrix.
 */
export function qFunctionLeastSquares(data, Q, R) {
  if (!Array.isArray(data) || data.length === 0) throw new Error('ADP-LSTD: data required');
  const n = data[0].x.length;
  const m = data[0].u.length;
  const dim = n + m;
  // Build basis: vec( upper-triangular(H) ) parameterisation.
  // For verification simplicity, we solve via direct ridge regression on H
  // entries. The Bellman residual to minimise:
  //   r_k = [x;u]^T H [x;u] − stage − [x';u']^T H [x';u']
  // where stage = x^T Q x + u^T R u and u' = -K x' under fixed policy K is
  // assumed inside the data tuple as `data[k].uNext`.

  const nParams = (dim * (dim + 1)) / 2;
  const Phi = matCreate(data.length, nParams, 0);
  const y = new Array(data.length).fill(0);
  for (let k = 0; k < data.length; k++) {
    const xu = data[k].x.concat(data[k].u);
    const xuNext = data[k].xNext.concat(data[k].uNext);
    let idx = 0;
    for (let i = 0; i < dim; i++) {
      for (let j = i; j < dim; j++) {
        const fac = (i === j) ? 1 : 2;
        Phi[k][idx] = fac * (xu[i] * xu[j] - xuNext[i] * xuNext[j]);
        idx++;
      }
    }
    // Stage cost
    let stage = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        stage += data[k].x[i] * Q[i][j] * data[k].x[j];
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++)
        stage += data[k].u[i] * R[i][j] * data[k].u[j];
    y[k] = stage;
  }
  // Solve PhiT Phi h = PhiT y
  const PhiT = matTranspose(Phi);
  const A = matMul(PhiT, Phi);
  // ridge for numeric stability
  for (let i = 0; i < nParams; i++) A[i][i] += 1e-10;
  const b = new Array(nParams).fill(0);
  for (let i = 0; i < nParams; i++) for (let k = 0; k < data.length; k++) b[i] += PhiT[i][k] * y[k];
  const h = solveSymmetric(A, b);
  // Recover H
  const H = matCreate(dim, dim, 0);
  let idx = 0;
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      H[i][j] = h[idx];
      H[j][i] = h[idx];
      idx++;
    }
  }
  return H;
}

function solveSymmetric(A, b) {
  const n = A.length;
  const Aug = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(Aug[k][i]) > Math.abs(Aug[p][i])) p = k;
    [Aug[i], Aug[p]] = [Aug[p], Aug[i]];
    if (Math.abs(Aug[i][i]) < 1e-14) throw new Error('ADP: singular least-squares');
    for (let k = i + 1; k < n; k++) {
      const f = Aug[k][i] / Aug[i][i];
      for (let j = i; j <= n; j++) Aug[k][j] -= f * Aug[i][j];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = Aug[i][n];
    for (let j = i + 1; j < n; j++) s -= Aug[i][j] * x[j];
    x[i] = s / Aug[i][i];
  }
  return x;
}
