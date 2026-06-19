/**
 * nonlinear_observers.js — Sliding-Mode Observer (SMO) and high-gain
 * observer (HGO) baselines.
 *
 * Loop 7 (Zero-Flaw) addition.
 *
 * Edwards-Spurgeon SMO (scalar output, single-input chain):
 *   x̂_1' = x̂_2 + L_1 ν(y - x̂_1)
 *   x̂_2' = x̂_3 + L_2 ν(y - x̂_1)
 *   …
 *   ν(e) = sign(e)         (boundary-layer smoothing: tanh(e/φ))
 *
 * Khalil high-gain observer:
 *   x̂' = A x̂ + B u + (1/ε) L (y - C x̂)
 *   where L = [α_1; α_2/ε; …; α_n/ε^{n-1}] gives observer poles at
 *   −1/ε (multiplicity n) for ε → 0, providing arbitrarily fast convergence
 *   at the cost of peaking.
 *
 * Reference:
 *   - Edwards, Spurgeon, "Sliding Mode Control: Theory and Applications",
 *     Taylor & Francis 1998.
 *   - Khalil, "High-gain observers in nonlinear feedback control", SIAM
 *     Frontiers in Applied Math, 2017.
 *   - Slotine, Li, "Applied Nonlinear Control", §6.3.
 */

import { matVecMul, matMul, matSub } from '../math/matrix.js';

function tanhSat(e, phi) {
  if (phi <= 0) return Math.sign(e);
  return Math.tanh(e / phi);
}

/**
 * Edwards-Spurgeon sliding-mode observer for a controllable-canonical
 * chain ẋ_1 = x_2, …, ẋ_n = f(x) + g(x) u, y = x_1.
 *
 * @param {object} plant - { f, g } callables returning scalar or vector
 * @param {object} options - { Ts, gains: number[], phi: boundary-layer width }
 * @param {object} initial - { x0: number[], xHat0: number[] }
 * @returns simulation result with arrays t, xHat, residual
 */
export function simulateSlidingModeObserver(plant, refSignal, uSignal, options = {}) {
  const Ts = options.Ts ?? 1e-3;
  const gains = options.gains;
  if (!Array.isArray(gains)) throw new Error('SMO: gains array required');
  const phi = options.phi ?? 0.05;
  if (!Array.isArray(refSignal) || !Array.isArray(uSignal)) {
    throw new Error('SMO: refSignal and uSignal arrays required');
  }
  if (refSignal.length !== uSignal.length) throw new Error('SMO: ref/u length mismatch');
  const N = gains.length;
  let x = options.x0?.slice() ?? new Array(N).fill(0);
  let xHat = options.xHat0?.slice() ?? new Array(N).fill(0);
  const T = refSignal.length;
  const t = new Array(T), trueX = new Array(T), estX = new Array(T), err = new Array(T);
  for (let k = 0; k < T; k++) {
    t[k] = k * Ts;
    trueX[k] = x.slice();
    estX[k] = xHat.slice();
    err[k] = x[0] - xHat[0];
    // Plant integration (Euler)
    const fX = plant.f(x);
    const gX = plant.g(x);
    const xn = new Array(N);
    for (let i = 0; i < N - 1; i++) xn[i] = x[i] + Ts * x[i + 1];
    xn[N - 1] = x[N - 1] + Ts * (fX + gX * uSignal[k]);
    x = xn;
    // Observer integration
    const sat = tanhSat(refSignal[k] - xHat[0], phi);
    const fHat = plant.f(xHat);
    const gHat = plant.g(xHat);
    const xhn = new Array(N);
    for (let i = 0; i < N - 1; i++) xhn[i] = xHat[i] + Ts * (xHat[i + 1] + gains[i] * sat);
    xhn[N - 1] = xHat[N - 1] + Ts * (fHat + gHat * uSignal[k] + gains[N - 1] * sat);
    xHat = xhn;
  }
  return { t, trueX, estX, err };
}

/**
 * Khalil-style high-gain observer for SISO chain. The gain vector
 * L = [α_1/ε; α_2/ε²; …; α_n/ε^n] is generated from the user-supplied
 * stable polynomial coefficients α (descending) and a small parameter ε.
 */
export function simulateHighGainObserver(plant, refSignal, uSignal, options = {}) {
  const Ts = options.Ts ?? 1e-3;
  const epsilon = options.epsilon ?? 0.05;
  const alpha = options.alpha;
  if (!Array.isArray(alpha)) throw new Error('HGO: alpha coefficients required');
  if (!(epsilon > 0)) throw new Error('HGO: epsilon must be > 0');
  const N = alpha.length;
  let x = options.x0?.slice() ?? new Array(N).fill(0);
  let xHat = options.xHat0?.slice() ?? new Array(N).fill(0);
  // Build L vector
  const L = new Array(N);
  for (let i = 0; i < N; i++) L[i] = alpha[i] / Math.pow(epsilon, i + 1);
  const T = refSignal.length;
  const t = new Array(T), estX = new Array(T), err = new Array(T);
  for (let k = 0; k < T; k++) {
    t[k] = k * Ts;
    estX[k] = xHat.slice();
    err[k] = refSignal[k] - xHat[0];
    // Plant integration (Euler)
    const fX = plant.f(x);
    const gX = plant.g(x);
    const xn = new Array(N);
    for (let i = 0; i < N - 1; i++) xn[i] = x[i] + Ts * x[i + 1];
    xn[N - 1] = x[N - 1] + Ts * (fX + gX * uSignal[k]);
    x = xn;
    // Observer integration
    const e = refSignal[k] - xHat[0];
    const fHat = plant.f(xHat);
    const gHat = plant.g(xHat);
    const xhn = new Array(N);
    for (let i = 0; i < N - 1; i++) xhn[i] = xHat[i] + Ts * (xHat[i + 1] + L[i] * e);
    xhn[N - 1] = xHat[N - 1] + Ts * (fHat + gHat * uSignal[k] + L[N - 1] * e);
    xHat = xhn;
  }
  return { t, estX, err };
}
