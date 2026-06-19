/**
 * deepc.js — Data-Enabled Predictive Control (DeePC) baseline.
 *
 * Loop 2 (Zero-Flaw) addition. ControlStudio had no Hankel-based DeePC and
 * no Willems' fundamental lemma implementation. Without these the entire
 * 2019+ data-driven predictive control literature (Coulson-Lygeros-Dörfler,
 * Berberich, Köhler, et al.) cannot be replicated here.
 *
 * Setup:
 *   Given persistently exciting input data u_d of length T_d ≥ (m + 1)*(L + n)
 *   with L = Tini + N and corresponding output data y_d, build Hankel matrices
 *     U_p, U_f (block past / future input), Y_p, Y_f (output) of depth L.
 *   At runtime, with most recent (u_ini, y_ini) of length Tini, find a vector
 *   g such that
 *     [ U_p ]       [ u_ini ]
 *     [ Y_p ] g  =  [ y_ini ]
 *     [ U_f ]       [ u^* ]
 *     [ Y_f ]       [ y^* ]
 *   solving the regularised QP
 *     min  ||y^* − r||_Q^2 + ||u^*||_R^2 + λ_g ||g||^2 + λ_s ||σ_y||^2
 *     s.t. U_p g = u_ini, Y_p g + σ_y = y_ini, U_f g = u^*, Y_f g = y^*
 *
 * The implementation provides:
 *   1. `buildHankel(data, depth)` — block-Hankel matrix utility.
 *   2. `checkPersistentExcitation(u, order)` — Hankel-row rank test
 *      certifying Willems' fundamental lemma applicability.
 *   3. `deepcPredict(uIni, yIni, ref, ...)` — one-shot DeePC step returning
 *      future input and predicted output.
 *
 * Reference:
 *   - Willems, Rapisarda, Markovsky, De Moor, "A note on persistency of
 *     excitation", Sys. & Ctrl. Letters 54 (2005).
 *   - Coulson, Lygeros, Dörfler, "Data-Enabled Predictive Control: In the
 *     Shallows of the DeePC", ECC 2019.
 *   - Berberich, Köhler, Müller, Allgöwer, "Data-driven model predictive
 *     control with stability and robustness guarantees", IEEE TAC 2021.
 */

import {
  matCreate, matMul, matSolve, matTranspose, matIdentity, matAdd, matScale,
  matRank, matVecMul,
} from '../math/matrix.js';

// ── Hankel utilities ───────────────────────────────────────────────────────

/**
 * Build a block-Hankel matrix from a length-T scalar (or vector-stacked) signal.
 *   H_L(u) = [ u(0)    u(1)    …  u(T-L) ]
 *            [ u(1)    u(2)    …  u(T-L+1) ]
 *            [   …      …      …    …     ]
 *            [ u(L-1)  u(L)    …  u(T-1)  ]
 *
 * `data` may be a flat array (scalar signal) or array-of-arrays where each
 * inner array is a vector sample at the corresponding time step.
 */
export function buildHankel(data, depth) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('hankel: data must be non-empty');
  }
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error('hankel: depth must be a positive integer');
  }
  const T = data.length;
  if (depth > T) throw new Error(`hankel: depth (${depth}) > signal length (${T})`);
  const vec = Array.isArray(data[0]) ? data : data.map((v) => [v]);
  const d = vec[0].length;
  const cols = T - depth + 1;
  const H = matCreate(depth * d, cols, 0);
  for (let i = 0; i < depth; i++) {
    for (let j = 0; j < cols; j++) {
      const sample = vec[i + j];
      for (let k = 0; k < d; k++) H[i * d + k][j] = sample[k];
    }
  }
  return H;
}

/**
 * Persistent excitation check: u of order L iff rank(H_L(u)) = m * L,
 * where m is the input dimension.
 */
export function checkPersistentExcitation(u, depth, options = {}) {
  const H = buildHankel(u, depth);
  const rank = matRank(H, options.tol ?? 1e-9);
  const m = Array.isArray(u[0]) ? u[0].length : 1;
  return {
    rank,
    requiredRank: m * depth,
    persistent: rank === m * depth,
  };
}

// ── DeePC step ─────────────────────────────────────────────────────────────

/**
 * One-shot DeePC computation:
 *   - Build U_p, Y_p, U_f, Y_f from (uData, yData) with horizons Tini and N.
 *   - Solve the regularised quadratic program in g via normal equations.
 *
 * Inputs:
 *   uData, yData : flat arrays of past observed signals (scalar I/O assumed).
 *   Tini, N      : past horizon, prediction horizon.
 *   uIni, yIni   : current windowed past inputs/outputs (length Tini each).
 *   ref          : reference future trajectory of length N.
 *   weights      : { Q, R, lambdaG, lambdaS } scalar weights.
 *
 * Returns { uFuture, yFuture, gNorm, sigmaY, condition }.
 */
export function deepcPredict(uData, yData, Tini, N, uIni, yIni, ref, weights = {}) {
  if (uData.length !== yData.length) throw new Error('DeePC: u/y data length mismatch');
  if (uIni.length !== Tini) throw new Error('DeePC: uIni length must equal Tini');
  if (yIni.length !== Tini) throw new Error('DeePC: yIni length must equal Tini');
  if (ref.length !== N)     throw new Error('DeePC: ref length must equal N');
  if (Tini < 1 || N < 1)    throw new Error('DeePC: Tini and N must be ≥ 1');

  const L = Tini + N;
  const Uhank = buildHankel(uData, L);
  const Yhank = buildHankel(yData, L);
  const cols = Uhank[0].length;
  if (cols < 1) throw new Error('DeePC: insufficient data length for L = Tini + N');

  // Slice into past/future block rows.
  const Up = Uhank.slice(0, Tini);
  const Uf = Uhank.slice(Tini, L);
  const Yp = Yhank.slice(0, Tini);
  const Yf = Yhank.slice(Tini, L);

  const lambdaG = weights.lambdaG ?? 1.0;
  const lambdaS = weights.lambdaS ?? 1e4;
  const Q = weights.Q ?? 10;
  const R = weights.R ?? 0.1;

  // We choose to enforce U_p g = u_ini exactly and add slack σ_y on Y_p
  // (standard DeePC formulation). g has dimension `cols`.
  //
  // Decision variable z = [g; σ_y] with cols + Tini entries.
  // Cost: Q ||Y_f g − r||^2 + R ||U_f g||^2 + λ_g ||g||^2 + λ_s ||σ_y||^2
  // Equality: U_p g            = u_ini
  //           Y_p g + σ_y       = y_ini
  //
  // Solve via KKT linear system.

  const nG = cols;
  const nS = Tini;
  const nZ = nG + nS;
  const nEq = 2 * Tini;

  // Build Hessian H (nZ × nZ) for cost.
  const H = matCreate(nZ, nZ, 0);
  // Q * Y_f^T Y_f
  const YfT_Yf = matMul(matTranspose(Yf), Yf);
  for (let i = 0; i < nG; i++) for (let j = 0; j < nG; j++) H[i][j] += Q * YfT_Yf[i][j];
  // R * U_f^T U_f
  const UfT_Uf = matMul(matTranspose(Uf), Uf);
  for (let i = 0; i < nG; i++) for (let j = 0; j < nG; j++) H[i][j] += R * UfT_Uf[i][j];
  // λ_g I on g block
  for (let i = 0; i < nG; i++) H[i][i] += lambdaG;
  // λ_s I on σ_y block
  for (let i = 0; i < nS; i++) H[nG + i][nG + i] += lambdaS;

  // Linear term f (nZ).
  const f = new Array(nZ).fill(0);
  // -Q * (Y_f^T r)
  const YfT_r = matVecMul(matTranspose(Yf), ref);
  for (let i = 0; i < nG; i++) f[i] += -Q * YfT_r[i];

  // Equality A_eq z = b_eq.
  const Aeq = matCreate(nEq, nZ, 0);
  const beq = new Array(nEq).fill(0);
  // U_p g = u_ini
  for (let i = 0; i < Tini; i++) {
    for (let j = 0; j < nG; j++) Aeq[i][j] = Up[i][j];
    beq[i] = uIni[i];
  }
  // Y_p g + σ_y = y_ini
  for (let i = 0; i < Tini; i++) {
    for (let j = 0; j < nG; j++) Aeq[Tini + i][j] = Yp[i][j];
    Aeq[Tini + i][nG + i] = 1;
    beq[Tini + i] = yIni[i];
  }

  // Build KKT [ H  A_eq^T ] [z]   [ -f ]
  //           [ A_eq  0   ] [ν] = [  b_eq ]
  const N_kkt = nZ + nEq;
  const K = matCreate(N_kkt, N_kkt, 0);
  for (let i = 0; i < nZ; i++) for (let j = 0; j < nZ; j++) K[i][j] = H[i][j];
  for (let i = 0; i < nEq; i++) for (let j = 0; j < nZ; j++) {
    K[nZ + i][j] = Aeq[i][j];
    K[j][nZ + i] = Aeq[i][j];
  }
  const rhs = new Array(N_kkt).fill(0);
  for (let i = 0; i < nZ; i++) rhs[i] = -f[i];
  for (let i = 0; i < nEq; i++) rhs[nZ + i] = beq[i];

  const sol = matSolve(K, rhs);
  const g = sol.slice(0, nG);
  const sigmaY = sol.slice(nG, nG + nS);
  const uFuture = matVecMul(Uf, g);
  const yFuture = matVecMul(Yf, g);

  let gNorm = 0;
  for (const v of g) gNorm += v * v;
  gNorm = Math.sqrt(gNorm);

  return { uFuture, yFuture, gNorm, sigmaY };
}
