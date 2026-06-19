/**
 * funnel_control.js — Funnel control / Prescribed Performance Control.
 *
 * Loop 4 (Zero-Flaw) addition. Provides model-free output-tracking with
 * an *explicit* transient performance envelope (funnel) and steady-state
 * accuracy bound.
 *
 * Funnel control (Ilchmann, Ryan, Sangwin 2002):
 *
 *   Choose a smooth performance funnel φ(t) > 0 satisfying
 *     |e(t)| < φ(t)  for all t ≥ 0
 *
 *   The gain
 *     k(t) = 1 / (φ(t)² − e(t)²)
 *   diverges as e approaches the funnel boundary, so the high-gain feedback
 *     u(t) = −k(t) e(t)
 *   keeps the error strictly inside φ for all relative-degree-one minimum-
 *   phase systems with bounded internal dynamics, *without any plant model*.
 *
 * Prescribed Performance Control (Bechlioulis-Rovithakis 2008) generalises
 * this with a transformed error to guarantee both upper and lower bounds.
 *
 * This module exposes:
 *   1. `defaultFunnel(phi0, phiInf, lambda)` — exponentially shrinking funnel
 *        φ(t) = (φ_0 − φ_∞) e^{−λ t} + φ_∞
 *   2. `funnelControlStep(error, t, funnel)` — returns u, k, slack.
 *   3. `simulateFunnelControl(plant, ref, funnel, options)` — closed-loop
 *      simulation for a 1st-relative-degree SISO plant.
 *
 * Reference:
 *   - Ilchmann, Ryan, Sangwin, "Tracking with prescribed transient behavior",
 *     ESAIM-COCV 7, 2002.
 *   - Bechlioulis, Rovithakis, "Robust adaptive control of feedback
 *     linearizable MIMO nonlinear systems with prescribed performance",
 *     IEEE TAC 53(9), 2008.
 */

export function defaultFunnel(phi0, phiInf, lambda) {
  if (!(phi0 > 0 && phiInf > 0 && lambda > 0)) {
    throw new Error('funnel: phi0, phiInf, lambda must be positive');
  }
  if (!(phi0 >= phiInf)) {
    throw new Error('funnel: phi0 must be ≥ phiInf for shrinking funnel');
  }
  return function phi(t) {
    return (phi0 - phiInf) * Math.exp(-lambda * t) + phiInf;
  };
}

/**
 * Single-step funnel feedback.
 *
 * @param {number} error - current tracking error e = y − y_ref
 * @param {number} t - current time
 * @param {(t:number)=>number} funnel - φ(t) function
 * @returns { u, k, slack } where slack = φ(t) − |e|.
 */
export function funnelControlStep(error, t, funnel) {
  const phi = funnel(t);
  const slack = phi - Math.abs(error);
  if (slack <= 0) {
    // Funnel breached — escalate gain harshly but keep finite for sim safety.
    const k = 1 / Math.max(1e-12, phi * phi * 1e-6);
    return { u: -k * error, k, slack: 0 };
  }
  const k = 1 / (phi * phi - error * error);
  return { u: -k * error, k, slack };
}

/**
 * Closed-loop simulation of a 1st-order relative-degree-one SISO plant
 *   ẏ = a y + b u + d(t),  b > 0
 * under funnel control.
 */
export function simulateFunnelControl(plant, refTraj, funnel, options = {}) {
  const Ts = options.Ts ?? 1e-3;
  if (!(Ts > 0)) throw new Error('funnel sim: Ts > 0');
  if (!Array.isArray(refTraj)) throw new Error('funnel sim: refTraj array required');
  const a = plant.a ?? -1;
  const b = plant.b ?? 1;
  if (!(b > 0)) throw new Error('funnel sim: plant.b must be > 0 (high-frequency gain sign)');
  const disturbance = options.disturbance ?? (() => 0);

  let y = options.y0 ?? 0;
  const T = refTraj.length;
  const t = new Array(T), yArr = new Array(T), uArr = new Array(T);
  const eArr = new Array(T), phiArr = new Array(T), slackArr = new Array(T);
  let funnelBreached = false;
  for (let k = 0; k < T; k++) {
    t[k] = k * Ts;
    const e = y - refTraj[k];
    const ctrl = funnelControlStep(e, t[k], funnel);
    if (ctrl.slack <= 0) funnelBreached = true;
    const u = ctrl.u;
    const d = disturbance(t[k]);
    y += Ts * (a * y + b * u + d);
    yArr[k] = y; uArr[k] = u; eArr[k] = e;
    phiArr[k] = funnel(t[k]); slackArr[k] = ctrl.slack;
  }
  let worstAbsErr = 0;
  let minSlack = Infinity;
  for (let k = 0; k < T; k++) {
    if (Math.abs(eArr[k]) > worstAbsErr) worstAbsErr = Math.abs(eArr[k]);
    if (slackArr[k] < minSlack) minSlack = slackArr[k];
  }
  return { t, y: yArr, u: uArr, e: eArr, phi: phiArr, slack: slackArr,
           worstAbsErr, minSlack, funnelBreached };
}
