/**
 * admm_qp.js - Tier D2: OSQP-style ADMM baseline for box-constrained QPs.
 */

import { matAdd, matIdentity, matInverse, matMul, matScale, matTranspose, matVecMul } from '../math/matrix.js';

function projectBox(v, l, u) {
  return v.map((value, i) => Math.max(l[i] ?? -Infinity, Math.min(u[i] ?? Infinity, value)));
}

function vecAdd(a, b) { return a.map((value, i) => value + b[i]); }
function vecSub(a, b) { return a.map((value, i) => value - b[i]); }
function vecScale(a, s) { return a.map((value) => value * s); }
function normInf(a) { return Math.max(...a.map((value) => Math.abs(value))); }

export function solveQPAdmm({ P, q, A = null, l = null, u = null, rho = 1, sigma = 1e-6, maxIter = 4000, tol = 1e-6 } = {}) {
  if (!P || !q) throw new Error('solveQPAdmm requires P and q');
  const n = q.length;
  const C = A ?? matIdentity(n);
  const m = C.length;
  const lower = l ?? new Array(m).fill(-Infinity);
  const upper = u ?? new Array(m).fill(Infinity);
  const diagonalIdentityCase = !A && P.every((row, i) => row.every((value, j) => i === j || Math.abs(value) < 1e-15));
  const Ct = matTranspose(C);
  const Kinv = diagonalIdentityCase
    ? null
    : matInverse(matAdd(matAdd(P, matScale(matIdentity(n), sigma)), matScale(matMul(Ct, C), rho)));

  let x = new Array(n).fill(0);
  let z = projectBox(matVecMul(C, x), lower, upper);
  let y = new Array(m).fill(0);
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const rhs = vecAdd(vecScale(q, -1), matVecMul(Ct, vecSub(vecScale(z, rho), y)));
    x = diagonalIdentityCase
      ? rhs.map((value, i) => value / (P[i][i] + sigma + rho))
      : matVecMul(Kinv, rhs);
    const Cx = matVecMul(C, x);
    const zPrev = z;
    z = projectBox(vecAdd(Cx, vecScale(y, 1 / rho)), lower, upper);
    y = vecAdd(y, vecScale(vecSub(Cx, z), rho));
    const primal = normInf(vecSub(Cx, z));
    const dual = normInf(matVecMul(Ct, vecScale(vecSub(z, zPrev), rho)));
    if (primal < tol && dual < tol) break;
  }
  return { x, z, y, iter: iter + 1, converged: iter < maxIter, method: 'admm-box-qp' };
}

export default { solveQPAdmm };
