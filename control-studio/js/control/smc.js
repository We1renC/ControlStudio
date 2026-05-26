/**
 * smc.js - Tier A3: Sliding Mode Control with super-twisting.
 *
 * Normal-form plant assumed by this baseline:
 *   x1_dot = x2
 *   x2_dot = a*x2 + b*u + d(t, x)
 *
 * Sliding surface:
 *   s = c*(x1 - r) + (x2 - r_dot)
 *
 * The equivalent control cancels nominal dynamics on s = 0. The switching
 * term is applied as an acceleration request and divided by b.
 */

const EPS = 1e-12;

function assertFinite(name, value) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function signSmooth(x, eps = EPS) {
  if (Math.abs(x) <= eps) return 0;
  return Math.sign(x);
}

function sat(x) {
  return Math.max(-1, Math.min(1, x));
}

function normalizePlant(plant = {}) {
  const a = plant.a ?? 0;
  const b = plant.b ?? 1;
  assertFinite('plant.a', a);
  assertFinite('plant.b', b);
  if (Math.abs(b) < EPS) throw new Error('plant.b must be non-zero');
  return { a, b };
}

function normalizeSurface(slidingSurface = {}) {
  if (Array.isArray(slidingSurface)) {
    if (slidingSurface.length !== 2) {
      throw new Error('slidingSurface array must be [c, 1]');
    }
    const c = slidingSurface[0];
    assertFinite('slidingSurface[0]', c);
    if (c <= 0) throw new Error('slidingSurface c must be positive');
    if (Math.abs(slidingSurface[1]) < EPS) {
      throw new Error('slidingSurface derivative coefficient must be non-zero');
    }
    return { c, vector: [c, slidingSurface[1]] };
  }

  const c = slidingSurface.c ?? 2;
  assertFinite('slidingSurface.c', c);
  if (c <= 0) throw new Error('slidingSurface.c must be positive');
  return { c, vector: [c, 1] };
}

function normalizeReference(ref, k, t) {
  if (typeof ref === 'function') {
    const value = ref(t, k);
    if (typeof value === 'number') return { r: value, rdot: 0, rddot: 0 };
    return {
      r: value.r ?? 0,
      rdot: value.rdot ?? 0,
      rddot: value.rddot ?? 0,
    };
  }
  if (Array.isArray(ref)) {
    const value = ref[Math.min(k, ref.length - 1)] ?? 0;
    if (typeof value === 'number') return { r: value, rdot: 0, rddot: 0 };
    return {
      r: value.r ?? 0,
      rdot: value.rdot ?? 0,
      rddot: value.rddot ?? 0,
    };
  }
  return { r: ref ?? 0, rdot: 0, rddot: 0 };
}

function surfaceValue(surface, x, refPoint) {
  const e1 = x[0] - refPoint.r;
  const e2 = x[1] - refPoint.rdot;
  return surface.c * e1 + e2;
}

function equivalentAcceleration(plant, surface, x, refPoint) {
  const e2 = x[1] - refPoint.rdot;
  return refPoint.rddot - surface.c * e2 - plant.a * x[1];
}

/**
 * Design a sliding-mode controller.
 *
 * @param {object} opts
 * @param {{a?:number,b?:number}} opts.plant
 * @param {{c?:number}|number[]} opts.slidingSurface
 * @param {number} opts.disturbanceBound  L or |d| upper bound.
 * @param {'classical'|'boundaryLayer'|'superTwisting'} [opts.variant]
 * @param {number} [opts.Phi] Boundary-layer thickness.
 * @param {number} [opts.K] Switching gain for classical/boundary variants.
 * @param {number} [opts.k1] Super-twisting sqrt gain.
 * @param {number} [opts.k2] Super-twisting integral gain.
 * @returns {{ surface, controlLaw, gains, reachingTime, reset }}
 */
export function designSMC(opts = {}) {
  const plant = normalizePlant(opts.plant);
  const surface = normalizeSurface(opts.slidingSurface);
  const L = opts.disturbanceBound;
  assertFinite('disturbanceBound', L);
  if (L <= 0) throw new Error('disturbanceBound must be positive');

  const variant = opts.variant ?? 'classical';
  if (!['classical', 'boundaryLayer', 'superTwisting'].includes(variant)) {
    throw new Error(`Unknown SMC variant: ${variant}`);
  }

  const Phi = opts.Phi ?? 0.05;
  if (variant === 'boundaryLayer') {
    assertFinite('Phi', Phi);
    if (Phi <= 0) throw new Error('Phi must be positive for boundaryLayer SMC');
  }

  const K = opts.K ?? 1.5 * L + 0.5;
  assertFinite('K', K);
  if ((variant === 'classical' || variant === 'boundaryLayer') && K <= L) {
    throw new Error('K must exceed disturbanceBound for reaching');
  }

  const minK1 = Math.sqrt(2 * L);
  const minK2 = L;
  const k1 = opts.k1 ?? 1.25 * minK1;
  const k2 = opts.k2 ?? 1.25 * minK2;
  if (variant === 'superTwisting') {
    assertFinite('k1', k1);
    assertFinite('k2', k2);
    if (k1 <= minK1) throw new Error('k1 must exceed sqrt(2*disturbanceBound)');
    if (k2 <= minK2) throw new Error('k2 must exceed disturbanceBound');
  }

  const internal = { v: 0 };

  function reset() {
    internal.v = 0;
  }

  function reachingTime(s0) {
    const sAbs = Math.abs(s0);
    if (sAbs <= EPS) return 0;
    if (variant === 'superTwisting') {
      const alpha = k1 - minK1;
      const beta = k2 - L;
      return 2 * Math.sqrt(sAbs) / alpha + sAbs / beta;
    }
    return sAbs / (K - L);
  }

  function controlLaw(x, refPoint = { r: 0, rdot: 0, rddot: 0 }, dt = 0) {
    const s = surfaceValue(surface, x, refPoint);
    const uEqAccel = equivalentAcceleration(plant, surface, x, refPoint);
    let switchAccel;

    if (variant === 'classical') {
      switchAccel = -K * signSmooth(s);
    } else if (variant === 'boundaryLayer') {
      switchAccel = -K * sat(s / Phi);
    } else {
      const sgn = signSmooth(s);
      switchAccel = -k1 * Math.sqrt(Math.abs(s)) * sgn + internal.v;
      if (dt > 0) internal.v += dt * (-k2 * sgn);
    }

    const u = (uEqAccel + switchAccel) / plant.b;
    return { u, s, uEq: uEqAccel / plant.b, uSwitch: switchAccel / plant.b, v: internal.v };
  }

  return {
    variant,
    plant,
    surface,
    controlLaw,
    reset,
    reachingTime,
    gains: {
      K,
      Phi: variant === 'boundaryLayer' ? Phi : undefined,
      k1: variant === 'superTwisting' ? k1 : undefined,
      k2: variant === 'superTwisting' ? k2 : undefined,
      disturbanceBound: L,
      minK1,
      minK2,
    },
  };
}

/**
 * Simulate SMC on the normal-form plant.
 *
 * @param {{a?:number,b?:number}} plant
 * @param {object} smc Result from designSMC().
 * @param {number|Array|Function} ref Reference scalar, array, or function.
 * @param {number[]|{dt:number,T:number}} t Time vector or time settings.
 * @param {object} [opts]
 * @param {number[]} [opts.x0=[0,0]]
 * @param {Function} [opts.disturbance] (time, x, k) => d.
 */
export function simulateSMC(plant, smc, ref, t, opts = {}) {
  const model = normalizePlant(plant);
  const time = Array.isArray(t)
    ? t.slice()
    : Array.from({ length: Math.floor((t.T ?? 5) / (t.dt ?? 0.001)) + 1 }, (_, k) => k * (t.dt ?? 0.001));
  if (time.length < 2) throw new Error('time vector must contain at least two samples');

  const disturbance = opts.disturbance ?? (() => 0);
  const x = new Array(time.length);
  const u = new Array(time.length);
  const s = new Array(time.length);
  const sliding = new Array(time.length);
  const x0 = opts.x0 ?? [0, 0];
  x[0] = x0.slice();
  smc.reset?.();

  for (let k = 0; k < time.length; k++) {
    const dt = k < time.length - 1 ? time[k + 1] - time[k] : time[k] - time[k - 1];
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('time vector must be strictly increasing');
    const refPoint = normalizeReference(ref, k, time[k]);
    const out = smc.controlLaw(x[k], refPoint, k < time.length - 1 ? dt : 0);
    u[k] = out.u;
    s[k] = out.s;
    sliding[k] = Math.abs(out.s) <= (smc.gains.Phi ?? opts.slidingTol ?? 0.02);

    if (k === time.length - 1) break;
    const d = disturbance(time[k], x[k], k);
    const dx1 = x[k][1];
    const dx2 = model.a * x[k][1] + model.b * out.u + d;
    x[k + 1] = [
      x[k][0] + dt * dx1,
      x[k][1] + dt * dx2,
    ];
  }

  return { t: time, x, u, s, sliding };
}

/**
 * Estimate high-frequency switching content in a control signal.
 *
 * chatterIndex is based on normalized second variation, so smooth ramps and
 * super-twisting inputs score near zero while sign switching scores high.
 */
export function analyzeChattering(u, dt = 1) {
  if (!Array.isArray(u) || u.length < 3) {
    throw new Error('u must contain at least three samples');
  }
  assertFinite('dt', dt);
  if (dt <= 0) throw new Error('dt must be positive');

  const maxU = Math.max(...u);
  const minU = Math.min(...u);
  const range = Math.max(maxU - minU, EPS);
  let secondVariation = 0;
  let absVariation = 0;
  for (let i = 1; i < u.length - 1; i++) {
    secondVariation += Math.abs(u[i + 1] - 2 * u[i] + u[i - 1]);
  }
  for (let i = 1; i < u.length; i++) {
    absVariation += Math.abs(u[i] - u[i - 1]);
  }
  const chatterIndex = secondVariation / ((u.length - 2) * range);
  const ampBand = absVariation / ((u.length - 1) * range * dt);
  return { chatterIndex, ampBand };
}

export default {
  designSMC,
  simulateSMC,
  analyzeChattering,
};
