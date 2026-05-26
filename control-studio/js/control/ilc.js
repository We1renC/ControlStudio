/**
 * ilc.js — Tier A2: Iterative Learning Control
 *
 * Three variants:
 *   1. P-type:   u_{k+1}(t) = u_k(t) + gamma * e_k(t)
 *   2. PD-type:  u_{k+1}(t) = u_k(t) + gamma_p * e_k(t) + gamma_d * (e_k(t+1) - e_k(t))/dt
 *   3. NOILC:    closed-form, min ||e_{k+1}||_Q + ||u_{k+1} - u_k||_R
 *                u_{k+1} = u_k + (G'QG + R)^-1 G'Q e_k
 *                where G = lifted (Toeplitz) system matrix for finite horizon N
 *
 * For SISO discrete linear plant  y_{k+1} = a*y_k + b*u_k  the lifted matrix is:
 *
 *   y_lifted = G * u_lifted
 *
 *   G[i][j] = b * a^(i-j)   for j <= i,  else 0   (lower-triangular Toeplitz)
 *
 * Convergence condition (P-type):  spectral_radius(I - gamma * G) < 1
 * For first-order plant, G[0][0] = b dominates, so |1 - gamma * b| < 1 is sufficient
 * for monotone decrease in the lifted L2 norm (when gamma * G is positive).
 */

import {
  matIdentity, matSub, matMul, matTranspose, matAdd, matSolve, matScale,
} from '../math/matrix.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build lifted system matrix G of size NxN for SISO first-order plant
 *   y_{k+1} = a * y_k + b * u_k,  y_0 = 0
 * G[i][j] = b * a^(i-j) for j <= i, 0 otherwise. Lower-triangular Toeplitz.
 */
export function buildLiftedMatrix(a, b, N) {
  const G = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= i; j++) {
      G[i][j] = b * Math.pow(a, i - j);
    }
  }
  return G;
}

/**
 * Spectral radius of (I - gamma * G) where G is N x N lower-triangular Toeplitz.
 * For lower-triangular matrices, eigenvalues = diagonal entries.
 * (I - gamma*G) has diagonal entries = 1 - gamma*b (since G[i][i] = b for all i).
 * So spectral radius simply = |1 - gamma * b|.
 */
function spectralRadiusForPType(G, gamma) {
  // exploit triangular structure
  let maxAbs = 0;
  for (let i = 0; i < G.length; i++) {
    const eig = 1 - gamma * G[i][i];
    if (Math.abs(eig) > maxAbs) maxAbs = Math.abs(eig);
  }
  return maxAbs;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Design an ILC controller.
 *
 * @param {object} opts
 * @param {'Ptype'|'PDtype'|'NOILC'} opts.type
 * @param {{a, b}}  opts.plant         SISO 1st-order discrete plant.
 * @param {number}  opts.horizon       Trial length N.
 * @param {number}  [opts.gamma]       P-type learning gain.
 * @param {number}  [opts.gamma_p]     PD-type proportional gain.
 * @param {number}  [opts.gamma_d]     PD-type derivative gain.
 * @param {number}  [opts.dt]          Sample time (PD-type only). Default 1.
 * @param {number}  [opts.Q]           NOILC output weight (scalar or matrix).
 * @param {number}  [opts.R]           NOILC input weight (scalar or matrix).
 * @returns {object} ilcDesign
 */
export function designILC(opts) {
  const { type, plant, horizon } = opts;
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new Error('horizon must be a positive integer');
  }
  if (!plant || typeof plant.a !== 'number' || typeof plant.b !== 'number') {
    throw new Error('plant {a, b} required');
  }
  const { a, b } = plant;
  const N = horizon;

  if (type === 'Ptype') {
    const gamma = opts.gamma;
    if (!Number.isFinite(gamma)) throw new Error('gamma required for P-type');
    const G = buildLiftedMatrix(a, b, N);
    return {
      type: 'Ptype', plant: { a, b }, horizon: N, gamma,
      lifted: { G },
      learningOp: { kind: 'scalar', value: gamma },
    };
  }

  if (type === 'PDtype') {
    const gamma_p = opts.gamma_p ?? 0;
    const gamma_d = opts.gamma_d ?? 0;
    const dt = opts.dt ?? 1;
    if (!Number.isFinite(gamma_p) || !Number.isFinite(gamma_d)) {
      throw new Error('gamma_p, gamma_d required for PD-type');
    }
    const G = buildLiftedMatrix(a, b, N);
    return {
      type: 'PDtype', plant: { a, b }, horizon: N, gamma_p, gamma_d, dt,
      lifted: { G },
      learningOp: { kind: 'pd', gamma_p, gamma_d, dt },
    };
  }

  if (type === 'NOILC') {
    const Q = opts.Q;
    const R = opts.R;
    if (!Number.isFinite(Q) || !Number.isFinite(R)) {
      throw new Error('Q, R required for NOILC');
    }
    if (Q <= 0 || R <= 0) throw new Error('Q, R must be positive');
    const G = buildLiftedMatrix(a, b, N);
    const Gt = matTranspose(G);
    // M = G'QG + R*I   (since Q, R are scalar weights here)
    const Qmat = matScale(matIdentity(N), Q);
    const Rmat = matScale(matIdentity(N), R);
    const GtQ = matMul(Gt, Qmat);
    const GtQG = matMul(GtQ, G);
    const M = matAdd(GtQG, Rmat);
    // L = M^-1 G' Q  (apply as L * e)
    const L = matSolve(M, GtQ);
    return {
      type: 'NOILC', plant: { a, b }, horizon: N, Q, R,
      lifted: { G, M, L },
      learningOp: { kind: 'matrix', L },
    };
  }

  throw new Error(`Unknown ILC type: ${type}`);
}

/**
 * Perform one ILC iteration.
 * @param {object}   ilc       From designILC().
 * @param {number[]} e_k       Error vector (length N).
 * @param {number[]} u_k       Current control vector (length N).
 * @param {number}   iter      Iteration count (for logging).
 * @returns {{u_next, e_norm, iter}}
 */
export function iterateILC(ilc, e_k, u_k, iter) {
  const N = ilc.horizon;
  if (e_k.length !== N || u_k.length !== N) {
    throw new Error(`e_k and u_k must have length ${N}`);
  }
  const u_next = new Array(N);

  if (ilc.type === 'Ptype') {
    const gamma = ilc.gamma;
    for (let i = 0; i < N; i++) u_next[i] = u_k[i] + gamma * e_k[i];
  } else if (ilc.type === 'PDtype') {
    const { gamma_p, gamma_d, dt } = ilc;
    for (let i = 0; i < N; i++) {
      const eNext = i < N - 1 ? e_k[i + 1] : e_k[i];
      const de = (eNext - e_k[i]) / dt;
      u_next[i] = u_k[i] + gamma_p * e_k[i] + gamma_d * de;
    }
  } else if (ilc.type === 'NOILC') {
    const L = ilc.lifted.L;
    // Du = L * e
    for (let i = 0; i < N; i++) {
      let du = 0;
      for (let j = 0; j < N; j++) du += L[i][j] * e_k[j];
      u_next[i] = u_k[i] + du;
    }
  } else {
    throw new Error(`Unknown ILC type: ${ilc.type}`);
  }

  const e_norm = Math.sqrt(e_k.reduce((s, v) => s + v * v, 0));
  return { u_next, e_norm, iter };
}

/**
 * Check convergence:  rho = spectral radius of (I - L*G).
 * For P-type: L = gamma*I -> rho = |1 - gamma*b| (triangular eigenvalues).
 * For NOILC: rho is generally << 1 by construction.
 */
export function ilcConvergenceCheck(ilc) {
  const G = ilc.lifted.G;
  let rho;
  if (ilc.type === 'Ptype') {
    rho = spectralRadiusForPType(G, ilc.gamma);
  } else if (ilc.type === 'NOILC') {
    // (I - L*G), use diagonal extraction (NOILC L*G is dense but symmetric near identity)
    const N = G.length;
    const L = ilc.lifted.L;
    const LG = matMul(L, G);
    const IminusLG = matSub(matIdentity(N), LG);
    // spectral radius approximation via max row-sum (Frobenius/inf-norm upper bound)
    let maxRowSum = 0;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) s += Math.abs(IminusLG[i][j]);
      if (s > maxRowSum) maxRowSum = s;
    }
    rho = maxRowSum;
  } else if (ilc.type === 'PDtype') {
    rho = spectralRadiusForPType(G, ilc.gamma_p);
  } else {
    rho = NaN;
  }
  return {
    spectralRadius: rho,
    monotone: Number.isFinite(rho) && rho < 1,
  };
}
