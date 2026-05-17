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

// ---------------------------------------------------------------------------
// CS-P10-14: Condensed MPC with box-constrained QP (Hildreth coordinate descent)
// ---------------------------------------------------------------------------

/**
 * Build condensed prediction matrices for the finite-horizon MPC QP.
 *
 * State trajectory stacked as X_bar = [x_1; x_2; ...; x_N]:
 *   X_bar = Phi * x0 + Gamma * U
 *
 * Cost (excluding constant x_0' Q x_0 term):
 *   J = U' H U + 2 f(x0)' U + const
 *   H = Gamma' Q_bar Gamma + R_bar
 *   f(x0) = Gamma' Q_bar Phi x0
 *
 * Q_bar = block_diag(Q, Q, ..., Q, Qf)  — N blocks, k=1..N
 * R_bar = block_diag(R, R, ..., R)       — N blocks
 */
function buildCondensedMpc(Ad, Bd, Q, R, horizon, Qf) {
  const n = Ad.length;
  const m = Bd[0].length;
  const N = horizon;

  // Ad^1, Ad^2, ..., Ad^N
  const AdPows = [Ad];
  for (let k = 1; k < N; k++) AdPows.push(matMul(AdPows[k - 1], Ad));

  // Phi: (N*n) × n  — stack [Ad; Ad²; ...; Ad^N]
  const Phi = [];
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < n; i++) Phi.push([...AdPows[k][i]]);
  }

  // Ad^0*Bd, Ad^1*Bd, ..., Ad^{N-1}*Bd
  const AdkBd = [Bd];
  for (let k = 1; k < N; k++) AdkBd.push(matMul(Ad, AdkBd[k - 1]));

  // Gamma: (N*n) × (N*m)
  // Block [kRow, jCol] = Ad^{kRow-jCol} * Bd  for jCol <= kRow, else 0
  const Gamma = Array.from({ length: N * n }, () => new Array(N * m).fill(0));
  for (let kRow = 0; kRow < N; kRow++) {
    for (let jCol = 0; jCol <= kRow; jCol++) {
      const blk = AdkBd[kRow - jCol];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          Gamma[kRow * n + i][jCol * m + j] = blk[i][j];
        }
      }
    }
  }

  // Q_bar: (N*n) × (N*n), last block = Qf
  const Q_bar = Array.from({ length: N * n }, () => new Array(N * n).fill(0));
  for (let k = 0; k < N; k++) {
    const Qk = k === N - 1 ? Qf : Q;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) Q_bar[k * n + i][k * n + j] = Qk[i][j];
    }
  }

  // R_bar: (N*m) × (N*m)
  const R_bar = Array.from({ length: N * m }, () => new Array(N * m).fill(0));
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) R_bar[k * m + i][k * m + j] = R[i][j];
    }
  }

  const GammaT = matTranspose(Gamma);
  const H = matAdd(matMul(matMul(GammaT, Q_bar), Gamma), R_bar);

  return { Phi, Gamma, GammaT, H, Q_bar, R_bar, n, m, N };
}

/**
 * Compute condensed gradient f = Gamma' Q_bar Phi x0  (flat array, length N*m).
 * x0 is a column vector (n×1 matrix).
 */
function condensedGradient(condensed, x0) {
  const { Phi, GammaT, Q_bar } = condensed;
  const Phix0 = matMul(Phi, x0);
  const QbarPhix0 = matMul(Q_bar, Phix0);
  const fCol = matMul(GammaT, QbarPhix0);
  return fCol.map((row) => row[0]);
}

/**
 * Hildreth's coordinate-descent algorithm for box-constrained QP:
 *   min  0.5 U' H U + f' U   s.t.  uMin[i] ≤ U[i] ≤ uMax[i]
 *
 * Guaranteed to converge for positive-definite H.
 * Each iteration sweeps all components and clamps each one to its bounds.
 */
function boxQPHildreth(H, f, uMin, uMax, maxIter = 400, tol = 1e-10) {
  const N = f.length;
  const U = new Array(N);
  for (let i = 0; i < N; i++) {
    U[i] = Math.max(uMin[i], Math.min(uMax[i], H[i][i] > 0 ? -f[i] / H[i][i] : 0));
  }
  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    for (let i = 0; i < N; i++) {
      let sum = f[i];
      for (let j = 0; j < N; j++) {
        if (j !== i) sum += H[i][j] * U[j];
      }
      const newUi = Math.max(uMin[i], Math.min(uMax[i], -sum / H[i][i]));
      maxChange = Math.max(maxChange, Math.abs(newUi - U[i]));
      U[i] = newUi;
    }
    if (maxChange < tol) break;
  }
  return U;
}

/**
 * Solve one constrained MPC step (receding-horizon: return only u_0).
 *
 * constraints: { uMin: number|number[], uMax: number|number[] }
 *   - scalar means the same bound for all inputs
 *   - array of length m means per-input bounds
 */
export function firstMpcActionConstrained(Ad, Bd, Q, R, horizon, x, constraints = {}, Qf = null) {
  const { n, m } = validateMpcModel(Ad, Bd, Q, R, horizon);
  assertMatrixShape('x', x, n, 1);
  const Qmat = matSymmetrize(cloneMatrix(Q));
  const Rmat = matSymmetrize(cloneMatrix(R));
  const Qfmat = Qf ? matSymmetrize(cloneMatrix(Qf)) : cloneMatrix(Qmat);

  const condensed = buildCondensedMpc(Ad, Bd, Qmat, Rmat, horizon, Qfmat);
  const f = condensedGradient(condensed, x);
  const Nm = horizon * m;

  const rawMin = constraints.uMin ?? -Infinity;
  const rawMax = constraints.uMax ?? Infinity;
  const uMin = new Array(Nm);
  const uMax = new Array(Nm);
  for (let k = 0; k < horizon; k++) {
    for (let j = 0; j < m; j++) {
      uMin[k * m + j] = Array.isArray(rawMin) ? rawMin[j] : rawMin;
      uMax[k * m + j] = Array.isArray(rawMax) ? rawMax[j] : rawMax;
    }
  }

  const U = boxQPHildreth(condensed.H, f, uMin, uMax);
  const u = Array.from({ length: m }, (_, j) => [U[j]]);
  const activeAt = U.map((val, i) => {
    if (Math.abs(val - uMin[i]) < 1e-7 && Number.isFinite(uMin[i])) return 'lower';
    if (Math.abs(val - uMax[i]) < 1e-7 && Number.isFinite(uMax[i])) return 'upper';
    return null;
  });

  return {
    u,
    U,
    activeAt,
    anyActive: activeAt.some((c) => c !== null),
    condensed,
  };
}

/**
 * Simulate constrained MPC in receding-horizon fashion.
 * Returns same shape as simulateUnconstrainedMpc plus activeConstraintsLog.
 */
export function simulateConstrainedMpc(Ad, Bd, Q, R, horizon, x0, constraints = {}, options = {}) {
  const { n, m } = validateMpcModel(Ad, Bd, Q, R, horizon);
  assertMatrixShape('x0', x0, n, 1);
  const steps = options.steps ?? 30;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  const Qfmat = options.Qf ? matSymmetrize(cloneMatrix(options.Qf)) : cloneMatrix(Qmat);
  if (!Number.isInteger(steps) || steps <= 0) {
    throw new Error('MPC simulation steps must be a positive integer');
  }

  const x = [cloneMatrix(x0)];
  const u = [];
  const stageCost = [];
  const activeConstraintsLog = [];
  let totalCost = 0;

  for (let k = 0; k < steps; k++) {
    const action = firstMpcActionConstrained(Ad, Bd, Qmat, Rmat, horizon, x[k], constraints, Qfmat);
    const uk = action.u;
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    const cost = quadraticForm(x[k], Qmat) + quadraticForm(uk, Rmat);
    u.push(uk);
    x.push(xNext);
    stageCost.push(cost);
    totalCost += cost;
    activeConstraintsLog.push(action.anyActive);
  }

  return {
    x,
    u,
    stageCost,
    totalCost,
    finalStateNormInf: maxAbsMatrix(x[x.length - 1]),
    steps,
    horizon,
    activeConstraintsLog,
    anyConstraintActive: activeConstraintsLog.some(Boolean),
  };
}

export function mpcTrackingError(reference, output) {
  if (reference.length !== output.length) {
    throw new Error('reference and output must have the same length');
  }
  return subtractColumn(reference, output);
}
