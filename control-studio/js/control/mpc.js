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
  matSolve,
  matSub,
  matSymmetrize,
  matTranspose,
} from '../math/matrix.js';
import { solveDAREHamiltonianSign, solveDiscreteKalman } from './state-feedback.js';

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
 * P_N = Qf  (or P∞ from DARE when options.autoTerminalCost = true)
 * K_k = (R + B'P_{k+1}B)^-1 B'P_{k+1}A
 * P_k = Q + A'P_{k+1}A - A'P_{k+1}B K_k
 */
export function finiteHorizonLqr(Ad, Bd, Q = null, R = null, horizon = 10, Qf = null, options = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  validateMpcModel(Ad, Bd, Qmat, Rmat, horizon);

  let Qfmat;
  if (Qf) {
    Qfmat = matSymmetrize(cloneMatrix(Qf));
  } else if (options.autoTerminalCost) {
    const dare = solveDAREHamiltonianSign(Ad, Bd, Qmat, Rmat);
    Qfmat = dare.P;
  } else {
    Qfmat = cloneMatrix(Qmat);
  }
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

export function firstMpcAction(Ad, Bd, Q, R, horizon, x, Qf = null, options = {}) {
  // If Move Suppression is requested, fall back to condensed QP 
  // since the Riccati recursion would require state augmentation.
  if (options.S) {
    return firstMpcActionConstrained(Ad, Bd, Q, R, horizon, x, {}, Qf, options);
  }

  const n = Ad.length;
  assertMatrixShape('x', x, n, 1);
  const result = finiteHorizonLqr(Ad, Bd, Q, R, horizon, Qf, options);
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

  let uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);

  for (let k = 0; k < steps; k++) {
    const actionOptions = { ...options, uPrev };
    const action = firstMpcAction(Ad, Bd, Qmat, Rmat, horizon, x[k], options.Qf || null, actionOptions);
    const uk = action.u;
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    
    let cost = quadraticForm(x[k], Qmat) + quadraticForm(uk, Rmat);
    if (options.S) {
      const du = matSub(uk, uPrev);
      cost += quadraticForm(du, options.S);
    }
    
    u.push(uk);
    x.push(xNext);
    stageCost.push(cost);
    totalCost += cost;
    uPrev = uk;
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
// CS-P11-02: MPC Setpoint Tracking
// ---------------------------------------------------------------------------

/**
 * Compute pseudo-inverse of an n×m matrix A using the normal equations.
 * For m ≤ n (more rows than cols): pinv(A) = (A'A)⁻¹A'  (left pseudo-inverse)
 * For m > n (more cols than rows): pinv(A) = A'(AA')⁻¹  (right pseudo-inverse)
 */
function pseudoInverse(A) {
  const n = A.length;
  const m = A[0].length;
  const At = matTranspose(A);
  if (m <= n) {
    return matMul(matInverse(matMul(At, A)), At);
  }
  return matMul(At, matInverse(matMul(A, At)));
}

/**
 * Compute the steady-state input u_ss required for the state x_ss = r.
 *
 * Steady-state condition: r = Ad·r + Bd·u_ss  →  (I−Ad)·r = Bd·u_ss
 * Solution: u_ss = pinv(Bd) · (I−Ad) · r   (minimum-norm if underdetermined)
 *
 * Also returns the residual ‖Bd·u_ss − (I−Ad)·r‖∞ (= 0 when r is exactly reachable).
 */
export function solveSetpointSteadyState(Ad, Bd, r) {
  const n = Ad.length;
  const m = Bd[0].length;
  assertMatrixShape('r', r, n, 1);
  const ImAd = matSub(matIdentity(n), Ad);
  const rhs = matMul(ImAd, r);
  const pinvBd = pseudoInverse(Bd);
  const u_ss = matMul(pinvBd, rhs);
  const achievedRhs = matMul(Bd, u_ss);
  let residual = 0;
  for (let i = 0; i < n; i++) residual = Math.max(residual, Math.abs(achievedRhs[i][0] - rhs[i][0]));
  return { u_ss, r, steadyStateResidual: residual };
}

/**
 * One step of receding-horizon setpoint-tracking MPC.
 *
 * The state error e_k = x_k − r and the input increment v_k = u_k − u_ss satisfy
 * the SAME dynamics as (Ad, Bd), so standard MPC is run on e_0 and v returned.
 * The actual control is u = v + u_ss.
 *
 * constraints: same shape as firstMpcActionConstrained ({ uMin, uMax } for v)
 * uConstraints on the increment v are automatically offset from u constraints:
 *   v_min = uMin − u_ss,  v_max = uMax − u_ss
 */
export function firstMpcActionTracking(Ad, Bd, Q, R, horizon, x, reference, constraints = {}, Qf = null, options = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  assertMatrixShape('x', x, n, 1);
  assertMatrixShape('reference', reference, n, 1);
  const { u_ss } = solveSetpointSteadyState(Ad, Bd, reference);

  const e0 = matSub(x, reference);

  // Shift u bounds to v bounds
  const rawMin = constraints.uMin ?? -Infinity;
  const rawMax = constraints.uMax ?? Infinity;
  const uMinAbs = Array.isArray(rawMin) ? rawMin : Array(m).fill(rawMin);
  const uMaxAbs = Array.isArray(rawMax) ? rawMax : Array(m).fill(rawMax);
  const vMin = uMinAbs.map((b, j) => Number.isFinite(b) ? b - u_ss[j][0] : b);
  const vMax = uMaxAbs.map((b, j) => Number.isFinite(b) ? b - u_ss[j][0] : b);

  // If move suppression is used, shift uPrev to vPrev
  let vOptions = { ...options };
  if (options.S) {
    const uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);
    vOptions.uPrev = uPrev.map((row, j) => [row[0] - u_ss[j][0]]);
  }

  const vResult = firstMpcActionConstrained(Ad, Bd, Q, R, horizon, e0, { uMin: vMin, uMax: vMax }, Qf, vOptions);
  const u = vResult.u.map((row, j) => [row[0] + u_ss[j][0]]);
  return { u, v: vResult.u, u_ss, trackingError: e0, anyActive: vResult.anyActive, riccati: vResult };
}

/**
 * Simulate setpoint-tracking MPC in receding-horizon fashion.
 *
 * reference: n×1 constant state target, or { r: n×1, steps: callable } for time-varying.
 */
export function simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, reference, constraints = {}, options = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  assertMatrixShape('x0', x0, n, 1);
  const steps = options.steps ?? 30;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  validateMpcModel(Ad, Bd, Qmat, Rmat, horizon);
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('steps must be a positive integer');

  // reference can be a fixed n×1 matrix or a function (k) → n×1
  const getRef = (typeof reference === 'function') ? reference : () => reference;
  assertMatrixShape('reference(0)', getRef(0), n, 1);

  const x = [cloneMatrix(x0)];
  const u = [];
  const trackingErrors = [];
  let totalCost = 0;

  let uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);

  for (let k = 0; k < steps; k++) {
    const ref = getRef(k);
    const actionOptions = { ...options, uPrev };
    const action = firstMpcActionTracking(Ad, Bd, Qmat, Rmat, horizon, x[k], ref, constraints, options.Qf || null, actionOptions);
    const uk = action.u;
    const ek = action.trackingError;
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    
    let cost = quadraticForm(ek, Qmat) + quadraticForm(action.v, Rmat);
    if (options.S) {
      const du = matSub(uk, uPrev);
      cost += quadraticForm(du, options.S);
    }
    
    u.push(uk);
    x.push(xNext);
    trackingErrors.push(ek);
    totalCost += cost;
    uPrev = uk;
  }

  const finalRef = getRef(steps - 1);
  const finalError = matSub(x[x.length - 1], finalRef);
  return {
    x,
    u,
    trackingErrors,
    totalCost,
    finalTrackingErrorNormInf: maxAbsMatrix(finalError),
    steps,
    horizon,
  };
}

function regularizedLeastSquares(A, b, reg = 1e-9) {
  const At = matTranspose(A);
  const AtA = matMul(At, A);
  const Atb = matMul(At, b);
  const n = AtA.length;
  for (let i = 0; i < n; i++) AtA[i][i] += reg;
  return matSolve(AtA, Atb);
}

function matrixColumnResidual(A, x, b) {
  const Ax = matMul(A, x);
  let residual = 0;
  for (let i = 0; i < Ax.length; i++) residual = Math.max(residual, Math.abs(Ax[i][0] - b[i][0]));
  return residual;
}

function outputAt(C, D, x, u) {
  return addColumn(matMul(C, x), matMul(D, u));
}

/**
 * MIMO output-space setpoint steady-state solver.
 *
 * Finds x_ss, u_ss satisfying:
 *   x_ss = A_d x_ss + B_d u_ss
 *   y_ref = C x_ss + D u_ss
 *
 * Non-square plants use a regularized least-squares solution, so the residual
 * explicitly reports whether the requested output setpoint is exactly reachable.
 */
export function solveOutputSetpointSteadyState(Ad, Bd, C, D, yRef, options = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  const p = C.length;
  assertMatrixShape('Ad', Ad, n, n);
  assertMatrixShape('Bd', Bd, n, m);
  assertMatrixShape('C', C, p, n);
  assertMatrixShape('D', D, p, m);
  assertMatrixShape('yRef', yRef, p, 1);

  const ImA = matSub(matIdentity(n), Ad);
  const E = [];
  const b = [];
  for (let i = 0; i < n; i++) {
    E.push([...ImA[i], ...Bd[i].map((value) => -value)]);
    b.push([0]);
  }
  for (let i = 0; i < p; i++) {
    E.push([...C[i], ...D[i]]);
    b.push([yRef[i][0]]);
  }

  const reg = options.regularization ?? 1e-9;
  let z;
  try {
    z = E.length === n + m ? matSolve(E, b) : regularizedLeastSquares(E, b, reg);
  } catch (_) {
    z = regularizedLeastSquares(E, b, reg);
  }
  const x_ss = z.slice(0, n);
  const u_ss = z.slice(n, n + m);
  const dynamicResidual = matrixColumnResidual(
    E.slice(0, n).map((row) => row.slice(0, n + m)),
    z,
    b.slice(0, n),
  );
  const outputResidual = matrixColumnResidual(
    E.slice(n).map((row) => row.slice(0, n + m)),
    z,
    b.slice(n),
  );

  return {
    x_ss,
    u_ss,
    y_ss: outputAt(C, D, x_ss, u_ss),
    dynamicResidual,
    outputResidual,
    residual: Math.max(dynamicResidual, outputResidual),
    exact: Math.max(dynamicResidual, outputResidual) < (options.tolerance ?? 1e-7),
  };
}

export function firstMpcActionOutputTracking(
  Ad, Bd, C, D, Q, R, horizon, x, yReference, constraints = {}, Qf = null, options = {},
) {
  const n = Ad.length;
  const m = Bd[0].length;
  assertMatrixShape('x', x, n, 1);
  const steady = solveOutputSetpointSteadyState(Ad, Bd, C, D, yReference, options);
  const e0 = matSub(x, steady.x_ss);

  const rawMin = constraints.uMin ?? -Infinity;
  const rawMax = constraints.uMax ?? Infinity;
  const uMinAbs = Array.isArray(rawMin) ? rawMin : Array(m).fill(rawMin);
  const uMaxAbs = Array.isArray(rawMax) ? rawMax : Array(m).fill(rawMax);
  const vMin = uMinAbs.map((b, j) => Number.isFinite(b) ? b - steady.u_ss[j][0] : b);
  const vMax = uMaxAbs.map((b, j) => Number.isFinite(b) ? b - steady.u_ss[j][0] : b);

  let vOptions = { ...options };
  if (options.S) {
    const uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);
    vOptions.uPrev = uPrev.map((row, j) => [row[0] - steady.u_ss[j][0]]);
  }

  const vResult = firstMpcActionConstrained(Ad, Bd, Q, R, horizon, e0, { uMin: vMin, uMax: vMax }, Qf, vOptions);
  const u = vResult.u.map((row, j) => [row[0] + steady.u_ss[j][0]]);
  return {
    u,
    v: vResult.u,
    steady,
    stateTrackingError: e0,
    outputError: mpcTrackingError(yReference, outputAt(C, D, x, u)),
    anyActive: vResult.anyActive,
    riccati: vResult,
  };
}

/**
 * Receding-horizon MPC tracking for MIMO output references y_ref.
 * reference may be a fixed p×1 matrix or a function (k) → p×1.
 */
export function simulateMpcOutputTracking(
  Ad, Bd, C, D, Q, R, horizon, x0, reference, constraints = {}, options = {},
) {
  const n = Ad.length;
  const m = Bd[0].length;
  const p = C.length;
  assertMatrixShape('x0', x0, n, 1);
  assertMatrixShape('C', C, p, n);
  assertMatrixShape('D', D, p, m);
  const steps = options.steps ?? 30;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  validateMpcModel(Ad, Bd, Qmat, Rmat, horizon);
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('steps must be a positive integer');

  const getRef = (typeof reference === 'function') ? reference : () => reference;
  assertMatrixShape('reference(0)', getRef(0), p, 1);

  const x = [cloneMatrix(x0)];
  const y = [];
  const u = [];
  const outputErrors = [];
  const steadyStates = [];
  let totalCost = 0;

  let uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);

  for (let k = 0; k < steps; k++) {
    const ref = getRef(k);
    const actionOptions = { ...options, uPrev };
    const action = firstMpcActionOutputTracking(
      Ad, Bd, C, D, Qmat, Rmat, horizon, x[k], ref, constraints, options.Qf || null, actionOptions,
    );
    const uk = action.u;
    const yk = outputAt(C, D, x[k], uk);
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    
    let cost = quadraticForm(action.stateTrackingError, Qmat) + quadraticForm(action.v, Rmat);
    if (options.S) {
      const du = matSub(uk, uPrev);
      cost += quadraticForm(du, options.S);
    }
    
    u.push(uk);
    y.push(yk);
    x.push(xNext);
    outputErrors.push(mpcTrackingError(ref, yk));
    steadyStates.push(action.steady);
    totalCost += cost;
    uPrev = uk;
  }

  const finalRef = getRef(steps - 1);
  const finalSteady = solveOutputSetpointSteadyState(Ad, Bd, C, D, finalRef, options);
  const finalOutput = outputAt(C, D, x[x.length - 1], finalSteady.u_ss);
  const finalOutputError = mpcTrackingError(finalRef, finalOutput);
  return {
    x,
    y,
    u,
    outputErrors,
    steadyStates,
    totalCost,
    finalOutput,
    finalOutputErrorNormInf: maxAbsMatrix(finalOutputError),
    finalSteadyResidual: finalSteady.residual,
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
export function firstMpcActionConstrained(Ad, Bd, Q, R, horizon, x, constraints = {}, Qf = null, options = {}) {
  const { n, m } = validateMpcModel(Ad, Bd, Q, R, horizon);
  assertMatrixShape('x', x, n, 1);
  const Qmat = matSymmetrize(cloneMatrix(Q));
  const Rmat = matSymmetrize(cloneMatrix(R));
  const Qfmat = Qf ? matSymmetrize(cloneMatrix(Qf)) : cloneMatrix(Qmat);

  const condensed = buildCondensedMpc(Ad, Bd, Qmat, Rmat, horizon, Qfmat);
  let H = condensed.H;
  let f = condensedGradient(condensed, x);
  const Nm = horizon * m;

  if (options.S) {
    const Smat = matSymmetrize(cloneMatrix(options.S));
    assertMatrixShape('S', Smat, m, m);
    const uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);
    
    // Add block tridiagonal Delta-U penalty to H
    const dH = Array.from({ length: Nm }, () => new Array(Nm).fill(0));
    for (let k = 0; k < horizon; k++) {
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          const val = Smat[i][j];
          dH[k * m + i][k * m + j] += val;
          if (k > 0) {
            dH[(k - 1) * m + i][(k - 1) * m + j] += val;
            dH[(k - 1) * m + i][k * m + j] -= val;
            dH[k * m + i][(k - 1) * m + j] -= val;
          }
        }
      }
    }
    
    // Linear penalty term from uPrev
    const df = new Array(Nm).fill(0);
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < m; j++) {
        sum += Smat[i][j] * uPrev[j][0];
      }
      df[i] = -sum;
    }
    
    H = matAdd(H, dH);
    f = f.map((val, i) => val + df[i]);
  }

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

  const U = boxQPHildreth(H, f, uMin, uMax);
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

  let uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);

  for (let k = 0; k < steps; k++) {
    const actionOptions = { ...options, uPrev };
    const action = firstMpcActionConstrained(Ad, Bd, Qmat, Rmat, horizon, x[k], constraints, Qfmat, actionOptions);
    const uk = action.u;
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    
    // True stage cost including delta-U if S is provided
    let cost = quadraticForm(x[k], Qmat) + quadraticForm(uk, Rmat);
    if (options.S) {
      const du = matSub(uk, uPrev);
      cost += quadraticForm(du, options.S);
    }
    
    u.push(uk);
    x.push(xNext);
    stageCost.push(cost);
    totalCost += cost;
    activeConstraintsLog.push(action.anyActive);
    uPrev = uk;
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

// ---------------------------------------------------------------------------
// CS-P11-05: State constraints + soft slack via condensed QP augmentation
// ---------------------------------------------------------------------------

/**
 * Add soft state constraint penalty to condensed MPC QP.
 *
 * For state x_k = Phi_k·x0 + Gamma_k·U, a soft upper/lower bound violation is:
 *   upper: x_k[i] > xMax[i]  →  slack = x_k[i] − xMax[i] > 0
 *   lower: x_k[i] < xMin[i]  →  slack = xMin[i] − x_k[i] > 0
 *
 * Strategy: predict the free-response X_free = Phi·x0 (at U=0). For each
 * state (k,i) that is PREDICTED to violate its bound, augment H and f with
 * the quadratic soft penalty:
 *   J_soft += ρ · (c + g'U)²  where c = X_free[k,i] ∓ bound[i],  g = ±Gamma_row
 *
 * This is a one-shot active-set approximation. Large ρ drives violations to zero.
 * Returns { H_aug, f_aug, activatedUpper, activatedLower } (activated = count of
 * state components where a penalty was added).
 */
function augmentQPWithStateConstraints(condensed, x0, xMin, xMax, penalty) {
  const { Phi, Gamma, H, n, m, N } = condensed;
  const Nm = N * m;
  const x0flat = x0.map((r) => r[0]);

  // Free response X_free = Phi · x0  (Nn-vector)
  const X_free = Phi.map((row) => row.reduce((s, v, i) => s + v * x0flat[i], 0));

  // Clone H and f
  const H_aug = H.map((row) => [...row]);
  const f_aug = new Array(Nm).fill(0);

  let activatedUpper = 0;
  let activatedLower = 0;

  for (let k = 0; k < N; k++) {
    for (let i = 0; i < n; i++) {
      const row = k * n + i;
      const xFree_ki = X_free[row];
      const gamma_row = Gamma[row]; // length Nm

      if (xMax !== null && xFree_ki > xMax[i]) {
        // Predicted upper violation: slack = xFree_ki − xMax[i] + gamma_row' U
        const c = xFree_ki - xMax[i];
        for (let r = 0; r < Nm; r++) {
          f_aug[r] += penalty * gamma_row[r] * c;
          for (let s = 0; s < Nm; s++) H_aug[r][s] += penalty * gamma_row[r] * gamma_row[s];
        }
        activatedUpper++;
      }

      if (xMin !== null && xFree_ki < xMin[i]) {
        // Predicted lower violation: slack = xMin[i] − xFree_ki − gamma_row' U
        const c = xMin[i] - xFree_ki;
        for (let r = 0; r < Nm; r++) {
          f_aug[r] -= penalty * gamma_row[r] * c;
          for (let s = 0; s < Nm; s++) H_aug[r][s] += penalty * gamma_row[r] * gamma_row[s];
        }
        activatedLower++;
      }
    }
  }

  return { H_aug, f_aug, activatedUpper, activatedLower };
}

/**
 * Compute actual state constraint violations for a predicted trajectory.
 * X_pred: Nn-vector of predicted states.
 * Returns { upperViolations, lowerViolations, slackNormInf }.
 */
function computeStateViolations(X_pred, xMin, xMax, n, N) {
  const upper = [];
  const lower = [];
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < n; i++) {
      const v = X_pred[k * n + i];
      if (xMax !== null && v > xMax[i] + 1e-9) upper.push({ k, i, violation: v - xMax[i] });
      if (xMin !== null && v < xMin[i] - 1e-9) lower.push({ k, i, violation: xMin[i] - v });
    }
  }
  const allViol = [...upper.map((e) => e.violation), ...lower.map((e) => e.violation)];
  return {
    upperViolations: upper,
    lowerViolations: lower,
    slackNormInf: allViol.length ? Math.max(...allViol) : 0,
    feasible: allViol.length === 0,
  };
}

/**
 * One step of MPC with both input box constraints and soft state constraints.
 *
 * uConstraints: { uMin, uMax }  (same as firstMpcActionConstrained)
 * xConstraints: { xMin: number[], xMax: number[], penalty: number }
 *   xMin/xMax are n-vectors of per-state bounds (use ±Infinity to skip a state).
 *   penalty (ρ) defaults to 1e4.
 */
export function firstMpcActionStateConstrained(
  Ad, Bd, Q, R, horizon, x, uConstraints = {}, xConstraints = {}, Qf = null, options = {}
) {
  const { n, m } = validateMpcModel(Ad, Bd, Q, R, horizon);
  assertMatrixShape('x', x, n, 1);
  const Qmat = matSymmetrize(cloneMatrix(Q));
  const Rmat = matSymmetrize(cloneMatrix(R));
  const Qfmat = Qf ? matSymmetrize(cloneMatrix(Qf)) : cloneMatrix(Qmat);

  const condensed = buildCondensedMpc(Ad, Bd, Qmat, Rmat, horizon, Qfmat);
  let f_base = condensedGradient(condensed, x);
  const Nm = horizon * m;

  let dH = null;
  let df = null;
  if (options.S) {
    const Smat = matSymmetrize(cloneMatrix(options.S));
    const uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);
    
    dH = Array.from({ length: Nm }, () => new Array(Nm).fill(0));
    for (let k = 0; k < horizon; k++) {
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          const val = Smat[i][j];
          dH[k * m + i][k * m + j] += val;
          if (k > 0) {
            dH[(k - 1) * m + i][(k - 1) * m + j] += val;
            dH[(k - 1) * m + i][k * m + j] -= val;
            dH[k * m + i][(k - 1) * m + j] -= val;
          }
        }
      }
    }
    
    df = new Array(Nm).fill(0);
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < m; j++) {
        sum += Smat[i][j] * uPrev[j][0];
      }
      df[i] = -sum;
    }
  }

  const rawMin = uConstraints.uMin ?? -Infinity;
  const rawMax = uConstraints.uMax ?? Infinity;
  const uMin = new Array(Nm);
  const uMax = new Array(Nm);
  for (let k = 0; k < horizon; k++) {
    for (let j = 0; j < m; j++) {
      uMin[k * m + j] = Array.isArray(rawMin) ? rawMin[j] : rawMin;
      uMax[k * m + j] = Array.isArray(rawMax) ? rawMax[j] : rawMax;
    }
  }

  const penalty = xConstraints.penalty ?? 1e4;
  const xMin = xConstraints.xMin
    ? Array.from({ length: n }, (_, i) => xConstraints.xMin[i] ?? -Infinity)
    : null;
  const xMax = xConstraints.xMax
    ? Array.from({ length: n }, (_, i) => xConstraints.xMax[i] ?? Infinity)
    : null;

  const { H_aug, f_aug, activatedUpper, activatedLower } = augmentQPWithStateConstraints(
    condensed, x, xMin, xMax, penalty,
  );

  let H_total = H_aug;
  let f_total = f_aug.map((v, i) => v + f_base[i]);

  if (options.S) {
    H_total = matAdd(H_total, dH);
    f_total = f_total.map((v, i) => v + df[i]);
  }

  const U = boxQPHildreth(H_total, f_total, uMin, uMax);
  const u = Array.from({ length: m }, (_, j) => [U[j]]);

  // Compute predicted trajectory to report violations
  const { Phi, Gamma } = condensed;
  const x0flat = x.map((r) => r[0]);
  const X_pred = Phi.map((row, ri) =>
    row.reduce((s, v, i) => s + v * x0flat[i], 0) + Gamma[ri].reduce((s, g, j) => s + g * U[j], 0),
  );
  const violations = computeStateViolations(X_pred, xMin, xMax, n, horizon);

  return {
    u,
    U,
    anyActive: U.some((val, i) =>
      (Math.abs(val - uMin[i]) < 1e-7 && Number.isFinite(uMin[i])) ||
      (Math.abs(val - uMax[i]) < 1e-7 && Number.isFinite(uMax[i])),
    ),
    activatedUpper,
    activatedLower,
    ...violations,
    condensed,
  };
}

/**
 * Simulate MPC with input and soft state constraints in receding-horizon fashion.
 */
export function simulateStateConstrainedMpc(
  Ad, Bd, Q, R, horizon, x0, uConstraints = {}, xConstraints = {}, options = {},
) {
  const { n, m } = validateMpcModel(Ad, Bd, Q, R, horizon);
  assertMatrixShape('x0', x0, n, 1);
  const steps = options.steps ?? 30;
  const Qmat = Q ? matSymmetrize(cloneMatrix(Q)) : matIdentity(n);
  const Rmat = R ? matSymmetrize(cloneMatrix(R)) : matIdentity(m);
  const Qfmat = options.Qf ? matSymmetrize(cloneMatrix(options.Qf)) : cloneMatrix(Qmat);
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('steps must be a positive integer');

  const x = [cloneMatrix(x0)];
  const u = [];
  const stageCost = [];
  const activeConstraintsLog = [];
  const violationsLog = [];
  let totalCost = 0;

  let uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);

  for (let k = 0; k < steps; k++) {
    const actionOptions = { ...options, uPrev };
    const action = firstMpcActionStateConstrained(
      Ad, Bd, Qmat, Rmat, horizon, x[k], uConstraints, xConstraints, Qfmat, actionOptions,
    );
    const uk = action.u;
    const xNext = addColumn(matMul(Ad, x[k]), matMul(Bd, uk));
    
    let cost = quadraticForm(x[k], Qmat) + quadraticForm(uk, Rmat);
    if (options.S) {
      const du = matSub(uk, uPrev);
      cost += quadraticForm(du, options.S);
    }
    
    u.push(uk);
    x.push(xNext);
    stageCost.push(cost);
    totalCost += cost;
    activeConstraintsLog.push(action.anyActive);
    violationsLog.push({ slackNormInf: action.slackNormInf, feasible: action.feasible });
    uPrev = uk;
  }

  return {
    x,
    u,
    stageCost,
    totalCost,
    finalStateNormInf: maxAbsMatrix(x[x.length - 1]),
    steps,
    horizon,
    violationsLog,
    anyViolation: violationsLog.some((v) => !v.feasible),
  };
}

export function mpcTrackingError(reference, output) {
  if (reference.length !== output.length) {
    throw new Error('reference and output must have the same length');
  }
  return subtractColumn(reference, output);
}

// ---------------------------------------------------------------------------
// CS-P20-01: Offset-Free Tracking (Disturbance Model + Observer)
// ---------------------------------------------------------------------------

/**
 * Build augmented state-space model for offset-free tracking.
 * Assumes output disturbances (d is added to y).
 * x_aug = [x; d]
 * d_{k+1} = d_k (random walk)
 * y_k = C x_k + d_k
 */
export function buildDisturbanceModel(Ad, Bd, C, nd = null) {
  const n = Ad.length;
  const m = Bd[0].length;
  const p = C.length;
  const numDist = nd ?? p; // Default to output disturbance
  if (numDist !== p) {
    throw new Error('Only output disturbances (nd = p) are currently supported for offset-free tracking');
  }

  // A_aug = [Ad   0 ]
  //         [ 0   I ]
  const A_aug = [];
  for (let i = 0; i < n; i++) A_aug.push([...Ad[i], ...Array(p).fill(0)]);
  for (let i = 0; i < p; i++) {
    const row = Array(n + p).fill(0);
    row[n + i] = 1;
    A_aug.push(row);
  }

  // B_aug = [Bd ]
  //         [ 0 ]
  const B_aug = [];
  for (let i = 0; i < n; i++) B_aug.push([...Bd[i]]);
  for (let i = 0; i < p; i++) B_aug.push(Array(m).fill(0));

  // C_aug = [C   I ]
  const C_aug = [];
  for (let i = 0; i < p; i++) {
    const row = [...C[i], ...Array(p).fill(0)];
    row[n + i] = 1;
    C_aug.push(row);
  }

  return { A_aug, B_aug, C_aug, n, m, p, nd: numDist };
}

/**
 * Design Kalman observer for the augmented offset-free tracking model.
 */
export function designDisturbanceObserver(A_aug, C_aug, Qw, Rv) {
  const { L, Pe, Aobs } = solveDiscreteKalman(A_aug, C_aug, Qw, Rv);
  return { L, P: Pe, Aobs };
}

/**
 * Simulate MPC with offset-free tracking (augmented observer in the loop).
 */
export function simulateOffsetFreeMpc(
  Ad, Bd, C, Q, R, horizon, x0, yRef, constraints = {}, options = {}
) {
  const { n, m, p } = buildDisturbanceModel(Ad, Bd, C, C.length);
  const steps = options.steps ?? 30;
  if (!options.Qw || !options.Rv) {
    throw new Error('Qw and Rv are required for offset-free observer design');
  }

  const { A_aug, B_aug, C_aug } = buildDisturbanceModel(Ad, Bd, C, p);
  const obs = designDisturbanceObserver(A_aug, C_aug, options.Qw, options.Rv);

  // Initial augmented state estimate [x0; 0]
  let xHat = [...cloneMatrix(x0), ...Array.from({ length: p }, () => [0])];
  const xTrue = [cloneMatrix(x0)];
  const u = [];
  const y = [];
  const xHatLog = [cloneMatrix(xHat)];
  const trackingErrors = [];
  let totalCost = 0;

  // Plant disturbance (unknown to observer)
  const d_plant = options.disturbance ?? Array.from({ length: p }, () => [0]);
  let uPrev = options.uPrev ?? Array.from({ length: m }, () => [0]);

  for (let k = 0; k < steps; k++) {
    // 1. Plant measurement
    const xk = xTrue[k];
    const yk = matAdd(matMul(C, xk), d_plant);
    y.push(yk);

    // 2. Current state estimate update (Measurement Update)
    // For MPC action without delay, we compute current estimate:
    // xHat_current = xHat_pred + M * (yk - C_aug * xHat_pred)
    // S = C_aug * P * C_aug' + Rv
    const S = matAdd(matMul(matMul(C_aug, obs.P), matTranspose(C_aug)), options.Rv);
    const M = matMul(matMul(obs.P, matTranspose(C_aug)), matInverse(S));
    const innov = matSub(yk, matMul(C_aug, xHat));
    const xHat_current = matAdd(xHat, matMul(M, innov));

    // Extract state and disturbance estimate
    const xHat_k = xHat_current.slice(0, n);
    const dHat_k = xHat_current.slice(n, n + p);

    // 3. MPC Action on estimated state
    // To reject dHat_k, we offset yRef by dHat_k
    const yRef_adjusted = matSub(yRef, dHat_k);
    const actionOptions = { ...options, uPrev };
    
    // Pass empty D matrix (zeros) to output tracking
    const Dmat = Array.from({ length: p }, () => Array(m).fill(0));
    const action = firstMpcActionOutputTracking(
      Ad, Bd, C, Dmat, Q, R, horizon, xHat_k, yRef_adjusted, constraints, options.Qf || null, actionOptions,
    );
    
    const uk = action.u;
    const xNext = addColumn(matMul(Ad, xk), matMul(Bd, uk));
    
    let cost = quadraticForm(action.stateTrackingError, Q) + quadraticForm(action.v, R);
    if (options.S) {
      const du = matSub(uk, uPrev);
      cost += quadraticForm(du, options.S);
    }
    
    // 4. Observer Time Update
    // xHat_pred(k+1) = A_aug * xHat_current + B_aug * uk
    xHat = matAdd(matMul(A_aug, xHat_current), matMul(B_aug, uk));
    
    u.push(uk);
    xTrue.push(xNext);
    xHatLog.push(cloneMatrix(xHat));
    trackingErrors.push(mpcTrackingError(yRef, yk));
    totalCost += cost;
    uPrev = uk;
  }

  return {
    x: xTrue,
    xHat: xHatLog,
    u,
    y,
    trackingErrors,
    totalCost,
    finalTrackingErrorNormInf: maxAbsMatrix(trackingErrors[trackingErrors.length - 1]),
    steps,
    horizon,
  };
}
