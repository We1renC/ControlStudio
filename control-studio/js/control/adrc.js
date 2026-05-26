/**
 * adrc.js — Tier A1: Active Disturbance Rejection Control
 *
 * Implements ADRC with linear or nonlinear (fal-based) Extended State Observer (ESO).
 *
 * Plant model:  x^(n) = f(x, x', ..., x^(n-1), d) + b0 * u
 * Treat f(·) + (b - b0)*u as total disturbance and estimate via ESO,
 * then cancel with controller output, leaving an integrator chain.
 *
 * Bandwidth parameterisation (Gao, 2003):
 *   For ESO of order (n+1):  characteristic poly = (s + omega0)^(n+1)
 *     => beta_i = C(n+1, i) * omega0^i      (binomial coefficient)
 *   For n=2:  beta1=3*omega0, beta2=3*omega0^2, beta3=omega0^3
 *
 * Linear state feedback:  u0 = k_p*(r - z1) - sum k_i*z_{i+1}
 *   gains by (s + omegaC)^n  =>  k_i = C(n, i) * omegaC^i
 *
 * Final control law:  u = (u0 - z_{n+1}) / b0
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * fal nonlinear function (Han 2009).
 *   fal(e, alpha, delta) = |e|^alpha * sign(e)    if |e| > delta   (saturated)
 *                         e / delta^(1-alpha)    if |e| <= delta  (linear region)
 * delta is the boundary-layer width; alpha in (0,1) gives the nonlinearity.
 * Continuous at the boundary by construction.
 */
export function falFunction(e, alpha, delta) {
  if (delta <= 0) throw new Error('delta must be positive');
  if (Math.abs(e) > delta) {
    return Math.sign(e) * Math.pow(Math.abs(e), alpha);
  }
  return e / Math.pow(delta, 1 - alpha);
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
  return c;
}

/**
 * Compute ESO observer gains by bandwidth pole placement.
 * Returns array of length (n+1) for an extended state observer of plant order n.
 *   beta_i = C(n+1, i) * omega0^i,  i = 1..n+1
 */
function esoGains(plantOrder, omega0) {
  const m = plantOrder + 1;
  const betas = new Array(m);
  for (let i = 1; i <= m; i++) {
    betas[i - 1] = binomial(m, i) * Math.pow(omega0, i);
  }
  return betas;
}

/**
 * Compute state-feedback gains by bandwidth pole placement.
 * k_i = C(n, i) * omegaC^(n-i),  i = 0..n-1
 */
function controllerGains(plantOrder, omegaC) {
  const k = new Array(plantOrder);
  for (let i = 0; i < plantOrder; i++) {
    k[i] = binomial(plantOrder, i) * Math.pow(omegaC, plantOrder - i);
  }
  return k;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Design an ADRC controller for a SISO plant of given order.
 *
 * @param {object}  opts
 * @param {number}  opts.plantOrder   Order n of plant. Required >= 1.
 * @param {number}  opts.omega0       Observer bandwidth (rad/s). Required > 0.
 * @param {number}  opts.omegaC       Controller bandwidth (rad/s). Required > 0.
 * @param {number}  opts.b0           Input gain estimate. Required != 0.
 * @param {boolean} [opts.linear=true]  Use linear ESO (alpha=1).
 * @param {number}  [opts.delta=0.01]   Boundary layer for nonlinear fal.
 * @returns {{ observer, controller, params, bandwidth }}
 */
export function designADRC(opts) {
  const { plantOrder, omega0, omegaC, b0 } = opts;
  const linear = opts.linear ?? true;
  const delta = opts.delta ?? 0.01;

  if (!Number.isFinite(plantOrder) || plantOrder < 1) {
    throw new Error('plantOrder must be a positive integer');
  }
  if (!Number.isFinite(omega0) || omega0 <= 0) {
    throw new Error('omega0 must be positive');
  }
  if (!Number.isFinite(omegaC) || omegaC <= 0) {
    throw new Error('omegaC must be positive');
  }
  if (!Number.isFinite(b0) || b0 === 0) {
    throw new Error('b0 must be non-zero');
  }

  const n = plantOrder;
  const betas = esoGains(n, omega0);          // length n+1
  const k = controllerGains(n, omegaC);       // length n
  // alpha schedule for fal: alpha_1=0.5, alpha_2=0.25, ...
  const alphas = new Array(n + 1);
  for (let i = 0; i < n + 1; i++) alphas[i] = linear ? 1 : Math.pow(0.5, i);

  // ESO state: zhat in R^(n+1), zhat[n] estimates total disturbance.
  const observer = {
    n,
    betas: betas.slice(),
    alphas: alphas.slice(),
    delta,
    linear,
    /**
     * Forward-Euler ESO step.
     * Continuous-time ESO dynamics:
     *   z_1_dot     = z_2 - beta_1 * g(z_1 - y)
     *   z_i_dot     = z_{i+1} - beta_i * g(z_1 - y)       for i=2..n
     *   z_n_dot    += b0 * u
     *   z_{n+1}_dot = -beta_{n+1} * g(z_1 - y)
     * where g(.) = . for linear, fal(., alpha_i, delta) for nonlinear.
     */
    step(zhat, y, u, dt, b0) {
      const e = zhat[0] - y;
      const znew = new Array(n + 1);
      for (let i = 0; i < n + 1; i++) {
        const gE = linear ? e : falFunction(e, alphas[i], delta);
        let dot;
        if (i < n) {
          dot = zhat[i + 1] - betas[i] * gE;
          if (i === n - 1) dot += b0 * u;
        } else {
          dot = -betas[i] * gE;
        }
        znew[i] = zhat[i] + dt * dot;
      }
      return znew;
    },
  };

  const controller = {
    n,
    k: k.slice(),
    b0,
    /**
     * Compute control: u = (u0 - zhat_{n+1}) / b0
     * u0 = k_0*(r - zhat_1) - sum_{i=1}^{n-1} k_i * zhat_{i+1}
     */
    compute(r, zhat) {
      let u0 = k[0] * (r - zhat[0]);
      for (let i = 1; i < n; i++) {
        u0 -= k[i] * zhat[i];
      }
      return (u0 - zhat[n]) / b0;
    },
  };

  return {
    observer,
    controller,
    params: { betas, k, alphas, delta, omega0, omegaC, b0, linear, plantOrder: n },
    bandwidth: { observer: omega0, controller: omegaC },
  };
}

/**
 * Simulate ADRC on a linear state-space plant via forward Euler.
 *
 * @param {object} args
 * @param {{A,B,C,D}} args.plant
 * @param {object}    args.adrc       From designADRC().
 * @param {function}  args.reference  (t)=>r
 * @param {function}  [args.disturbance]  (t)=>d (additive at input). Default 0.
 * @param {number}    args.dt
 * @param {number}    args.T
 * @param {number[]}  [args.x0]
 * @returns {{ t, y, u, x, zhat }} arrays
 */
export function simulateADRC(args) {
  const { plant, adrc, reference, dt, T } = args;
  const disturbance = args.disturbance ?? (() => 0);
  const A = plant.A;
  const B = plant.B;
  const C = plant.C;
  const D = plant.D ?? [[0]];

  const nState = A.length;
  let x = (args.x0 ? args.x0.slice() : new Array(nState).fill(0));
  let zhat = new Array(adrc.params.plantOrder + 1).fill(0);

  const steps = Math.ceil(T / dt);
  const tArr = new Array(steps + 1);
  const yArr = new Array(steps + 1);
  const uArr = new Array(steps + 1);
  const xArr = new Array(steps + 1);
  const zArr = new Array(steps + 1);

  for (let k = 0; k <= steps; k++) {
    const t = k * dt;
    // Output
    let y = 0;
    for (let j = 0; j < nState; j++) y += C[0][j] * x[j];
    const r = reference(t);
    const u = adrc.controller.compute(r, zhat);
    if (D[0][0]) y += D[0][0] * u;

    tArr[k] = t;
    yArr[k] = y;
    uArr[k] = u;
    xArr[k] = x.slice();
    zArr[k] = zhat.slice();

    if (k === steps) break;

    // Plant integration
    const d = disturbance(t);
    const uTotal = u + d;
    const xNew = new Array(nState);
    for (let i = 0; i < nState; i++) {
      let dot = 0;
      for (let j = 0; j < nState; j++) dot += A[i][j] * x[j];
      dot += B[i][0] * uTotal;
      xNew[i] = x[i] + dt * dot;
    }
    x = xNew;

    // ESO update
    zhat = adrc.observer.step(zhat, y, u, dt, adrc.params.b0);
  }

  return { t: tArr, y: yArr, u: uArr, x: xArr, zhat: zArr };
}

/**
 * Bandwidth tuning helper based on desired settling time.
 *   omegaC ~ 4 / T_settle, omega0 ~ 8 * omegaC
 */
export function tuneADRCBandwidth(specs) {
  const { settlingTime, b0 = 1 } = specs;
  if (!Number.isFinite(settlingTime) || settlingTime <= 0) {
    throw new Error('settlingTime must be positive');
  }
  const omegaC = 4 / settlingTime;
  const omega0 = 8 * omegaC;
  const predictedPM = 60;
  return { omega0, omegaC, b0, predictedPM };
}
