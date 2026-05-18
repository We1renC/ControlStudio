// delay.js — Time delay (dead time) handling for continuous-time systems
// Padé approximation of e^{-sT} as a rational transfer function.
//
// References:
//   - Astrom & Murray, "Feedback Systems", §11.3
//   - Mathworks Control Toolbox `pade()` reference

import { TransferFunction } from './transfer-function.js';
import { polymul } from '../math/polynomial.js';

/**
 * Pade approximant of e^{-sT}: a rational p(s)/q(s) of order n.
 *   Numerator   p(s) = Σ_{k=0..n} a_k (Ts)^k   where a_k = (2n−k)! n! / [(2n)! k! (n−k)!] (−1)^k
 *   Denominator q(s) = a_k with sign flipped to + (k always positive)
 * The convention here uses high-order coefficient first (matches TransferFunction).
 */
export function padeCoefficients(T, n) {
  if (!Number.isFinite(T) || T < 0) throw new Error('Pade: T must be a finite non-negative number');
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Pade: order n must be integer 1..10');
  if (T === 0) return { num: [1], den: [1] };

  const fact = [1];
  for (let i = 1; i <= 2 * n; i++) fact.push(fact[i - 1] * i);
  // c_k = (2n − k)! n! / [(2n)! k! (n − k)!]
  const c = [];
  for (let k = 0; k <= n; k++) {
    c.push((fact[2 * n - k] * fact[n]) / (fact[2 * n] * fact[k] * fact[n - k]));
  }
  // p(s)= Σ (−1)^k c_k (Ts)^k   (low-order first)
  const numLow = c.map((ck, k) => Math.pow(-1, k) * ck * Math.pow(T, k));
  // q(s)= Σ c_k (Ts)^k
  const denLow = c.map((ck, k) => ck * Math.pow(T, k));
  // TransferFunction uses high-order coefficient first → reverse
  return { num: numLow.slice().reverse(), den: denLow.slice().reverse() };
}

/** Returns a TransferFunction representing the n-th order Padé approximation of e^{-sT}. */
export function padeApprox(T, n = 2) {
  const { num, den } = padeCoefficients(T, n);
  return new TransferFunction(num, den);
}

/**
 * Compose a plant with a time delay. Returns G(s) · e^{-sT} approximated as G(s)·Pade(T, n).
 * @param {TransferFunction} G - plant
 * @param {number} delaySeconds
 * @param {number} order - Padé order (1..6 typical, 2 recommended default)
 */
export function applyDelay(G, delaySeconds, order = 2) {
  if (!delaySeconds || delaySeconds <= 0) return G;
  const pade = padeApprox(delaySeconds, order);
  return G.series(pade);
}

/**
 * Phase contribution of a pure delay e^{-jωT}: φ(ω) = −ωT radians.
 * Useful for analytical phase computation without Padé approximation.
 */
export function delayPhase(omega, delaySeconds) {
  return -omega * delaySeconds;
}

/**
 * Delay margin (seconds): given phase margin PM (radians) at gain-crossover ω_gc,
 * DM = PM / ω_gc. This is the additional delay the loop can tolerate before instability.
 */
export function delayMargin(phaseMarginDeg, gainCrossoverOmega) {
  if (!Number.isFinite(phaseMarginDeg) || !Number.isFinite(gainCrossoverOmega) || gainCrossoverOmega <= 0) {
    return NaN;
  }
  const pmRad = (phaseMarginDeg * Math.PI) / 180;
  return pmRad / gainCrossoverOmega;
}

/**
 * Smith Predictor compensator structure for plants with dead time.
 *
 * The Smith predictor wraps an existing controller C(s) so that the effective
 * loop transfer L(s) = C(s) · G(s) (delay-free) rather than C(s) · G(s) · e^{-sT}.
 *
 *      ┌────── G_m(s)·(1−e^{−sT_m}) ──────┐
 *      │                                  ▼
 *  r → + → C(s) → u → G(s)·e^{−sT} → y → − → (feedback)
 *      ↑                                  │
 *      └──────────────────────────────────┘
 *
 * Returns an effective open-loop TF L_eff = C(s)·G_m(s) plus a perturbation block.
 * Caller can use L_eff for nominal stability margin analysis.
 *
 * @param {TransferFunction} controllerTf
 * @param {TransferFunction} plantModelGm - delay-free model of the plant
 * @returns {{ effectiveLoop: TransferFunction, description: string }}
 */
export function smithPredictor(controllerTf, plantModelGm) {
  if (!controllerTf || !plantModelGm) throw new Error('Smith predictor: missing controller or plant model');
  const effectiveLoop = controllerTf.series(plantModelGm);
  return {
    effectiveLoop,
    description: 'Smith predictor: design controller against delay-free model G_m(s); ' +
                 'predictor structure removes the delay from inside the loop, recovering classical margin analysis.',
  };
}
