/**
 * youla.js — Explicit Youla (Q-parameterization) of all stabilising
 * controllers around a coprime-factored plant.
 *
 * Loop 6 (Zero-Flaw) addition. Although `hinf_riccati.js` exposes coprime-
 * factor loop shaping internally, no API explicitly returned a stabilising
 * controller family parameterised by Q ∈ RH∞. This module fixes that.
 *
 * Setup: SISO plant P(s) factored as P = N/M with N, M ∈ RH∞ coprime
 * (right coprime, so M and N share no RHP zeros). Choose an initial
 * stabilising controller K₀ = X/Y with N X + M Y = 1 (Bezout identity).
 * The complete family of stabilising controllers is
 *
 *   K(Q) = (X + M Q) / (Y − N Q),   Q ∈ RH∞
 *
 * Q = 0 recovers K₀; Q ≠ 0 provides the affine parameterisation that any
 * design objective (H∞, H₂, model-matching) can be searched over.
 *
 * For the verification-grade baseline we use a structural shortcut:
 * users pass (N, M, X, Y) — or for the common case, a stable plant Pn —
 * and we expose
 *   - `bezoutFactorization(N, M)` solving NX + MY = 1 by polynomial Bezout
 *     identity on the coefficient polynomials.
 *   - `youlaController(N, M, X, Y, Q)` constructing K(Q).
 *
 * Reference:
 *   - Vidyasagar, "Control System Synthesis: A Factorization Approach", MIT
 *     Press 1985.
 *   - Doyle, Francis, Tannenbaum, "Feedback Control Theory", Macmillan 1992,
 *     §5–§6.
 *   - Youla, Jabr, Bongiorno, "Modern Wiener-Hopf design of optimal
 *     controllers, Part II", IEEE TAC 21(3), 1976.
 */

import { TransferFunction } from './transfer-function.js';
import { polymul } from '../math/polynomial.js';

function polyAdd(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    out[n - 1 - i] = (a[a.length - 1 - i] ?? 0) + (b[b.length - 1 - i] ?? 0);
  }
  return out;
}

function polySub(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    out[n - 1 - i] = (a[a.length - 1 - i] ?? 0) - (b[b.length - 1 - i] ?? 0);
  }
  return out;
}

/**
 * Solve the Bezout identity N(s) X(s) + M(s) Y(s) = 1 for given coprime
 * polynomial pair (N, M). Implementation: extended Euclidean algorithm on
 * descending-power polynomial coefficient arrays.
 *
 * Caveat: for true RH∞ factors with stable poles we just normalise such
 * that the resulting controller poles match Y(s). The verification harness
 * checks NX + MY = 1 to coefficient precision.
 */
export function bezoutFactorization(N, M) {
  if (!Array.isArray(N) || !Array.isArray(M)) throw new Error('Bezout: arrays required');
  // Run extended Euclidean on N, M
  let r0 = M.slice();
  let r1 = N.slice();
  let s0 = [1], s1 = [0];
  let t0 = [0], t1 = [1];
  while (!isZero(r1)) {
    const { quotient, remainder } = polyDivide(r0, r1);
    const r2 = remainder;
    const s2 = polySub(s0, polymul(quotient, s1));
    const t2 = polySub(t0, polymul(quotient, t1));
    r0 = r1; r1 = r2;
    s0 = s1; s1 = s2;
    t0 = t1; t1 = t2;
  }
  // r0 is gcd; assuming coprime ⇒ r0 = constant ≠ 0.
  const gcdConst = r0[r0.length - 1];
  if (Math.abs(gcdConst) < 1e-12) throw new Error('Bezout: N, M not coprime');
  const Y = s0.map((c) => c / gcdConst);
  const X = t0.map((c) => c / gcdConst);
  return { X, Y };
}

function isZero(p) {
  return p.every((c) => Math.abs(c) < 1e-12);
}

function polyDivide(num, den) {
  const n = num.slice();
  const d = den.slice();
  if (n.length < d.length) return { quotient: [0], remainder: n };
  const q = new Array(n.length - d.length + 1).fill(0);
  for (let i = 0; i < q.length; i++) {
    const coef = n[i] / d[0];
    q[i] = coef;
    for (let j = 0; j < d.length; j++) {
      n[i + j] -= coef * d[j];
    }
  }
  // remainder is the trailing d.length - 1 entries
  const remainder = n.slice(n.length - (d.length - 1));
  // trim leading zeros for cleanliness
  while (remainder.length > 1 && Math.abs(remainder[0]) < 1e-12) remainder.shift();
  return { quotient: q, remainder };
}

/**
 * Construct the Youla controller K(Q) = (X + MQ) / (Y − NQ).
 *
 * Q can be either a scalar (interpreted as constant Q(s) = q) or a
 * TransferFunction. Returns the resulting controller as a TransferFunction.
 */
export function youlaController(N, M, X, Y, Q) {
  let Qnum, Qden;
  if (typeof Q === 'number') {
    Qnum = [Q];
    Qden = [1];
  } else if (Q && Array.isArray(Q.num) && Array.isArray(Q.den)) {
    Qnum = Q.num.slice();
    Qden = Q.den.slice();
  } else {
    throw new Error('Youla: Q must be number or TransferFunction');
  }
  // numerator of K = X·Qden + M·Qnum   (after common Qden)
  // denominator of K = Y·Qden − N·Qnum
  const numK = polyAdd(polymul(X, Qden), polymul(M, Qnum));
  const denK = polySub(polymul(Y, Qden), polymul(N, Qnum));
  return new TransferFunction(numK, denK);
}

/**
 * Convenience: Bezout-derived stabilising controller for a plant supplied
 * as P(s) = N(s)/M(s) with N, M ∈ RH∞. Returns (X, Y, K0 = X/Y) and a
 * generator function `K(Q)`.
 */
export function youlaFamily(N, M) {
  let { X, Y } = bezoutFactorization(N, M);
  // The EEA-derived Bezout solution can have Y ≡ 0 (e.g. when N is a unit).
  // The Bezout family (X + M·t, Y − N·t) for any polynomial t gives equivalent
  // solutions. If Y is effectively zero, shift by t = 1 to produce a proper
  // (non-trivial) controller K₀ = X/Y with Y ≠ 0.
  if (Y.every((c) => Math.abs(c) < 1e-12)) {
    X = polyAdd(X, M);
    Y = polySub(Y, N);
  }
  return {
    X, Y,
    K0: new TransferFunction(X, Y),
    K(Q) { return youlaController(N, M, X, Y, Q); },
    /** verifies the Bezout identity */
    bezoutResidual() {
      const NX = polymul(N, X);
      const MY = polymul(M, Y);
      const sum = polyAdd(NX, MY);
      // expected: sum ≈ [1]. compare against [0, 0, ..., 1]
      const expected = new Array(sum.length).fill(0);
      expected[expected.length - 1] = 1;
      let worst = 0;
      for (let i = 0; i < sum.length; i++) {
        const d = Math.abs(sum[i] - expected[i]);
        if (d > worst) worst = d;
      }
      return worst;
    },
  };
}
