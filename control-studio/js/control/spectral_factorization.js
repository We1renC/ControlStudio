/**
 * spectral_factorization.js — Continuous spectral factorization Φ(s) = Ψ(−s)Ψ(s).
 *
 * Loop 5 (Zero-Flaw) addition. Required to instantiate any Wiener-style
 * design (colored noise shaping, classical H₂ synthesis, Bode integral
 * decomposition). Without this primitive ControlStudio could only handle
 * already-factored noise descriptions.
 *
 * Algorithm (Anderson 1967, Sayed-Kailath 2001):
 *   Given Φ(s) = N(s) / D(s) with Φ(jω) ≥ 0 for all ω and Φ(s) = Φ(−s),
 *   compute Ψ such that Φ(s) = Ψ(−s) Ψ(s), Ψ stable, Ψ minimum-phase, by:
 *     1.  Factor N(s) and D(s) into their real and imaginary parts in s.
 *     2.  Collect the left-half-plane zeros / poles of Φ:
 *           Ψ = K · (Π_zeros (s − z_i, Re(z_i) ≤ 0)) / (Π_poles (s − p_i, Re(p_i) < 0))
 *     3.  Determine gain K so that |Ψ(jω)|^2 matches Φ(jω) at ω = 0
 *         (uses Φ(0) > 0 sanity check; if Φ(0) = 0 fall back to ω = 1).
 *
 * Reference:
 *   - Anderson, "An algebraic solution to the spectral factorization problem",
 *     IEEE TAC, 1967.
 *   - Kailath, Sayed, "Linear Estimation", Prentice Hall.
 *   - Youla, "On the factorization of rational matrices", IRE TIT, 1961.
 */

import { TransferFunction } from './transfer-function.js';
import { polyroots, polymul } from '../math/polynomial.js';
import { Complex } from '../math/complex.js';

function polyEval(p, s) {
  // s: Complex; p: descending real coefficients.
  let acc = new Complex(0, 0);
  for (const c of p) acc = acc.mul(s).add(new Complex(c, 0));
  return acc;
}

function rootsToPoly(roots) {
  // Convert a list of (real or complex) roots to a real-coefficient descending
  // polynomial. Complex roots must come as conjugate pairs.
  let poly = [1];
  let i = 0;
  while (i < roots.length) {
    const r = roots[i];
    if (Math.abs(r.im) < 1e-9) {
      poly = polymul(poly, [1, -r.re]);
      i++;
    } else {
      // expect conjugate pair next
      const a = -2 * r.re;
      const b = r.re * r.re + r.im * r.im;
      poly = polymul(poly, [1, a, b]);
      i += 2;
    }
  }
  return poly;
}

/**
 * Spectral factorization Φ(s) = Ψ(−s) Ψ(s).
 *
 * @param {TransferFunction} Phi - Even-symmetric rational, must satisfy Φ(s) = Φ(−s)
 *   numerically. The verification harness checks this.
 * @returns {{ Psi: TransferFunction, gain: number }}
 */
export function spectralFactor(Phi) {
  if (!Phi || !Phi.num || !Phi.den) throw new Error('spectralFactor: TF required');
  const zeros = polyroots(Phi.num);
  const poles = polyroots(Phi.den);
  // Symmetry sanity check: every zero/pole must appear with its mirror −z.
  // Allow tiny imaginary numerical drift.
  for (const z of zeros) {
    if (!hasMirror(zeros, z, 1e-6)) {
      throw new Error('spectralFactor: numerator not symmetric about jω-axis');
    }
  }
  for (const p of poles) {
    if (!hasMirror(poles, p, 1e-6)) {
      throw new Error('spectralFactor: denominator not symmetric about jω-axis');
    }
  }
  const psiZeros = zeros.filter((z) => z.re <= 1e-9);
  const psiPoles = poles.filter((z) => z.re < -1e-12);
  // Sort to keep conjugate pairs adjacent so rootsToPoly produces real coeffs.
  const psiNum = rootsToPoly(sortConjugatePairs(psiZeros));
  const psiDen = rootsToPoly(sortConjugatePairs(psiPoles));
  // Determine gain by matching |Ψ(jω₀)|² to Φ(jω₀).
  const omega = 0;
  const sJW = new Complex(0, omega);
  const phiVal = polyEval(Phi.num, sJW).div(polyEval(Phi.den, sJW));
  if (Math.abs(phiVal.re) < 1e-12 && Math.abs(phiVal.im) < 1e-12) {
    throw new Error('spectralFactor: Φ vanishes at ω=0; pass non-zero matching frequency');
  }
  const psiVal = polyEval(psiNum, sJW).div(polyEval(psiDen, sJW));
  const psiMagSq = psiVal.re * psiVal.re + psiVal.im * psiVal.im;
  const phiMag = phiVal.re; // real-valued positive at jω because of Hermitian symmetry
  const K = Math.sqrt(Math.max(0, phiMag / Math.max(psiMagSq, 1e-18)));
  return {
    Psi: new TransferFunction(psiNum.map((v) => v * K), psiDen),
    gain: K,
  };
}

function hasMirror(list, target, tol) {
  return list.some((z) => Math.abs(z.re + target.re) < tol && Math.abs(z.im - target.im) < tol);
}

function sortConjugatePairs(list) {
  const reals = list.filter((z) => Math.abs(z.im) < 1e-8).sort((a, b) => a.re - b.re);
  const cplx = list.filter((z) => Math.abs(z.im) >= 1e-8);
  const pos = cplx.filter((z) => z.im > 0).sort((a, b) => a.re - b.re || a.im - b.im);
  const result = [...reals];
  for (const p of pos) {
    result.push(p);
    result.push(new Complex(p.re, -p.im));
  }
  return result;
}
