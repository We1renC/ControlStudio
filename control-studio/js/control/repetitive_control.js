/**
 * repetitive_control.js — Internal-model Repetitive Control (RC).
 *
 * Loop 4 (Zero-Flaw) addition.
 *
 * Repetitive control rejects / tracks a periodic exogenous signal of period
 * T_p by embedding the internal model
 *
 *   M(z) = z^{-N} / (1 − Q(z) z^{-N})
 *
 * where N = round(T_p / Ts) is the integer period in samples and Q(z) is a
 * stability-conditioning filter (typically a non-causal zero-phase low-pass).
 * RC is fundamentally different from Iterative Learning Control: ILC works in
 * trial domain across discrete trials, RC works in the *continuous* time
 * domain on a single trajectory with periodic dynamics.
 *
 * Stability condition (Hara-Omata-Nakano 1988):
 *   The closed loop with RC plug-in is stable iff
 *     | Q(e^{jωT_s}) − k_r G_cl(e^{jωT_s}) | < 1   for all ω
 *   where G_cl is the underlying closed-loop transfer and k_r is the RC gain.
 *
 * This module provides:
 *   1. `buildRepetitiveController(N, Q, kr)` — discrete plug-in controller.
 *   2. `repetitiveStabilityMargin(Gcl, omegas, Q, kr)` — frequency-domain
 *      sufficient stability test returning the worst-case |Q − k_r G_cl|.
 *   3. `simulateRC(Gcl, ref, period, Ts, options)` — recursive simulator that
 *      reproduces the typical "error attenuates exponentially in trials"
 *      RC behaviour.
 *
 * Reference:
 *   - Hara, Yamamoto, Omata, Nakano, "Repetitive control system: a new type
 *     servo system for periodic exogenous signals", IEEE TAC 33(7), 1988.
 *   - Inoue, "High accuracy control of a proton synchrotron magnet power
 *     supply", IFAC 1981.
 *   - Wang, Gao, Doyle, "Survey on iterative learning control, repetitive
 *     control, and run-to-run control", J. Process Ctrl. 19, 2009.
 */

import { TransferFunction } from './transfer-function.js';
import { Complex } from '../math/complex.js';

/**
 * Build a discrete repetitive controller as the plug-in operator
 *   C_RC(z) = k_r · z^{-N} / (1 − Q(z) z^{-N})
 *
 * Q is supplied as a callable `Q(omega, Ts)` returning a complex number,
 * or as a constant scalar interpreted as Q(z) ≡ Q. The default Q = 0.95
 * gives a robustness-vs-rejection trade-off close to the standard textbook
 * setting.
 */
export function buildRepetitiveController(N, options = {}) {
  if (!Number.isInteger(N) || N < 1) throw new Error('RC: N must be positive integer');
  const Q = options.Q ?? 0.95;
  const kr = options.kr ?? 0.5;
  if (!(kr > 0 && kr <= 1.5)) throw new Error('RC: gain k_r must lie in (0, 1.5]');

  const Qfun = typeof Q === 'function' ? Q : () => Q;

  return {
    N, kr, Q: Qfun,
    /**
     * Frequency response of C_RC at ω · Ts.
     * z = e^{jωT_s}, z^{-N} = e^{−jωT_s·N}.
     */
    evalAt(omega, Ts) {
      const phi = omega * Ts * N;
      const zN = { re: Math.cos(-phi), im: Math.sin(-phi) };
      const Qv = Qfun(omega, Ts);
      const Qz = typeof Qv === 'number' ? { re: Qv, im: 0 } : Qv;
      const denom = { re: 1 - (Qz.re * zN.re - Qz.im * zN.im), im: -(Qz.re * zN.im + Qz.im * zN.re) };
      const numer = { re: kr * zN.re, im: kr * zN.im };
      // numer / denom
      const denomMag = denom.re * denom.re + denom.im * denom.im;
      return {
        re: (numer.re * denom.re + numer.im * denom.im) / denomMag,
        im: (numer.im * denom.re - numer.re * denom.im) / denomMag,
      };
    },
  };
}

/**
 * Frequency-domain stability margin: worst-case |Q − k_r G_cl(jω)| over
 * the provided grid. Should be strictly < 1 to satisfy the small-gain
 * theorem condition for RC stability.
 */
export function repetitiveStabilityMargin(Gcl, omegas, options = {}) {
  if (!Gcl || typeof Gcl.evalAt !== 'function') {
    throw new Error('RC margin: Gcl TransferFunction required');
  }
  const Q = options.Q ?? 0.95;
  const kr = options.kr ?? 0.5;
  let worst = 0;
  let worstOmega = omegas[0];
  for (const w of omegas) {
    const c = Gcl.evalAt(new Complex(0, w));
    const Qv = typeof Q === 'function' ? Q(w) : Q;
    const QvRe = typeof Qv === 'number' ? Qv : Qv.re;
    const QvIm = typeof Qv === 'number' ? 0  : Qv.im;
    const reExpr = QvRe - kr * c.re;
    const imExpr = QvIm - kr * c.im;
    const mag = Math.hypot(reExpr, imExpr);
    if (mag > worst) { worst = mag; worstOmega = w; }
  }
  return { worst, worstOmega, stable: worst < 1 };
}

/**
 * Simulate a sinusoidal-reference tracking task under an RC plug-in for a
 * stable closed-loop dynamics Gcl. We bypass full controller composition
 * and use the small-gain identity: the residual error after k periods is
 *   e_k = (Q − k_r G_cl)^k e_0
 * applied per discrete frequency bin. We confirm exponential decay vs
 * trial index and the asymptotic plateau.
 *
 * Reference signal: sin(2π t / T_p). Underlying closed-loop is approximated
 * by its DC gain (G_cl(0)).
 */
export function simulateRC(Gcl, period, Ts, options = {}) {
  if (!(period > 0 && Ts > 0)) throw new Error('RC sim: period and Ts must be > 0');
  if (Ts >= period) throw new Error('RC sim: sample time must be smaller than period');
  const trials = options.trials ?? 8;
  const kr = options.kr ?? 0.5;
  const Q = options.Q ?? 0.95;
  const omega = 2 * Math.PI / period;
  const c = Gcl.evalAt(new Complex(0, omega));
  const factor = { re: Q - kr * c.re, im: -kr * c.im };
  const factorMag = Math.hypot(factor.re, factor.im);
  const errors = new Array(trials);
  let acc = 1; // initial unit reference error
  for (let k = 0; k < trials; k++) {
    errors[k] = acc;
    acc *= factorMag;
  }
  return {
    errors,
    contractionFactor: factorMag,
    converged: factorMag < 1,
  };
}
