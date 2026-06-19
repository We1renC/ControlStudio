/**
 * nu_gap.js — Vinnicombe ν-gap metric δ_ν(G1, G2) baseline.
 *
 * Loop 2 (Zero-Flaw) addition. ControlStudio had no robust-closeness metric
 * other than spectral plots; without ν-gap the H∞ loop-shaping bound
 *   b_{opt}(G, K) ≥ b_{opt}(G_0, K) − δ_ν(G, G_0)
 * (Vinnicombe 1993, "Frequency Response and the Graph Topology") cannot be
 * verified, and any literature using ν-gap to certify robustness fails to
 * replicate.
 *
 * Definition (SISO, point-wise frequency form):
 *   κ(G1, G2, ω) := |G1(jω) − G2(jω)|
 *                   / sqrt( (1 + |G1(jω)|^2)(1 + |G2(jω)|^2) )
 *   δ_ν(G1, G2) = sup_ω κ(G1, G2, ω)
 * subject to a winding-number side-condition wno det(1 + G_1^* G_2)(s) = 0
 * (we expose a simple winding-number proxy via crossing count).
 *
 * The implementation evaluates G_i(jω) over a logarithmic grid and returns
 * both the supremum estimate and the winding-number diagnostic. For numeric
 * stability it caps the supremum at 1 (the metric upper bound) when
 * outside-disk samples appear, matching the standard Vinnicombe convention.
 */

import { TransferFunction } from './transfer-function.js';
import { Complex } from '../math/complex.js';

function ensureTF(g, label) {
  if (!g || typeof g.evalAt !== 'function') {
    throw new Error(`${label}: expected TransferFunction with evalAt(s)`);
  }
}

function evalAtJw(g, omega) {
  const c = g.evalAt(new Complex(0, omega));
  return { re: c.re, im: c.im };
}

function logspace(a, b, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.pow(10, a + (b - a) * (i / (n - 1)));
  return out;
}

function complexAbs(c) {
  return Math.hypot(c.re, c.im);
}

function complexSub(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Compute the ν-gap metric δ_ν(G1, G2) on a logarithmic frequency grid.
 *
 * @param {TransferFunction} G1
 * @param {TransferFunction} G2
 * @param {object} [options]
 * @param {number[]} [options.omegas] - explicit frequency grid (rad/s)
 * @param {number} [options.decadesBelow] - low-end decades for auto grid
 * @param {number} [options.decadesAbove] - high-end decades for auto grid
 * @param {number} [options.samples]      - auto-grid sample count
 * @returns {{ nuGap: number, worstOmega: number, samples: Array, windingNumberApprox: number }}
 */
export function nuGap(G1, G2, options = {}) {
  ensureTF(G1, 'nuGap: G1');
  ensureTF(G2, 'nuGap: G2');
  const omegas = options.omegas
    ?? logspace(options.decadesBelow ?? -3, options.decadesAbove ?? 3, options.samples ?? 401);
  let nuGapValue = 0;
  let worstOmega = omegas[0];
  const samples = [];
  let signCrossings = 0;
  let prevSign = 0;
  for (const omega of omegas) {
    const g1 = evalAtJw(G1, omega);
    const g2 = evalAtJw(G2, omega);
    const num = complexAbs(complexSub(g1, g2));
    const m1 = complexAbs(g1);
    const m2 = complexAbs(g2);
    const den = Math.sqrt((1 + m1 * m1) * (1 + m2 * m2));
    const kappa = den > 0 ? num / den : 0;
    const capped = Math.min(kappa, 1.0);
    samples.push({ omega, kappa: capped });
    if (capped > nuGapValue) {
      nuGapValue = capped;
      worstOmega = omega;
    }
    // Winding-number proxy: count sign changes of Im(1 + G1* G2) along ω.
    // (Re of complex inner product). 1 + conj(G1) G2 ≈ 1 + (G1.re G2.re + G1.im G2.im) − j (G1.re G2.im − G1.im G2.re).
    const im = -(g1.re * g2.im - g1.im * g2.re);
    const sign = Math.sign(im);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) signCrossings += 1;
    if (sign !== 0) prevSign = sign;
  }
  return {
    nuGap: nuGapValue,
    worstOmega,
    samples,
    windingNumberApprox: signCrossings,
  };
}

/**
 * Compute the maximum closeness ball  b_{opt}(G) = inf_K (G, K is stabilising)
 * sufficient to keep δ_ν below ε. For any ε in (0, 1) we expose ε itself as
 * the closeness bound that ensures all plants within δ_ν ≤ ε share at least
 * one common stabilising controller of generalised stability margin 1 − ε.
 */
export function robustBallFromNuGap(epsilon) {
  if (!(epsilon > 0 && epsilon < 1)) {
    throw new Error('robustBall: ε must lie in (0, 1)');
  }
  return 1 - epsilon;
}
