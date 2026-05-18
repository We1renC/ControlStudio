/**
 * ekf.js — Extended Kalman Filter (EKF) and Unscented Kalman Filter (UKF).
 *
 * EKF: linearizes nonlinear dynamics around the current estimate using Jacobians.
 * UKF: propagates a set of sigma points through the nonlinear function (no Jacobians needed).
 *
 * Both operate in discrete time. Input/output sequences are arrays of column vectors
 * (represented as plain number arrays for SISO/simple MIMO).
 */

import {
  matMul,
  matAdd,
  matSub,
  matTranspose,
  matIdentity,
  matInverse,
  matSymmetrize,
  matScale,
} from '../math/matrix.js';
import { randn } from '../math/rng.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Column-vector outer-product: result[i][j] = a[i] * b[j]
 */
function outerProduct(a, b) {
  return a.map((ai) => b.map((bj) => ai * bj));
}

/**
 * Cholesky decomposition: returns lower-triangular L such that A = L·L^T.
 * A must be symmetric positive-definite.
 */
function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('Matrix not positive definite for Cholesky');
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Joseph form covariance update for numerical stability.
 *   P_new = (I - K·H)·P·(I - K·H)^T + K·R·K^T
 */
function josephForm(n, K, H, P, R) {
  const I = matIdentity(n);
  const KH = matMul(K, H);
  const ImKH = matSub(I, KH);
  const ImKHt = matTranspose(ImKH);
  const Kt = matTranspose(K);
  const part1 = matMul(matMul(ImKH, P), ImKHt);
  const part2 = matMul(matMul(K, R), Kt);
  return matSymmetrize(matAdd(part1, part2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Numerical Jacobian: J[i][j] = ∂f_i/∂x_j via central difference.
 * @param {function} f - f(x: number[]) → number[]
 * @param {number[]} x - evaluation point
 * @param {number} [h=1e-5] - step size
 * @returns {number[][]} - Jacobian matrix (m rows × n cols)
 */
export function numericalJacobian(f, x, h = 1e-5) {
  const n = x.length;
  const f0 = f(x);
  const m = f0.length;
  const J = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const xp = [...x]; xp[j] += h;
    const xm = [...x]; xm[j] -= h;
    const fp = f(xp);
    const fm = f(xm);
    for (let i = 0; i < m; i++) {
      J[i][j] = (fp[i] - fm[i]) / (2 * h);
    }
  }
  return J;
}

/**
 * Run Extended Kalman Filter (EKF) on a sequence of measurements.
 *
 * @param {function} f - Discrete state transition: f(x, u, k) → x_next (nonlinear)
 * @param {function} hFunc - Measurement function: hFunc(x, k) → y (nonlinear)
 * @param {number[][]} uSeq - control inputs u[k], each is a number[] (or scalar array)
 * @param {number[][]} ySeq - measurements y[k], each is a number[] (or scalar array)
 * @param {number[][]} Q - process noise covariance (n×n)
 * @param {number[][]} R - measurement noise covariance (p×p)
 * @param {number[][]} P0 - initial error covariance (n×n)
 * @param {number[]} x0hat - initial state estimate (n)
 * @param {object} [options]
 * @param {function} [options.Fjacobian] - (x,u,k)→F matrix; uses numericalJacobian if omitted
 * @param {function} [options.Hjacobian] - (x,k)→H matrix; uses numericalJacobian if omitted
 * @returns {{ xhat: number[][], P: number[][][], innovations: number[][] }}
 *   xhat[k] = posterior state estimate at time k
 *   P[k] = posterior covariance at time k
 *   innovations[k] = y[k] - h(x_prior[k]) (innovation vector)
 */
export function simulateEKF(f, hFunc, uSeq, ySeq, Q, R, P0, x0hat, options = {}) {
  const N = ySeq.length;
  const n = x0hat.length;

  const xhat = [];
  const P = [];
  const innovations = [];

  let xCur = [...x0hat];
  let PCur = P0.map((row) => [...row]);

  for (let k = 0; k < N; k++) {
    const u = uSeq[k] ?? [];
    const y = ySeq[k];

    // --- PREDICT ---
    const xPrior = f(xCur, u, k);

    // Jacobian F = ∂f/∂x at (xCur, u, k)
    const F = options.Fjacobian
      ? options.Fjacobian(xCur, u, k)
      : numericalJacobian((x) => f(x, u, k), xCur);

    const Ft = matTranspose(F);
    const PPrior = matSymmetrize(matAdd(matMul(matMul(F, PCur), Ft), Q));

    // --- UPDATE ---
    // Jacobian H = ∂h/∂x at (xPrior, k)
    const H = options.Hjacobian
      ? options.Hjacobian(xPrior, k)
      : numericalJacobian((x) => hFunc(x, k), xPrior);

    const Ht = matTranspose(H);
    const S = matAdd(matMul(matMul(H, PPrior), Ht), R);
    const Sinv = matInverse(S);
    const K = matMul(matMul(PPrior, Ht), Sinv);  // n×p

    const yPred = hFunc(xPrior, k);
    const innov = y.map((yi, i) => yi - yPred[i]);

    // x̂_k = x_prior + K·innov
    const Kinnov = K.map((row) => row.reduce((s, ki, i) => s + ki * innov[i], 0));
    const xPost = xPrior.map((xi, i) => xi + Kinnov[i]);

    // Joseph form covariance update
    const PPost = josephForm(n, K, H, PPrior, R);

    xhat.push(xPost);
    P.push(PPost);
    innovations.push(innov);

    xCur = xPost;
    PCur = PPost;
  }

  return { xhat, P, innovations };
}

/**
 * Run Unscented Kalman Filter (UKF) — sigma-point based, no Jacobians needed.
 * Uses the standard scaled unscented transform with parameters (α=1e-3, β=2, κ=0).
 *
 * @param {function} f - Discrete state transition: f(x, u, k) → x_next
 * @param {function} hFunc - Measurement function: hFunc(x, k) → y
 * @param {number[][]} uSeq - control inputs u[k]
 * @param {number[][]} ySeq - measurements y[k]
 * @param {number[][]} Q - process noise covariance (n×n)
 * @param {number[][]} R - measurement noise covariance (p×p)
 * @param {number[][]} P0 - initial error covariance (n×n)
 * @param {number[]} x0hat - initial state estimate (n)
 * @param {object} [options]
 * @param {number} [options.alpha=1e-3]
 * @param {number} [options.beta=2]
 * @param {number} [options.kappa=0]
 * @returns {{ xhat: number[][], P: number[][][], innovations: number[][] }}
 */
export function simulateUKF(f, hFunc, uSeq, ySeq, Q, R, P0, x0hat, options = {}) {
  const N = ySeq.length;
  const n = x0hat.length;
  const alpha = options.alpha ?? 1e-3;
  const beta = options.beta ?? 2;
  const kappa = options.kappa ?? 0;

  const lambda = alpha * alpha * (n + kappa) - n;
  const nL = n + lambda;

  // Weights
  const Wm = new Array(2 * n + 1).fill(1 / (2 * nL));
  Wm[0] = lambda / nL;
  const Wc = [...Wm];
  Wc[0] = lambda / nL + (1 - alpha * alpha + beta);

  const xhat = [];
  const P = [];
  const innovations = [];

  let xCur = [...x0hat];
  let PCur = P0.map((row) => [...row]);

  for (let k = 0; k < N; k++) {
    const u = uSeq[k] ?? [];
    const y = ySeq[k];

    // --- Sigma points ---
    const L = cholesky(PCur);
    const scale = Math.sqrt(nL);

    // chi[0..2n]: sigma points as number[] arrays
    const chi = new Array(2 * n + 1);
    chi[0] = [...xCur];
    for (let i = 0; i < n; i++) {
      // column i of L, scaled
      const col = L.map((row) => row[i] * scale);
      chi[i + 1]     = xCur.map((xi, idx) => xi + col[idx]);
      chi[n + i + 1] = xCur.map((xi, idx) => xi - col[idx]);
    }

    // --- PREDICT: propagate sigma points through f ---
    const chiPred = chi.map((sig) => f(sig, u, k));

    // Predicted mean
    const xPrior = new Array(n).fill(0);
    for (let i = 0; i <= 2 * n; i++) {
      for (let j = 0; j < n; j++) xPrior[j] += Wm[i] * chiPred[i][j];
    }

    // Predicted covariance
    let PPrior = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i <= 2 * n; i++) {
      const diff = chiPred[i].map((v, j) => v - xPrior[j]);
      const op = outerProduct(diff, diff);
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          PPrior[r][c] += Wc[i] * op[r][c];
    }
    PPrior = matSymmetrize(matAdd(PPrior, Q));

    // Re-draw sigma points from predicted distribution for update step
    let Lpred;
    try {
      Lpred = cholesky(PPrior);
    } catch {
      // If not PD, add small regularization
      const eps = 1e-8;
      const PPriorReg = PPrior.map((row, i) => row.map((v, j) => v + (i === j ? eps : 0)));
      Lpred = cholesky(PPriorReg);
    }

    const chiUpdate = new Array(2 * n + 1);
    chiUpdate[0] = [...xPrior];
    for (let i = 0; i < n; i++) {
      const col = Lpred.map((row) => row[i] * scale);
      chiUpdate[i + 1]     = xPrior.map((xi, idx) => xi + col[idx]);
      chiUpdate[n + i + 1] = xPrior.map((xi, idx) => xi - col[idx]);
    }

    // --- UPDATE: propagate sigma points through h ---
    const gammaSeq = chiUpdate.map((sig) => hFunc(sig, k));
    const p = gammaSeq[0].length;

    // Innovation mean
    const yPred = new Array(p).fill(0);
    for (let i = 0; i <= 2 * n; i++)
      for (let j = 0; j < p; j++)
        yPred[j] += Wm[i] * gammaSeq[i][j];

    // Innovation covariance Syy and cross-covariance Pxy
    let Syy = Array.from({ length: p }, () => new Array(p).fill(0));
    let Pxy = Array.from({ length: n }, () => new Array(p).fill(0));

    for (let i = 0; i <= 2 * n; i++) {
      const dx = chiUpdate[i].map((v, j) => v - xPrior[j]);
      const dy = gammaSeq[i].map((v, j) => v - yPred[j]);
      for (let r = 0; r < p; r++)
        for (let c = 0; c < p; c++)
          Syy[r][c] += Wc[i] * dy[r] * dy[c];
      for (let r = 0; r < n; r++)
        for (let c = 0; c < p; c++)
          Pxy[r][c] += Wc[i] * dx[r] * dy[c];
    }
    Syy = matAdd(Syy, R);

    const Syyinv = matInverse(Syy);
    const K = matMul(Pxy, Syyinv);  // n×p

    const innov = y.map((yi, i) => yi - yPred[i]);
    const Kinnov = K.map((row) => row.reduce((s, ki, i) => s + ki * innov[i], 0));
    const xPost = xPrior.map((xi, i) => xi + Kinnov[i]);

    // Covariance: P = P_prior - K·Syy·K^T
    const Kt = matTranspose(K);
    const PPost = matSymmetrize(matSub(PPrior, matMul(matMul(K, Syy), Kt)));

    xhat.push(xPost);
    P.push(PPost);
    innovations.push(innov);

    xCur = xPost;
    PCur = PPost;
  }

  return { xhat, P, innovations };
}

/**
 * Convenience: run EKF (or UKF) on a linearized discrete-time SS model {Ad, Bd, Cd}
 * + a step control sequence. Simulates the true states from the model with process
 * noise, then runs EKF/UKF on the simulated measurements.
 *
 * @param {{Ad:number[][], Bd:number[][], Cd:number[][]}} model
 * @param {number[][]} uSeq - control sequence (length N), each element is number[]
 * @param {number[][]} Q - process noise covariance (n×n)
 * @param {number[][]} R - measurement noise covariance (p×p)
 * @param {object} [options]
 * @param {number[]} [options.x0] - true initial state (zeros if omitted)
 * @param {number[]} [options.x0hat] - estimated initial state (zeros if omitted)
 * @param {number[][]} [options.P0] - initial EKF covariance (I if omitted)
 * @param {boolean} [options.useUKF=false] - use UKF instead of EKF
 * @returns {{ t: number[], xTrue: number[][], xhat: number[][], y: number[][], innovations: number[][] }}
 */
export function runLinearEKF(model, uSeq, Q, R, options = {}) {
  const { Ad, Bd, Cd } = model;
  const n = Ad.length;
  const p = Cd.length;
  const N = uSeq.length;

  const x0 = options.x0 ?? new Array(n).fill(0);
  const x0hat = options.x0hat ?? new Array(n).fill(0);
  const P0 = options.P0 ?? matIdentity(n);
  const useUKF = options.useUKF ?? false;

  // Cholesky of Q for process noise sampling
  let Lq;
  try {
    Lq = cholesky(Q);
  } catch {
    // Q may be zero or near-zero — use zero noise
    Lq = Array.from({ length: n }, () => new Array(n).fill(0));
  }

  // Cholesky of R for measurement noise sampling
  let Lr;
  try {
    Lr = cholesky(R);
  } catch {
    Lr = Array.from({ length: p }, () => new Array(p).fill(0));
  }

  // Simulate true trajectory
  const t = Array.from({ length: N }, (_, k) => k);
  const xTrue = [];
  const y = [];

  let xCur = [...x0];
  for (let k = 0; k < N; k++) {
    const u = uSeq[k];

    // Measurement y[k] = Cd·x + R-noise
    const yK = Cd.map((row) => row.reduce((s, cij, j) => s + cij * xCur[j], 0));
    const rNoise = Lr.map((row) => row.reduce((s, lij) => s + lij * randn(), 0));
    y.push(yK.map((yi, i) => yi + rNoise[i]));

    xTrue.push([...xCur]);

    // Propagate: x_{k+1} = Ad·x + Bd·u + Q-noise
    const Adx = Ad.map((row) => row.reduce((s, aij, j) => s + aij * xCur[j], 0));
    const Bdu = Bd.map((row) => row.reduce((s, bij, j) => s + bij * u[j], 0));
    const qNoise = Lq.map((row) => row.reduce((s, lij) => s + lij * randn(), 0));
    xCur = Adx.map((v, i) => v + Bdu[i] + qNoise[i]);
  }

  // Define f and h for the filter
  const f = (x, u) => {
    const Adx = Ad.map((row) => row.reduce((s, aij, j) => s + aij * x[j], 0));
    const Bdu = Bd.map((row) => row.reduce((s, bij, j) => s + bij * u[j], 0));
    return Adx.map((v, i) => v + Bdu[i]);
  };
  const hFunc = (x) => Cd.map((row) => row.reduce((s, cij, j) => s + cij * x[j], 0));

  // Analytical Jacobians for EKF (they are constant for linear models)
  const Fjacobian = () => Ad;
  const Hjacobian = () => Cd;

  let result;
  if (useUKF) {
    result = simulateUKF(f, hFunc, uSeq, y, Q, R, P0, x0hat);
  } else {
    result = simulateEKF(f, hFunc, uSeq, y, Q, R, P0, x0hat, { Fjacobian, Hjacobian });
  }

  return {
    t,
    xTrue,
    xhat: result.xhat,
    y,
    innovations: result.innovations,
  };
}
