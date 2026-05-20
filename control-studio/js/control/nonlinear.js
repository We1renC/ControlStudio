/**
 * nonlinear.js — Nonlinear and Parameter-Varying Control Methods (P26)
 *
 * Implements:
 *   1. gainScheduledPID   — PID with linear interpolation over a scheduling
 *                           variable (e.g. operating point, speed, load).
 *   2. designSMC          — Sliding Mode Controller (SMC) with linear sliding
 *                           surface and boundary-layer chattering reduction.
 *   3. simulateSMC        — Closed-loop simulation with SMC.
 */

// ---------------------------------------------------------------------------
// P26-01: Gain-Scheduled PID
// ---------------------------------------------------------------------------

/**
 * Build a gain-scheduled PID whose Kp, Ki, Kd are piecewise-linearly
 * interpolated across breakpoints of a scheduling variable ρ.
 *
 * @param {number[]} breakpoints  - Sorted scheduling-variable values [ρ₀, ρ₁, …, ρₘ]
 * @param {Array<{Kp:number, Ki:number, Kd:number}>} pidParams
 *   - PID gains at each breakpoint (length must equal breakpoints.length)
 * @param {object} [opts]
 * @param {number} [opts.Ts=0]        - Sample time for discrete derivative (0 = continuous)
 * @param {number} [opts.Tf=0.01]     - Derivative filter time constant (continuous)
 * @param {number} [opts.uMin=-Inf]   - Output saturation lower bound
 * @param {number} [opts.uMax=+Inf]   - Output saturation upper bound
 * @returns {{
 *   getGains(rho: number): {Kp, Ki, Kd},
 *   compute(e: number, dedt: number, intE: number, rho: number): number,
 *   breakpoints: number[],
 *   pidParams: Array<{Kp,Ki,Kd}>,
 * }}
 */
export function gainScheduledPID(breakpoints, pidParams, opts = {}) {
  if (!Array.isArray(breakpoints) || breakpoints.length < 2) {
    throw new Error('gainScheduledPID: need at least 2 breakpoints');
  }
  if (breakpoints.length !== pidParams.length) {
    throw new Error('gainScheduledPID: breakpoints.length must equal pidParams.length');
  }
  // Verify sorted
  for (let i = 1; i < breakpoints.length; i++) {
    if (breakpoints[i] <= breakpoints[i - 1]) {
      throw new Error('gainScheduledPID: breakpoints must be strictly increasing');
    }
  }

  const uMin = opts.uMin ?? -Infinity;
  const uMax = opts.uMax ?? +Infinity;

  /**
   * Linearly interpolate PID gains for a given scheduling variable ρ.
   * Clamps to first/last breakpoint outside range.
   */
  function getGains(rho) {
    if (rho <= breakpoints[0]) return { ...pidParams[0] };
    if (rho >= breakpoints[breakpoints.length - 1]) return { ...pidParams[pidParams.length - 1] };
    // Find interval
    let lo = 0;
    for (let i = 1; i < breakpoints.length; i++) {
      if (rho <= breakpoints[i]) { lo = i - 1; break; }
    }
    const hi  = lo + 1;
    const t   = (rho - breakpoints[lo]) / (breakpoints[hi] - breakpoints[lo]);
    const p   = pidParams[lo];
    const q   = pidParams[hi];
    return {
      Kp: p.Kp + t * (q.Kp - p.Kp),
      Ki: p.Ki + t * (q.Ki - p.Ki),
      Kd: p.Kd + t * (q.Kd - p.Kd),
    };
  }

  /**
   * Compute PID output given current error, derivative, integral and rho.
   * The caller is responsible for maintaining the integral and computing dedt.
   *
   * @param {number} e    - Current error
   * @param {number} dedt - Error derivative (pre-filtered by caller if desired)
   * @param {number} intE - Accumulated integral of error
   * @param {number} rho  - Scheduling variable at current time
   * @returns {number}    - Control output (saturated to [uMin, uMax])
   */
  function compute(e, dedt, intE, rho) {
    const { Kp, Ki, Kd } = getGains(rho);
    const u = Kp * e + Ki * intE + Kd * dedt;
    return Math.max(uMin, Math.min(uMax, u));
  }

  return { getGains, compute, breakpoints: [...breakpoints], pidParams: pidParams.map(p => ({ ...p })) };
}

/**
 * Simulate a gain-scheduled PID controller on a 1st-order discrete plant.
 *
 * Plant model: y[k+1] = a·y[k] + b·u[k]  (discrete)
 * Scheduling:  rho[k] = schedulingFn(k, y[k], u[k])
 *
 * @param {object} gs        - Result of gainScheduledPID(...)
 * @param {number} a         - Plant pole coefficient
 * @param {number} b         - Plant input gain
 * @param {number} Ts        - Sample time (s)
 * @param {number} N         - Simulation steps
 * @param {number|number[]} ref  - Reference (scalar or array)
 * @param {function} schedulingFn  - (k, y, u) → rho
 * @param {object} [opts]
 * @param {number} [opts.y0=0]    - Initial output
 * @returns {{ t, y, u, rho, e }}
 */
export function simulateGainScheduledPID(gs, a, b, Ts, N, ref, schedulingFn, opts = {}) {
  const y0 = opts.y0 ?? 0;
  const refArr = Array.isArray(ref) ? ref : new Array(N).fill(ref);

  const t   = new Array(N).fill(0).map((_, k) => k * Ts);
  const y   = new Array(N).fill(0);
  const u   = new Array(N).fill(0);
  const rho = new Array(N).fill(0);
  const e   = new Array(N).fill(0);

  y[0]   = y0;
  let intE = 0;

  for (let k = 0; k < N - 1; k++) {
    const r_k  = refArr[k] ?? refArr[refArr.length - 1];
    e[k]       = r_k - y[k];
    rho[k]     = schedulingFn(k, y[k], u[k > 0 ? k - 1 : 0]);
    const dedt = k > 0 ? (e[k] - e[k - 1]) / Ts : 0;
    intE      += e[k] * Ts;
    u[k]       = gs.compute(e[k], dedt, intE, rho[k]);
    y[k + 1]   = a * y[k] + b * u[k];
  }
  // Last step
  const r_N  = refArr[N - 1] ?? refArr[refArr.length - 1];
  e[N - 1]   = r_N - y[N - 1];
  rho[N - 1] = schedulingFn(N - 1, y[N - 1], u[N - 2] ?? 0);
  u[N - 1]   = gs.compute(e[N - 1], 0, intE, rho[N - 1]);

  return { t, y, u, rho, e };
}

// ---------------------------------------------------------------------------
// P26-03: Sliding Mode Control (SMC) with boundary layer
// ---------------------------------------------------------------------------

/**
 * Design a sliding-mode controller for a SISO system in normal form:
 *   ẋ₁ = x₂,  ẋ₂ = f(x) + g(x)·u
 *
 * Sliding surface:  σ(x) = c·e₁ + ė₁  (linear, c > 0)
 * Control law:      u = u_eq + u_sw
 *   u_eq = -(c·e₂ + f(x)) / g(x)          (equivalent control)
 *   u_sw = -(η/ε)·sat(σ/ε)                 (switching with boundary layer ε)
 *
 * For a linear plant ẋ = A·x + B·u, f(x) = A[1,:]·x, g = B[1,0].
 *
 * @param {number}   c    - Sliding surface slope (c > 0, determines convergence rate)
 * @param {number}   eta  - Switching gain (η > 0, must exceed max disturbance)
 * @param {number}   eps  - Boundary-layer thickness (ε > 0, reduces chattering)
 * @param {number}   fCoeff - Coefficient of state in f(x): f(x) = fCoeff·x₂ + fConst
 * @param {number}   gVal   - Control effectiveness g(x) (assumed constant, g ≠ 0)
 * @param {object}  [opts]
 * @param {number}  [opts.uMin=-Infinity]
 * @param {number}  [opts.uMax=+Infinity]
 * @returns {{
 *   compute(x1: number, x2: number, r: number, rdot: number): {u, sigma},
 *   c, eta, eps
 * }}
 */
export function designSMC(c, eta, eps, fCoeff, gVal, opts = {}) {
  if (c <= 0)   throw new Error('designSMC: c must be > 0');
  if (eta <= 0) throw new Error('designSMC: eta must be > 0');
  if (eps <= 0) throw new Error('designSMC: eps must be > 0');
  if (Math.abs(gVal) < 1e-14) throw new Error('designSMC: gVal must be non-zero');

  const uMin = opts.uMin ?? -Infinity;
  const uMax = opts.uMax ?? +Infinity;

  /**
   * Compute SMC control action.
   * @param {number} x1   - State 1 (position / output)
   * @param {number} x2   - State 2 (velocity / output derivative)
   * @param {number} r    - Reference (desired x1)
   * @param {number} rdot - Reference derivative (desired ẋ1)
   * @returns {{ u: number, sigma: number }}
   */
  function compute(x1, x2, r = 0, rdot = 0) {
    const e1   = x1 - r;             // tracking error
    const e2   = x2 - rdot;          // error derivative
    const sigma = c * e1 + e2;       // sliding variable

    // Equivalent control: cancels system dynamics on the surface
    const u_eq  = -(c * e2 + fCoeff * x2) / gVal;

    // Boundary-layer saturation: sat(s/ε) ∈ [-1, 1]
    const sat   = Math.max(-1, Math.min(1, sigma / eps));
    const u_sw  = -(eta / eps) * sat * eps;  // = -eta·sat(σ/ε)

    const u = Math.max(uMin, Math.min(uMax, u_eq + u_sw));
    return { u, sigma };
  }

  return { compute, c, eta, eps };
}

/**
 * Simulate SMC on a 2nd-order continuous plant (Euler integration):
 *   ẋ₁ = x₂
 *   ẋ₂ = a·x₂ + b·u + d(t)    (d = disturbance)
 *
 * @param {object}          smc   - Result of designSMC(...)
 * @param {number}          a     - Plant dynamics coefficient (ẋ₂ term)
 * @param {number}          b     - Input gain
 * @param {number}          Ts    - Integration step size (s)
 * @param {number}          N     - Number of steps
 * @param {number|number[]} ref   - Reference x1 (scalar or array)
 * @param {function}        [disturbanceFn]  - (k, x1, x2) → d  (default: 0)
 * @param {object}          [opts]
 * @param {number}          [opts.x1_0=0]
 * @param {number}          [opts.x2_0=0]
 * @returns {{ t, x1, x2, u, sigma }}
 */
export function simulateSMC(smc, a, b, Ts, N, ref, disturbanceFn, opts = {}) {
  const x1_0 = opts.x1_0 ?? 0;
  const x2_0 = opts.x2_0 ?? 0;
  const refArr = Array.isArray(ref) ? ref : new Array(N).fill(ref);
  const dFn    = disturbanceFn ?? (() => 0);

  const t     = Array.from({ length: N }, (_, k) => k * Ts);
  const x1    = new Array(N).fill(0);
  const x2    = new Array(N).fill(0);
  const u     = new Array(N).fill(0);
  const sigma = new Array(N).fill(0);

  x1[0] = x1_0;
  x2[0] = x2_0;

  for (let k = 0; k < N - 1; k++) {
    const r_k  = refArr[k] ?? refArr[refArr.length - 1];
    const res  = smc.compute(x1[k], x2[k], r_k, 0);
    u[k]      = res.u;
    sigma[k]  = res.sigma;
    const d   = dFn(k, x1[k], x2[k]);
    // Euler integration
    x1[k + 1] = x1[k] + Ts * x2[k];
    x2[k + 1] = x2[k] + Ts * (a * x2[k] + b * u[k] + d);
  }
  // Last point
  const r_N    = refArr[N - 1] ?? refArr[refArr.length - 1];
  const resN   = smc.compute(x1[N - 1], x2[N - 1], r_N, 0);
  u[N - 1]    = resN.u;
  sigma[N - 1] = resN.sigma;

  return { t, x1, x2, u, sigma };
}
