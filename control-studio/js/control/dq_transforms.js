/**
 * dq_transforms.js — Clarke / Park / dq-frame transforms for motor and grid
 * control workflows.
 *
 * Loop 2 (Zero-Flaw) addition. Without these primitives no PMSM/IM FOC,
 * grid-tied inverter, PLL, or three-phase power-electronics literature can
 * be replicated in ControlStudio.
 *
 * Conventions:
 *   - Amplitude-invariant Clarke (power-variant Clarke uses factor 2/3):
 *       α = (2/3)(a − 0.5 b − 0.5 c)
 *       β = (2/3)(    (√3/2) b − (√3/2) c )
 *   - Power-invariant Clarke uses √(2/3) scaling.
 *   - Park rotation θ:
 *       d = α cosθ + β sinθ,  q = −α sinθ + β cosθ
 *
 * References:
 *   - Krause, Wasynczuk, Sudhoff, Pekarek, "Analysis of Electric Machinery
 *     and Drive Systems", IEEE Press.
 *   - Bose, "Power Electronics and Motor Drives", Academic Press.
 *   - Yazdani & Iravani, "Voltage-Sourced Converters in Power Systems".
 */

const SQRT3_2 = Math.sqrt(3) / 2;

function ensureScalar(v, label) {
  if (!Number.isFinite(v)) throw new Error(`${label}: not finite`);
}

function ensureTriplet(arr, label) {
  if (!Array.isArray(arr) || arr.length !== 3) {
    throw new Error(`${label}: expected length-3 array`);
  }
  for (const v of arr) if (!Number.isFinite(v)) throw new Error(`${label}: non-finite entry`);
}

// ── Clarke (abc → αβ) ──────────────────────────────────────────────────────

export function clarke(abc, options = {}) {
  ensureTriplet(abc, 'clarke: abc');
  const [a, b, c] = abc;
  const variant = options.variant ?? 'amplitude';
  if (variant === 'amplitude') {
    const alpha = (2 / 3) * (a - 0.5 * b - 0.5 * c);
    const beta  = (2 / 3) * (SQRT3_2 * b - SQRT3_2 * c);
    const zero  = (1 / 3) * (a + b + c);
    return { alpha, beta, zero };
  }
  if (variant === 'power') {
    const k = Math.sqrt(2 / 3);
    const alpha = k * (a - 0.5 * b - 0.5 * c);
    const beta  = k * (SQRT3_2 * b - SQRT3_2 * c);
    const zero  = (1 / Math.sqrt(3)) * (a + b + c);
    return { alpha, beta, zero };
  }
  throw new Error(`clarke: unknown variant ${variant}`);
}

export function inverseClarke(alphaBeta, options = {}) {
  if (!alphaBeta || !Number.isFinite(alphaBeta.alpha) || !Number.isFinite(alphaBeta.beta)) {
    throw new Error('inverseClarke: { alpha, beta } required');
  }
  const { alpha, beta } = alphaBeta;
  const zero = alphaBeta.zero ?? 0;
  const variant = options.variant ?? 'amplitude';
  if (variant === 'amplitude') {
    const a = alpha + zero;
    const b = -0.5 * alpha + SQRT3_2 * beta + zero;
    const c = -0.5 * alpha - SQRT3_2 * beta + zero;
    return [a, b, c];
  }
  if (variant === 'power') {
    const k = Math.sqrt(2 / 3);
    const z = (1 / Math.sqrt(3)) * zero;
    const a = k * alpha + z;
    const b = k * (-0.5 * alpha + SQRT3_2 * beta) + z;
    const c = k * (-0.5 * alpha - SQRT3_2 * beta) + z;
    return [a, b, c];
  }
  throw new Error(`inverseClarke: unknown variant ${variant}`);
}

// ── Park (αβ → dq) ─────────────────────────────────────────────────────────

export function park(alphaBeta, theta) {
  if (!alphaBeta) throw new Error('park: αβ object required');
  ensureScalar(alphaBeta.alpha, 'park: α');
  ensureScalar(alphaBeta.beta, 'park: β');
  ensureScalar(theta, 'park: θ');
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    d:  alphaBeta.alpha * cosT + alphaBeta.beta * sinT,
    q: -alphaBeta.alpha * sinT + alphaBeta.beta * cosT,
    zero: alphaBeta.zero ?? 0,
  };
}

export function inversePark(dq, theta) {
  if (!dq) throw new Error('inversePark: dq object required');
  ensureScalar(dq.d, 'inversePark: d');
  ensureScalar(dq.q, 'inversePark: q');
  ensureScalar(theta, 'inversePark: θ');
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    alpha: dq.d * cosT - dq.q * sinT,
    beta:  dq.d * sinT + dq.q * cosT,
    zero: dq.zero ?? 0,
  };
}

// ── Convenience composition ────────────────────────────────────────────────

export function abcToDq(abc, theta, options) {
  return park(clarke(abc, options), theta);
}

export function dqToAbc(dq, theta, options) {
  return inverseClarke(inversePark(dq, theta), options);
}

// ── Synchronous reference frame PLL (SRF-PLL) baseline ────────────────────

/**
 * Simulate one step of a discrete SRF-PLL on a balanced three-phase signal.
 *
 *   state: { theta, omega, integrator }
 *   ki, kp: PI gains
 *   Ts: sample period
 *   abc: latest three-phase sample
 *
 * Returns updated state and the computed dq voltages (lock when q ≈ 0).
 */
export function srfPllStep(state, abc, Ts, kp = 50, ki = 1000) {
  if (!state) throw new Error('SRF-PLL: state required');
  ensureScalar(Ts, 'SRF-PLL: Ts');
  if (!(Ts > 0)) throw new Error('SRF-PLL: Ts must be > 0');
  const ab = clarke(abc);
  const dq = park(ab, state.theta);
  const error = -dq.q;
  const integrator = (state.integrator ?? 0) + ki * error * Ts;
  const omega = (state.omega ?? 0) + kp * error + integrator * 0; // PI structure below
  // PI with anti-windup-free baseline: ω = ω_ff + kp e + integrator.
  const omegaCmd = (state.feedForwardOmega ?? 0) + kp * error + integrator;
  const theta = ((state.theta ?? 0) + omegaCmd * Ts) % (2 * Math.PI);
  return {
    theta,
    omega: omegaCmd,
    integrator,
    dq,
  };
}
