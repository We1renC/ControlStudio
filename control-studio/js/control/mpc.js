/**
 * mpc.js — Phase 10 finite-horizon MPC baseline.
 *
 * Scope is intentionally narrow:
 * - discrete-time state-space only
 * - unconstrained quadratic cost
 * - receding-horizon control via finite-horizon Riccati recursion
 */

import {
  matAdd,
  matIdentity,
  matInverse,
  matIsPositiveDefinite,
  matMul,
  matScale,
  matSub,
  matSymmetrize,
  matTranspose,
} from '../math/matrix.js';

function assertMatrixShape(name, M, rows, cols) {
  if (!Array.isArray(M) || M.length !== rows || M.some((row) => !Array.isArray(row) || row.length !== cols)) {
    throw new Error(`${name} must be ${rows}×${cols}`);
  }
}

function cloneMatrix(M) {
  return M.map((row) => [...row]);
}

function maxAbsMatrix(A) {
  let max = 0;
  for (const row of A) {
    for (const value of row) max = Math.max(max, Math.abs(value));
  }
  return max;
}

function quadraticForm(x, Q) {
  return matMul(matTranspose(x), matMul(Q, x))[0][0];
}

function addColumn(A, B) {
  return A.map((row, i) => [row[0] + B[i][0]]);
}

function subtractColumn(A, B) {
  return A.map((row, i) => [row[0] - B[i][0]]);
}

export function validateMpcModel(Ad, Bd, Q, R, horizon) {
  const n = Ad.length;
  const m = Bd[0]?.length;
  assertMatrixShape('Ad', Ad, n, n);
  assertMatrixShape('Bd', Bd, n, m);
  assertMatrixShape('Q', Q, n, n);
  assertMatrixShape('R', R, m, m);
  if (!Number.isInteger(horizon) || horizon <= 0) {
    throw new Error('MPC horizon must be a positive integer');
  }
  if (!matIsPositiveDefinite(matSymmetrize(R))) {
    throw new Error('MPC R must be positive definite');
  }
  return { n, m };
}

/**
 * Finite-horizon discrete LQR recursion for unconstrained MPC:
 *
 * P_N = Qf
 * K_k = (R + B'P_{k+1}B)^-1 B'P_{k+1}A
 * P_k = Q + A'P_{k+1}A - A'P_{k+1}B K_k
 */
export function finiteHorizonLqr(Ad, Bd, Q = null, R = null, horizon = 10, Qf = null) {
  const n = Ad.length;
  const m = Bd[0].length;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  const Qfmat = Qf ? matSymmetrize(cloneMatrix(Qf)) : cloneMatrix(Qmat);
  validateMpcModel(Ad, Bd, Qmat, Rmat, horizon);
  assertMatrixShape('Qf', Qfmat, n, n);

  const At = matTranspose(Ad);
  const Bt = matTranspose(Bd);
  const P = Array.from({ length: horizon + 1 });
  const K = Array.from({ length: horizon });
  P[horizon] = Qfmat;

  for (let k = horizon - 1; k >= 0; k--) {
    const Pnext = P[k + 1];
    const S = matAdd(Rmat, matMul(matMul(Bt, Pnext), Bd));
    const SInv = matInverse(S);
    const Kk = matMul(matMul(SInv, Bt), matMul(Pnext, Ad));
    const Aterm = matMul(matMul(At, Pnext), Ad);
    const Bterm = matMul(matMul(matMul(At, Pnext), Bd), Kk);
    K[k] = Kk;
    P[k] = matSymmetrize(matAdd(Qmat, matSub(Aterm, Bterm)));
  }

  return {
    K,
    P,
    firstGain: K[0],
    terminalCost: Qfmat,
    horizon,
  };
}

export function firstMpcAction(Ad, Bd, Q, R, horizon, x, Qf = null) {
  const n = Ad.length;
  assertMatrixShape('x', x, n, 1);
  const result = finiteHorizonLqr(Ad, Bd, Q, R, horizon, Qf);
  const u = matScale(matMul(result.firstGain, x), -1);
  return { u, gain: result.firstGain, riccati: result };
}

export function simulateUnconstrainedMpc(Ad, Bd, Q, R, horizon, x0, options = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  const steps = options.steps ?? 30;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  validateMpcModel(Ad, Bd, Qmat, Rmat, horizon);
  assertMatrixShape('x0', x0, n, 1);
  if (!Number.isInteger(steps) || steps <= 0) {
    throw new Error('MPC simulation steps must be a positive integer');
  }

  const x = [cloneMatrix(x0)];
  const u = [];
  const stageCost = [];
  let totalCost = 0;

  for (let k = 0; k < steps; k++) {
    const action = firstMpcAction(Ad, Bd, Qmat, Rmat, horizon, x[k], options.Qf || null);
    const uk = action.u;
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    const cost = quadraticForm(x[k], Qmat) + quadraticForm(uk, Rmat);
    u.push(uk);
    x.push(xNext);
    stageCost.push(cost);
    totalCost += cost;
  }

  return {
    x,
    u,
    stageCost,
    totalCost,
    finalStateNormInf: maxAbsMatrix(x[x.length - 1]),
    steps,
    horizon,
  };
}

export function mpcTrackingError(reference, output) {
  if (reference.length !== output.length) {
    throw new Error('reference and output must have the same length');
  }
  return subtractColumn(reference, output);
}
