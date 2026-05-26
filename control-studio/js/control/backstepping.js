/**
 * backstepping.js - Tier A4: recursive Lyapunov backstepping.
 *
 * This module intentionally keeps the first production slice narrow and
 * auditable:
 *   1. exact third-order integrator-chain backstepping with terminal triangular
 *      drift compensation,
 *   2. adaptive second-order backstepping for an unknown matched parameter.
 *
 * The third-order model is:
 *   x1_dot = x2
 *   x2_dot = x3
 *   x3_dot = f3(x) + g(x) u
 *
 * For r = 0, z1 = x1, z2 = x2 + k1*x1, and
 *   alpha2 = -(1 + k1*k2)*x1 - (k1 + k2)*x2
 *   z3 = x3 - alpha2
 *   u = (alpha2_dot - z2 - k3*z3 - f3(x)) / g(x)
 *
 * This gives:
 *   V = 0.5*(z1^2 + z2^2 + z3^2)
 *   V_dot = -k1*z1^2 - k2*z2^2 - k3*z3^2
 */

const EPS = 1e-12;

function assertFinite(name, value) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function normalizeGains(gains, n) {
  if (!Array.isArray(gains) || gains.length < n) {
    throw new Error(`gains must contain at least ${n} positive entries`);
  }
  const out = gains.slice(0, n);
  out.forEach((gain, i) => {
    assertFinite(`gains[${i}]`, gain);
    if (gain <= 0) throw new Error(`gains[${i}] must be positive`);
  });
  return out;
}

function normalizeRef(ref = {}) {
  if (typeof ref === 'number') return { r: ref, rDot: 0, rDDot: 0, r3: 0 };
  return {
    r: ref.r ?? 0,
    rDot: ref.rDot ?? 0,
    rDDot: ref.rDDot ?? 0,
    r3: ref.r3 ?? 0,
  };
}

function evalFn(fn, fallback, ...args) {
  return typeof fn === 'function' ? fn(...args) : fallback;
}

function lyapunovFromZ(z) {
  return 0.5 * z.reduce((sum, value) => sum + value * value, 0);
}

function designThirdOrder(plantModel, gains) {
  const [k1, k2, k3] = normalizeGains(gains, 3);
  const f3 = plantModel.f3 ?? (Array.isArray(plantModel.f) ? plantModel.f[2] : null);
  const g = plantModel.g ?? (() => 1);

  function coordinates(x, ref = {}) {
    if (!Array.isArray(x) || x.length !== 3) throw new Error('x must be a 3-state vector');
    x.forEach((value, i) => assertFinite(`x[${i}]`, value));
    const { r, rDot, rDDot, r3 } = normalizeRef(ref);

    const z1 = x[0] - r;
    const alpha1 = rDot - k1 * z1;
    const z2 = x[1] - alpha1;

    const alpha1Dot = rDDot - k1 * (x[1] - rDot);
    const alpha2 = alpha1Dot - z1 - k2 * z2;
    const z3 = x[2] - alpha2;

    const z1Dot = z2 - k1 * z1;
    const z2DotVirtual = z3 - z1 - k2 * z2;
    const alpha1DDot = r3 - k1 * (x[2] - rDDot);
    const alpha2Dot = alpha1DDot - z1Dot - k2 * z2DotVirtual;

    return { z: [z1, z2, z3], alpha1, alpha2, alpha1Dot, alpha2Dot };
  }

  function controlLaw(x, ref = {}) {
    const coord = coordinates(x, ref);
    const gx = evalFn(g, 1, x);
    assertFinite('g(x)', gx);
    if (Math.abs(gx) < EPS) throw new Error('g(x) must be non-zero');
    const drift = evalFn(f3, 0, x);
    assertFinite('f3(x)', drift);
    const u = (coord.alpha2Dot - coord.z[1] - k3 * coord.z[2] - drift) / gx;
    return {
      u,
      z: coord.z,
      virtualLaws: { alpha1: coord.alpha1, alpha2: coord.alpha2 },
      lyapunov: lyapunovFromZ(coord.z),
      vDot: -k1 * coord.z[0] ** 2 - k2 * coord.z[1] ** 2 - k3 * coord.z[2] ** 2,
    };
  }

  return {
    kind: 'thirdOrderStrictFeedback',
    order: 3,
    gains: [k1, k2, k3],
    virtualLaws: ['alpha1 = rDot - k1*z1', 'alpha2 = alpha1Dot - z1 - k2*z2'],
    controlLaw,
    coordinates,
    lyapunov: {
      expression: 'V = 0.5*(z1^2 + z2^2 + z3^2)',
      derivative: 'Vdot = -k1*z1^2 - k2*z2^2 - k3*z3^2',
    },
  };
}

function designAdaptiveSecondOrder(plantModel, gains, opts = {}) {
  const [k1, k2] = normalizeGains(gains, 2);
  const gamma = opts.gamma ?? 1;
  assertFinite('gamma', gamma);
  if (gamma <= 0) throw new Error('gamma must be positive');
  const phi = plantModel.phi ?? ((x) => x[0]);
  let thetaHat = opts.thetaInit ?? 0;
  assertFinite('thetaInit', thetaHat);

  function controlLaw(x, ref = {}, dt = 0) {
    if (!Array.isArray(x) || x.length !== 2) throw new Error('adaptive backstepping expects a 2-state vector');
    const { r, rDot, rDDot } = normalizeRef(ref);
    const z1 = x[0] - r;
    const alpha1 = rDot - k1 * z1;
    const z2 = x[1] - alpha1;
    const alpha1Dot = rDDot - k1 * (x[1] - rDot);
    const reg = phi(x);
    assertFinite('phi(x)', reg);
    const u = alpha1Dot - z1 - k2 * z2 - thetaHat * reg;
    const thetaDot = gamma * z2 * reg;
    if (dt > 0) thetaHat += dt * thetaDot;
    return {
      u,
      z: [z1, z2],
      thetaHat,
      thetaDot,
      virtualLaws: { alpha1 },
      lyapunov: lyapunovFromZ([z1, z2]),
      paramUpdate: { thetaHat, thetaDot, law: 'thetaHatDot = gamma*z2*phi(x)' },
    };
  }

  return {
    kind: 'adaptiveSecondOrder',
    order: 2,
    gains: [k1, k2],
    gamma,
    controlLaw,
    getThetaHat: () => thetaHat,
    reset(theta = opts.thetaInit ?? 0) {
      assertFinite('theta', theta);
      thetaHat = theta;
    },
    lyapunov: {
      expression: 'V = 0.5*(z1^2 + z2^2) + 0.5/gamma*thetaTilde^2',
      derivative: 'Vdot = -k1*z1^2 - k2*z2^2',
    },
    paramUpdate: { law: 'thetaHatDot = gamma*z2*phi(x)' },
  };
}

/**
 * Design a backstepping controller.
 *
 * @param {object} opts
 * @param {object} opts.plantModel
 * @param {number[]} opts.gains
 * @param {boolean} [opts.adaptive=false]
 */
export function designBackstepping(opts = {}) {
  const plantModel = opts.plantModel ?? {};
  const adaptive = opts.adaptive ?? false;
  if (adaptive) return designAdaptiveSecondOrder(plantModel, opts.gains ?? [2, 3], opts);
  const order = plantModel.order ?? 3;
  if (order !== 3) throw new Error('non-adaptive baseline currently supports order=3');
  return designThirdOrder(plantModel, opts.gains ?? [2, 3, 4]);
}

/**
 * Simulate a supported backstepping design with forward Euler integration.
 */
export function simulateBackstepping(design, args = {}) {
  const dt = args.dt ?? 0.001;
  const T = args.T ?? 5;
  assertFinite('dt', dt);
  assertFinite('T', T);
  if (dt <= 0 || T <= 0) throw new Error('dt and T must be positive');
  const steps = Math.floor(T / dt) + 1;
  const t = new Array(steps);
  const x = new Array(steps);
  const u = new Array(steps);
  const z = new Array(steps);
  const V = new Array(steps);
  const thetaHat = new Array(steps);
  const ref = args.ref ?? {};
  const f3 = args.f3 ?? (() => 0);
  const g = args.g ?? (() => 1);
  const theta = args.theta ?? 0;
  const phi = args.phi ?? ((state) => state[0]);

  x[0] = (args.x0 ?? new Array(design.order).fill(0)).slice();
  for (let k = 0; k < steps; k++) {
    t[k] = k * dt;
    const out = design.controlLaw(x[k], typeof ref === 'function' ? ref(t[k], k) : ref, k < steps - 1 ? dt : 0);
    u[k] = out.u;
    z[k] = out.z.slice();
    V[k] = out.lyapunov;
    thetaHat[k] = out.thetaHat;
    if (k === steps - 1) break;

    if (design.kind === 'thirdOrderStrictFeedback') {
      const gx = evalFn(g, 1, x[k]);
      const drift = evalFn(f3, 0, x[k]);
      x[k + 1] = [
        x[k][0] + dt * x[k][1],
        x[k][1] + dt * x[k][2],
        x[k][2] + dt * (drift + gx * out.u),
      ];
    } else {
      const reg = phi(x[k]);
      x[k + 1] = [
        x[k][0] + dt * x[k][1],
        x[k][1] + dt * (theta * reg + out.u),
      ];
    }
  }

  return { t, x, u, z, V, thetaHat };
}

/**
 * Static verification metadata for a backstepping design.
 */
export function verifyBackstepping(design) {
  if (!design || !Array.isArray(design.gains)) throw new Error('designBackstepping result required');
  const positiveGains = design.gains.every((gain) => gain > 0);
  return {
    VdotExpression: design.lyapunov?.derivative ?? 'unknown',
    isNegDef: positiveGains,
    regionOfAttraction: positiveGains ? 'global for the supported strict-feedback normal form' : 'unknown',
  };
}

export default {
  designBackstepping,
  simulateBackstepping,
  verifyBackstepping,
};
