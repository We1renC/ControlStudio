/**
 * feedback_linearization.js - Tier A5: input-output / full-state linearization.
 */

import { iteratedLieDerivative, lieDerivative } from '../math/lie_derivative.js';

const EPS = 1e-9;

function binomial(n, k) {
  let c = 1;
  for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
  return c;
}

function gainsFromPoles(poles) {
  if (!Array.isArray(poles) || poles.length === 0) throw new Error('desiredPoles required');
  // Real-pole polynomial: prod(s - p_i) = s^r + a_{r-1}s^{r-1}+...+a0.
  let poly = [1];
  for (const pole of poles) {
    if (!Number.isFinite(pole)) throw new Error('only real desired poles are supported');
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] += poly[i];
      next[i + 1] += -pole * poly[i];
    }
    poly = next;
  }
  return poly.slice(1).reverse(); // [a0, a1, ...]
}

function defaultPoles(r) {
  return Array.from({ length: r }, (_, i) => -(i + 2));
}

export function computeRelativeDegree({ f, g, h, n, samplePoint, tol = 1e-6, maxOrder }) {
  if (typeof f !== 'function' || typeof g !== 'function' || typeof h !== 'function') {
    throw new Error('f, g, h functions are required');
  }
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive integer');
  const x0 = samplePoint ?? new Array(n).fill(0.2);
  const limit = maxOrder ?? n;
  const lieDerivatives = [h];

  for (let k = 1; k <= limit; k++) {
    const prev = iteratedLieDerivative(h, f, k - 1);
    const betaFn = lieDerivative(prev, g);
    const beta = betaFn(x0);
    if (Math.abs(beta) > tol) {
      return { r: k, beta, lieDerivatives, regular: true };
    }
    lieDerivatives.push(iteratedLieDerivative(h, f, k));
  }

  return { r: null, beta: 0, lieDerivatives, regular: false };
}

export function designIOLinearization(model, desiredPoles = null, opts = {}) {
  const { f, g, h, n } = model;
  const rel = computeRelativeDegree({
    f, g, h, n,
    samplePoint: opts.samplePoint,
    tol: opts.tol ?? 1e-6,
  });
  if (!rel.regular) throw new Error('relative degree could not be determined');
  const r = rel.r;
  const poles = desiredPoles ?? defaultPoles(r);
  const gains = gainsFromPoles(poles);
  const LfrH = iteratedLieDerivative(h, f, r);
  const LfrMinus1H = iteratedLieDerivative(h, f, r - 1);
  const betaFn = lieDerivative(LfrMinus1H, g);
  const lieFns = Array.from({ length: r }, (_, i) => iteratedLieDerivative(h, f, i));

  function transform(x) {
    return lieFns.map((fn) => fn(x));
  }

  function controlLaw(x, ref = {}) {
    const z = transform(x);
    const yd = ref.y ?? 0;
    const derivatives = ref.derivatives ?? [];
    const errors = z.map((value, i) => value - (i === 0 ? yd : (derivatives[i - 1] ?? 0)));
    const ydR = derivatives[r - 1] ?? 0;
    const v = ydR - gains.reduce((sum, gain, i) => sum + gain * errors[i], 0);
    const alpha = LfrH(x);
    const beta = betaFn(x);
    if (Math.abs(beta) < (opts.eps ?? EPS)) throw new Error('decoupling gain is singular');
    return { u: (v - alpha) / beta, v, alpha, beta, z, errors };
  }

  const zeroDynamics = model.zeroDynamics ?? null;
  const maxZeroEig = zeroDynamics?.eigenvalues
    ? Math.max(...zeroDynamics.eigenvalues.map((value) => value.re ?? value))
    : (zeroDynamics?.A ? Math.max(...zeroDynamics.A.map((row, i) => row[i] ?? 0)) : -Infinity);
  const isMinPhase = !zeroDynamics || maxZeroEig < 0;

  return {
    relativeDegree: rel,
    transform,
    controlLaw,
    gains,
    desiredPoles: poles.slice(),
    zeroDynamics,
    isMinPhase,
  };
}

export function designFullStateLinearization(model, desiredPoles = null, opts = {}) {
  const io = designIOLinearization(model, desiredPoles, opts);
  const n = model.n;
  const r = io.relativeDegree.r;
  const A = Array.from({ length: r }, (_, i) => {
    const row = new Array(r).fill(0);
    if (i < r - 1) row[i + 1] = 1;
    return row;
  });
  A[r - 1] = io.gains.map((gain) => -gain);
  const B = Array.from({ length: r }, (_, i) => [i === r - 1 ? 1 : 0]);
  return {
    diffeomorphism: io.transform,
    AB: { A, B },
    controllable: r === n,
    relativeDegree: r,
    controlLaw: io.controlLaw,
  };
}

export function simulateIOLinearized(model, design, args = {}) {
  const dt = args.dt ?? 0.001;
  const T = args.T ?? 5;
  const steps = Math.floor(T / dt) + 1;
  const x = new Array(steps);
  const u = new Array(steps);
  const z = new Array(steps);
  x[0] = (args.x0 ?? new Array(model.n).fill(0)).slice();
  for (let k = 0; k < steps; k++) {
    z[k] = design.transform(x[k]);
    const out = design.controlLaw(x[k], args.ref ?? {});
    u[k] = out.u;
    if (k === steps - 1) break;
    const fx = model.f(x[k]);
    const gx = model.g(x[k]);
    x[k + 1] = x[k].map((value, i) => value + dt * (fx[i] + gx[i] * out.u));
  }
  return { x, u, z };
}

export default {
  computeRelativeDegree,
  designIOLinearization,
  designFullStateLinearization,
  simulateIOLinearized,
};
