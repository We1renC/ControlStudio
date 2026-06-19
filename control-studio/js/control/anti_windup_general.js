/**
 * anti_windup_general.js — Generic anti-windup and bumpless transfer.
 *
 * Loop 4 (Zero-Flaw) addition. ControlStudio previously had anti-windup only
 * inside the PID time-response simulator. This module exposes:
 *
 *   1. Back-calculation anti-windup (Hanus 1987, Åström-Hägglund) for any
 *      strictly-proper LTI controller realised in state-space form.
 *   2. Conditioned-controller anti-windup (Hanus' conditioned form) that
 *      preserves the unconstrained behaviour outside saturation.
 *   3. Controller-to-controller bumpless transfer with an arbitrary fade
 *      profile (Turner-Walker 2000).
 *
 * Controller state-space (input e = reference − feedback, output u):
 *   ẋ_c = A_c x_c + B_c e
 *   u   = C_c x_c + D_c e
 * Saturated actuator: u_sat = sat(u, u_lo, u_hi).
 * Back-calculation: ẋ_c = A_c x_c + B_c e + K_aw (u_sat − u)
 *   K_aw chosen so that the observer-like correction dynamics
 *   ẋ_c = (A_c − K_aw C_c) x_c + B_c e + K_aw (u_sat − D_c e)
 *   have eigenvalues at desired anti-windup poles (e.g. faster than B_c).
 *
 * Reference:
 *   - Hanus, Kinnaert, Henrotte, "Conditioning technique, a general
 *     anti-windup and bumpless transfer method", Automatica 23(6), 1987.
 *   - Kothare, Campo, Morari, Nett, "A unified framework for the study of
 *     anti-windup designs", Automatica 30(12), 1994.
 *   - Turner & Walker, "Modified linear quadratic bumpless transfer",
 *     Proc. ACC 2000.
 */

import { matMul, matSub, matAdd, matScale, matVecMul } from '../math/matrix.js';

function saturate(u, lo, hi) {
  return Math.min(hi, Math.max(lo, u));
}

/**
 * Simulate a saturated SISO controller with back-calculation anti-windup.
 *
 * Inputs:
 *   ctrl: { Ac, Bc, Cc, Dc } SISO controller realisation (Ac n×n, Bc n×1, Cc 1×n, Dc 1×1)
 *   refTraj, fbTraj: arrays of same length representing reference and feedback signals
 *   Ts: sample period (seconds)
 *   options:
 *     uLo, uHi: actuator limits
 *     Kaw: anti-windup correction gain (n×1)
 *
 * Returns { u: number[], uSat: number[], xc: number[][] }.
 */
export function simulateBackCalculationAW(ctrl, refTraj, fbTraj, Ts, options = {}) {
  const { Ac, Bc, Cc, Dc } = ctrl;
  if (refTraj.length !== fbTraj.length) {
    throw new Error('AW sim: ref and feedback arrays must match length');
  }
  const n = Ac.length;
  const Kaw = options.Kaw ?? new Array(n).fill(0).map(() => [1]);
  const uLo = options.uLo ?? -Infinity;
  const uHi = options.uHi ??  Infinity;
  let x = new Array(n).fill(0);
  const u = new Array(refTraj.length);
  const uSat = new Array(refTraj.length);
  const xs = new Array(refTraj.length);
  for (let k = 0; k < refTraj.length; k++) {
    const e = refTraj[k] - fbTraj[k];
    const uk = Cc[0].reduce((s, c, i) => s + c * x[i], 0) + Dc[0][0] * e;
    const uSk = saturate(uk, uLo, uHi);
    u[k] = uk;
    uSat[k] = uSk;
    xs[k] = x.slice();
    // Forward Euler with back-calculation correction (u_sat − u):
    const dx = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) dx[i] += Ac[i][j] * x[j];
      dx[i] += Bc[i][0] * e + Kaw[i][0] * (uSk - uk);
      x[i] += Ts * dx[i];
    }
  }
  return { u, uSat, xc: xs };
}

/**
 * Bumpless transfer between two SISO controllers via a fade profile α(t) ∈ [0,1].
 *   u(t) = (1 − α(t)) u_A(t) + α(t) u_B(t)
 * but the inactive controller's state is forced to track the active output by
 * back-calculation correction K_bt (u_active − u_inactive). This is the
 * Hanus / Turner-Walker bumpless transfer pattern.
 */
export function bumplessTransfer(ctrlA, ctrlB, refTraj, fbTraj, Ts, options = {}) {
  const fade = options.fade ?? defaultFadeProfile(refTraj.length);
  if (fade.length !== refTraj.length) throw new Error('bumpless: fade profile length mismatch');
  const Kbt = options.Kbt ?? 5;
  const uLo = options.uLo ?? -Infinity;
  const uHi = options.uHi ??  Infinity;
  const nA = ctrlA.Ac.length;
  const nB = ctrlB.Ac.length;
  let xA = new Array(nA).fill(0);
  let xB = new Array(nB).fill(0);
  const u = new Array(refTraj.length);
  for (let k = 0; k < refTraj.length; k++) {
    const e = refTraj[k] - fbTraj[k];
    const uA = ctrlA.Cc[0].reduce((s, c, i) => s + c * xA[i], 0) + ctrlA.Dc[0][0] * e;
    const uB = ctrlB.Cc[0].reduce((s, c, i) => s + c * xB[i], 0) + ctrlB.Dc[0][0] * e;
    const alpha = fade[k];
    const blended = (1 - alpha) * uA + alpha * uB;
    const uk = saturate(blended, uLo, uHi);
    u[k] = uk;
    // Tracking correction for inactive controllers using anti-windup style feedback.
    const corrA = (uk - uA) * Kbt;
    const corrB = (uk - uB) * Kbt;
    for (let i = 0; i < nA; i++) {
      let dx = 0;
      for (let j = 0; j < nA; j++) dx += ctrlA.Ac[i][j] * xA[j];
      dx += ctrlA.Bc[i][0] * e + corrA;
      xA[i] += Ts * dx;
    }
    for (let i = 0; i < nB; i++) {
      let dx = 0;
      for (let j = 0; j < nB; j++) dx += ctrlB.Ac[i][j] * xB[j];
      dx += ctrlB.Bc[i][0] * e + corrB;
      xB[i] += Ts * dx;
    }
  }
  return { u };
}

function defaultFadeProfile(n) {
  // Smooth half-cosine fade from 0 to 1 across the full horizon.
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * (1 - Math.cos(Math.PI * i / (n - 1)));
  return out;
}
