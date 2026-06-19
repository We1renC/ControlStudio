/**
 * disturbance_observer.js — Classical Disturbance Observer (DOB).
 *
 * Loop 4 (Zero-Flaw) addition. Independent of ADRC's ESO.
 *
 * Architecture (Ohnishi 1987, Umeno-Hori 1991):
 *
 *           ┌────────── plant P(s) ──────────┐
 *   r ──+──►│  C(s)  ──+──►   Pn(s)·real     │── y
 *       │   │           │                    │
 *       │   │   d̂(s) ◄── Q(s)( Pn^{-1}(s) y − u )
 *       │   └────────────────────────────────┘
 *
 * The DOB estimates the lumped disturbance d̂ via the inverse nominal
 * plant Pn^{-1} filtered by a low-pass Q(s); when Q ≈ 1 inside the
 * controller bandwidth, the closed loop behaves like the nominal plant
 * regardless of model mismatch.
 *
 * Implemented as a state-space realisation of the DOB inner loop:
 *   Q(s) · Pn^{-1}(s) y(s) − Q(s) u(s) = d̂(s)
 * where Q is parameterised as a Butterworth low-pass of order r and
 * cutoff ω_c. Pn is provided as a strictly-proper TransferFunction.
 *
 * Reference:
 *   - Ohnishi, "A new servo method in mechatronics", JIEE 1987.
 *   - Umeno, Hori, "Robust speed control of DC servomotors", 1991.
 *   - Chen, Yang, Guo, Li, "Disturbance-Observer-Based Control and
 *     Related Methods—An Overview", IEEE TIE 63(2), 2016.
 */

import { TransferFunction } from './transfer-function.js';
import { polymul } from '../math/polynomial.js';

function butterworthLowPass(order, omegaC) {
  // Returns Q(s) of degree `order` with unit DC gain.
  // Generates analytical Butterworth poles s_k = ω_c exp(j(2k+order+1)π/(2 order))
  // and folds conjugate pairs into a real denominator polynomial.
  if (!Number.isInteger(order) || order < 1) throw new Error('butter: order ≥ 1 integer');
  if (!(omegaC > 0)) throw new Error('butter: ω_c > 0');
  // Start with denominator polynomial = 1, multiply by quadratic / linear factors.
  let den = [1];
  if (order % 2 === 1) {
    // simple real pole at -ω_c
    den = polymul(den, [1, omegaC]);
  }
  const pairs = Math.floor(order / 2);
  for (let k = 0; k < pairs; k++) {
    const theta = Math.PI * (2 * k + 1) / (2 * order);
    const real = -omegaC * Math.sin(theta);
    const imag =  omegaC * Math.cos(theta);
    // (s - (real + jImag))(s - (real - jImag)) = s² − 2 real s + (real² + imag²)
    const a = -2 * real;
    const b = real * real + imag * imag;
    den = polymul(den, [1, a, b]);
  }
  // Normalise DC: divide by den[last] / 1  to keep monic high-order; scale numerator to unit gain.
  const dc = den[den.length - 1];
  return new TransferFunction([dc], den);
}

/**
 * Build a DOB block that takes (u, y) sampled signals and produces d̂(t).
 *
 * For SISO strictly-proper nominal plant Pn(s) = N(s)/D(s):
 *   Pn^{-1}(s) = D(s)/N(s)
 * which is improper if deg(D) > deg(N) (almost always). To keep the inner
 * loop proper we use Q(s) · Pn^{-1}(s) with order(Q) ≥ relative degree(Pn).
 *
 * Returns:
 *   {
 *     Q,                                  // low-pass filter (TF)
 *     QinvPn,                             // proper Q · Pn^{-1} (TF)
 *     estimate(u, y)                      // simulate over signal arrays, return d_hat[]
 *   }
 */
export function buildDOB(Pn, options = {}) {
  if (!Pn || !Pn.num || !Pn.den) throw new Error('DOB: nominal plant Pn required');
  const relDeg = (Pn.den.length - 1) - (Pn.num.length - 1);
  if (relDeg < 1) throw new Error('DOB: nominal plant must be strictly proper');
  const order = options.filterOrder ?? Math.max(relDeg, 1);
  if (order < relDeg) throw new Error(`DOB: filter order ${order} must be ≥ relative degree ${relDeg}`);
  const omegaC = options.cutoff ?? 50;
  const Q = butterworthLowPass(order, omegaC);

  // Q · Pn^{-1} = Q(s) * D(s) / N(s).
  const numerator = polymul(Q.num, Pn.den);
  const denominator = polymul(Q.den, Pn.num);
  const QinvPn = new TransferFunction(numerator, denominator);

  return {
    Q,
    QinvPn,
    /**
     * Estimate disturbance from sampled signals using simple discrete
     * Tustin-equivalent state propagation of (Q·Pn^{-1}) and Q acting on
     * (y, u) respectively.  d̂[k] = (Q·Pn^{-1})[y][k] − Q[u][k].
     */
    estimate(u, y, Ts) {
      if (!Array.isArray(u) || !Array.isArray(y)) throw new Error('DOB.estimate: u, y arrays required');
      if (u.length !== y.length) throw new Error('DOB.estimate: u, y must match length');
      if (!(Ts > 0)) throw new Error('DOB.estimate: Ts > 0');
      const yPath = simulateTf(QinvPn, y, Ts);
      const uPath = simulateTf(Q,      u, Ts);
      const d = new Array(u.length);
      for (let k = 0; k < u.length; k++) d[k] = yPath[k] - uPath[k];
      return d;
    },
  };
}

// ── Tustin-discretised SISO transfer-function simulation ──────────────────

function simulateTf(tf, input, Ts) {
  // Discretise via bilinear (Tustin) transformation:
  //   s ≈ (2/Ts) · (z − 1)/(z + 1)
  // For numerator/denominator of order n, build coefficient arrays and run
  // a difference equation a_0 y[k] + a_1 y[k-1] + … = b_0 u[k] + b_1 u[k-1] …
  const { numD, denD } = bilinearDiscretize(tf, Ts);
  const m = numD.length;
  const n = denD.length;
  const y = new Array(input.length).fill(0);
  for (let k = 0; k < input.length; k++) {
    let acc = 0;
    for (let j = 0; j < m; j++) {
      const idx = k - j;
      if (idx >= 0) acc += numD[j] * input[idx];
    }
    for (let j = 1; j < n; j++) {
      const idx = k - j;
      if (idx >= 0) acc -= denD[j] * y[idx];
    }
    y[k] = acc / denD[0];
  }
  return y;
}

function bilinearDiscretize(tf, Ts) {
  // For TF given in descending-powers-of-s coefficients, substitute s = (2/Ts)(z-1)/(z+1)
  // and collect descending-z coefficients via polynomial substitution.
  const c = 2 / Ts;
  const numS = tf.num;
  const denS = tf.den;
  // Helper: polynomial substitute s → c (z-1)/(z+1), starting from highest-degree of (numS / denS).
  // Multiply numerator and denominator by (z+1)^N where N = max(deg num, deg den) so result is polynomial in z.
  const Nh = Math.max(numS.length, denS.length) - 1;
  const numZ = substS(numS, c, Nh);
  const denZ = substS(denS, c, Nh);
  return { numD: numZ, denD: denZ };
}

function substS(poly, c, Nh) {
  // poly: descending-power coefficients in s.
  // Returns descending-power coefficients in z of the substituted polynomial,
  // scaled to highest degree Nh.
  const deg = poly.length - 1;
  // Build resulting z-polynomial of degree Nh.
  let result = [0];
  for (let i = 0; i <= deg; i++) {
    // term = poly[i] * c^(deg - i) * (z-1)^(deg-i) * (z+1)^(Nh - (deg-i))
    const k = deg - i;
    const factor = poly[i] * Math.pow(c, k);
    const pZminus = polyPower([1, -1], k);
    const pZplus  = polyPower([1, 1], Nh - k);
    const term = polymul(pZminus, pZplus).map((v) => v * factor);
    result = polyAdd(result, term);
  }
  return result;
}

function polyPower(p, n) {
  if (n === 0) return [1];
  let r = [1];
  for (let i = 0; i < n; i++) r = polymul(r, p);
  return r;
}

function polyAdd(a, b) {
  const n = Math.max(a.length, b.length);
  const r = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const av = a[a.length - 1 - i] ?? 0;
    const bv = b[b.length - 1 - i] ?? 0;
    r[n - 1 - i] = av + bv;
  }
  return r;
}
