// hinf_synth.js — Mixed-sensitivity H∞ cost computation and PID synthesis helper.
//
// True H∞ controller synthesis (Glover-Doyle) requires LMI / Riccati machinery
// beyond the scope of a browser-side tool. Instead, this module provides:
//
//   1. mixedSensitivityCost(W1, W2, W3, L, K) → max σ([W1 S; W2 KS; W3 T])
//      computes the cost over a frequency grid for the current design.
//
//   2. tunePIDForMixedSensitivity(plant, weights, options) → best (Kp, Ki, Kd)
//      runs Nelder-Mead on the PID parameter space to minimise (1).
//
// The weight TFs follow the standard performance / control-effort / robustness
// pattern: W1 ≈ performance (large at low ω), W2 ≈ control effort, W3 ≈ T peak
// constraint (large at high ω).

import { Complex } from '../math/complex.js';
import { rootsToRealPoly } from '../math/polynomial.js';
import { TransferFunction } from './transfer-function.js';
import { PIDController } from './pid.js';

const _onePlus = (Lc) => new Complex(1 + Lc.re, Lc.im);

/**
 * For each frequency, compute the maximum singular value of the stacked sensitivity
 * vector [W1·S ; W2·KS ; W3·T]. In SISO this is simply sqrt(|W1 S|² + |W2 KS|² + |W3 T|²).
 *
 * @param {TransferFunction} W1
 * @param {TransferFunction} W2
 * @param {TransferFunction} W3
 * @param {TransferFunction} loopTf - L = K·G
 * @param {TransferFunction} controllerTf - K
 * @param {number[]} omegas
 * @returns {{ peak: number, peakOmega: number, magArr: number[] }}
 */
export function mixedSensitivityCost(W1, W2, W3, loopTf, controllerTf, omegas) {
  let peak = -Infinity;
  let peakOmega = NaN;
  const magArr = new Array(omegas.length);
  for (let i = 0; i < omegas.length; i++) {
    const omega = omegas[i];
    const s = new Complex(0, omega);
    const L = loopTf.evalAt(s);
    const K = controllerTf ? controllerTf.evalAt(s) : new Complex(1, 0);
    const denom = _onePlus(L);
    if (denom.magnitude < 1e-12) { magArr[i] = Infinity; peak = Infinity; peakOmega = omega; continue; }
    const S = new Complex(1, 0).div(denom);
    const T = L.div(denom);
    const KS = K.mul(S);
    const w1S = W1 ? W1.evalAt(s).mul(S).magnitude : S.magnitude;
    const w2KS = W2 ? W2.evalAt(s).mul(KS).magnitude : 0;
    const w3T = W3 ? W3.evalAt(s).mul(T).magnitude : 0;
    const mag = Math.sqrt(w1S * w1S + w2KS * w2KS + w3T * w3T);
    magArr[i] = mag;
    if (mag > peak) { peak = mag; peakOmega = omega; }
  }
  return { peak, peakOmega, magArr };
}

/**
 * Nelder-Mead simplex search for PID parameters (Kp, Ki, Kd).
 * Minimises the mixed-sensitivity H∞ cost subject to closed-loop stability.
 *
 * @param {TransferFunction} plant
 * @param {{ W1: TransferFunction, W2: TransferFunction, W3: TransferFunction }} weights
 * @param {{ initial?: number[], maxIter?: number, omegas?: number[] }} options
 * @returns {{ Kp, Ki, Kd, cost, history }}
 */
export function tunePIDForMixedSensitivity(plant, weights, options = {}) {
  if (!plant) throw new Error('plant required');
  const omegas = options.omegas || (() => {
    const out = [];
    for (let i = 0; i < 80; i++) out.push(Math.pow(10, -2 + (4 * i) / 79));
    return out;
  })();

  const cost = (params) => {
    const [Kp, Ki, Kd] = params;
    if (!Number.isFinite(Kp) || !Number.isFinite(Ki) || !Number.isFinite(Kd)) return 1e6;
    const pid = new PIDController(Kp, Ki, Kd, 100);
    const C = pid.toTransferFunction();
    const L = C.series(plant);
    const cl = L.feedback();
    if (!cl.isStable()) return 1e6;
    try {
      const r = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, L, C, omegas);
      return Number.isFinite(r.peak) ? r.peak : 1e6;
    } catch { return 1e6; }
  };

  let simplex = (options.initial && options.initial.length === 3
    ? [options.initial.slice()]
    : [[1, 0.5, 0.1]]);
  // Build a non-degenerate initial simplex around the seed
  simplex = [simplex[0], [simplex[0][0] + 0.5, simplex[0][1], simplex[0][2]],
                          [simplex[0][0], simplex[0][1] + 0.2, simplex[0][2]],
                          [simplex[0][0], simplex[0][1], simplex[0][2] + 0.1]];
  let evals = simplex.map(cost);

  const maxIter = options.maxIter || 120;
  const history = [];
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;
  for (let iter = 0; iter < maxIter; iter++) {
    // Sort by cost
    const order = evals.map((c, i) => [c, i]).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    evals = order.map(([c]) => c);
    history.push(evals[0]);
    if (Math.abs(evals[evals.length - 1] - evals[0]) < 1e-6) break;
    // Centroid of best 3
    const centroid = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) centroid[k] += simplex[j][k] / 3;
    }
    const worst = simplex[3];
    const reflect = centroid.map((c, k) => c + alpha * (c - worst[k]));
    const fReflect = cost(reflect);
    if (fReflect < evals[2] && fReflect >= evals[0]) {
      simplex[3] = reflect; evals[3] = fReflect; continue;
    }
    if (fReflect < evals[0]) {
      const expand = centroid.map((c, k) => c + gamma * (reflect[k] - c));
      const fE = cost(expand);
      if (fE < fReflect) { simplex[3] = expand; evals[3] = fE; }
      else { simplex[3] = reflect; evals[3] = fReflect; }
      continue;
    }
    const contract = centroid.map((c, k) => c + rho * (worst[k] - c));
    const fC = cost(contract);
    if (fC < evals[3]) { simplex[3] = contract; evals[3] = fC; continue; }
    // Shrink
    for (let i = 1; i < 4; i++) {
      for (let k = 0; k < 3; k++) simplex[i][k] = simplex[0][k] + sigma * (simplex[i][k] - simplex[0][k]);
      evals[i] = cost(simplex[i]);
    }
  }
  const [Kp, Ki, Kd] = simplex[0];
  return { Kp, Ki, Kd, cost: evals[0], history };
}

function defaultOmegaGrid() {
  const out = [];
  for (let i = 0; i < 100; i++) out.push(Math.pow(10, -2 + (5 * i) / 99));
  return out;
}

function nelderMead(seed, cost, options = {}) {
  const n = seed.length;
  const maxIter = options.maxIter ?? 180;
  const tol = options.tol ?? 1e-7;
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;

  let simplex = [seed.slice()];
  for (let i = 0; i < n; i++) {
    const point = seed.slice();
    const step = options.step?.[i] ?? (Math.abs(seed[i]) > 1e-9 ? 0.15 * Math.abs(seed[i]) : 0.15);
    point[i] += step;
    simplex.push(point);
  }
  let evals = simplex.map(cost);
  const history = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const order = evals.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    evals = order.map(([value]) => value);
    history.push(evals[0]);
    if (Math.abs(evals[n] - evals[0]) < tol) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    }
    const worst = simplex[n];
    const reflected = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fReflected = cost(reflected);

    if (fReflected < evals[n - 1] && fReflected >= evals[0]) {
      simplex[n] = reflected;
      evals[n] = fReflected;
      continue;
    }
    if (fReflected < evals[0]) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const fExpanded = cost(expanded);
      if (fExpanded < fReflected) {
        simplex[n] = expanded;
        evals[n] = fExpanded;
      } else {
        simplex[n] = reflected;
        evals[n] = fReflected;
      }
      continue;
    }

    const contracted = centroid.map((c, j) => c + rho * (worst[j] - c));
    const fContracted = cost(contracted);
    if (fContracted < evals[n]) {
      simplex[n] = contracted;
      evals[n] = fContracted;
      continue;
    }

    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) simplex[i][j] = simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]);
      evals[i] = cost(simplex[i]);
    }
  }

  const order = evals.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]);
  return { best: simplex[order[0][1]], cost: order[0][0], history };
}

function stableDenominatorFromLogPoles(logPoles) {
  const poles = logPoles.map((value) => -Math.exp(Math.max(-8, Math.min(8, value))));
  return { poles, den: rootsToRealPoly(poles) };
}

export function dynamicControllerFromParams(params, order) {
  if (!Number.isInteger(order) || order < 0) throw new Error('controller order must be a non-negative integer');
  const expected = order + 1 + order;
  if (!Array.isArray(params) || params.length !== expected) {
    throw new Error(`expected ${expected} controller parameters for order ${order}`);
  }
  const num = params.slice(0, order + 1);
  const { den, poles } = stableDenominatorFromLogPoles(params.slice(order + 1));
  return {
    controllerTf: new TransferFunction(num, den),
    numerator: num,
    denominator: den,
    poles,
  };
}

/**
 * Fixed/full-order dynamic mixed-sensitivity H∞ synthesis.
 *
 * This solves the same weighted objective as mixedSensitivityCost, but searches
 * over a stable proper dynamic controller K(s)=N(s)/D(s). When order is omitted,
 * it uses plant.order, giving a full-order controller relative to the plant.
 * The implementation is deterministic frequency-domain optimization, suitable
 * for browser-side design review; it is not a Riccati/LMI Glover-Doyle solver.
 */
export function synthesizeDynamicMixedSensitivity(plant, weights, options = {}) {
  if (!plant) throw new Error('plant required');
  const order = options.order ?? Math.max(0, plant.order);
  if (!Number.isInteger(order) || order < 0) throw new Error('order must be a non-negative integer');
  const omegas = options.omegas || defaultOmegaGrid();
  const seed = options.initial && options.initial.length === order + 1 + order
    ? options.initial.slice()
    : [
        ...(options.initialNumerator || Array.from({ length: order + 1 }, (_, i) => (i === 0 ? 1 : 0))),
        ...Array.from({ length: order }, (_, i) => Math.log((i + 1) * (options.poleSpacing ?? 1))),
      ];

  const cost = (params) => {
    if (params.some((value) => !Number.isFinite(value))) return 1e9;
    try {
      const { controllerTf } = dynamicControllerFromParams(params, order);
      const L = controllerTf.series(plant);
      const cl = L.feedback();
      if (!cl.isStable()) return 1e8;
      const result = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, L, controllerTf, omegas);
      return Number.isFinite(result.peak) ? result.peak : 1e8;
    } catch (_) {
      return 1e9;
    }
  };

  const search = nelderMead(seed, cost, {
    maxIter: options.maxIter ?? 220,
    tol: options.tol ?? 1e-7,
    step: options.step,
  });
  const controller = dynamicControllerFromParams(search.best, order);
  const loopTf = controller.controllerTf.series(plant);
  const result = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, loopTf, controller.controllerTf, omegas);
  return {
    ...controller,
    order,
    cost: search.cost,
    peak: result.peak,
    peakOmega: result.peakOmega,
    history: search.history,
    omegas,
  };
}

export function fullOrderHinfMixedSensitivity(plant, weights, options = {}) {
  return synthesizeDynamicMixedSensitivity(plant, weights, {
    ...options,
    order: options.order ?? Math.max(1, plant.order),
  });
}

/**
 * Convenience: build typical mixed-sensitivity weights.
 *   W1 = (s/M + ω_B) / (s + ω_B·A_low)  — performance (low-freq integrator-like)
 *   W3 = (s + ω_B/M)·A_high / (M·s + ω_B) — high-freq T constraint
 *   W2 = constant (control effort)
 */
export function defaultMixedSensitivityWeights(opts = {}) {
  const wB = opts.wB ?? 1;
  const M = opts.M ?? 2;
  const Alow = opts.Alow ?? 1e-3;
  const Ahigh = opts.Ahigh ?? 0.1;
  const W1 = new TransferFunction([1 / M, wB], [1, wB * Alow]);
  const W3 = new TransferFunction([Ahigh, Ahigh * wB / M], [M, wB]);
  const W2 = new TransferFunction([opts.controlPenalty ?? 0.01], [1]);
  return { W1, W2, W3 };
}
