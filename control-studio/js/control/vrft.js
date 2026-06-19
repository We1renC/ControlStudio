/**
 * vrft.js — Virtual Reference Feedback Tuning (Campi-Lecchini-Savaresi).
 *
 * Loop 4 (Zero-Flaw) addition. ControlStudio had no batch data-driven
 * controller-tuning routine; SINDy and DeePC operate on prediction, VRFT
 * operates on controller tuning from a single open- or closed-loop dataset.
 *
 * Setup:
 *   Given input/output data (u_d, y_d) and a desired reference model M(z)
 *   (e.g. dominant first-order), compute the virtual reference
 *     r̃ = M^{-1}(z) y_d
 *   and the virtual tracking error
 *     ẽ = r̃ − y_d
 *   The controller class is parameterised as
 *     C(z; θ) = θ^T β(z)
 *   where β(z) is a vector of pre-specified basis transfer functions
 *   (e.g. [1, z^{-1}, …, z^{-n}] for FIR or a PID basis [1, 1/(1-z^{-1}),
 *   (1 - z^{-1})] in discrete).
 *
 * VRFT solves the least-squares problem
 *   min_θ Σ_k (β(z) ẽ_k · θ − u_d,k)^2
 *
 * Optionally pre-filter both signals with the spectrally-aware filter
 *   L(z) = (1 − M(z)) M(z) · Φ_u(z)^{-1/2}
 * to compensate for the bias under closed-loop data (Bazanella et al.).
 *
 * Reference:
 *   - Campi, Lecchini, Savaresi, "Virtual reference feedback tuning: a
 *     direct method for the design of feedback controllers", Automatica
 *     38(8), 2002.
 *   - Bazanella, Campestrini, Eckhard, "Data-Driven Controller Design",
 *     Springer 2012.
 */

import { matMul, matSolve, matTranspose, matCreate } from '../math/matrix.js';

/**
 * Apply a FIR-style discrete operator (descending-z numerator/denominator) to
 * a signal. Both num and den arrays use descending powers of z, e.g.
 *   H(z) = (b0 + b1 z^{-1}) / (1 + a1 z^{-1})
 * is encoded as { num: [b0, b1], den: [1, a1] }.
 */
function applyDiscreteOperator(num, den, signal) {
  const M = num.length;
  const N = den.length;
  if (Math.abs(den[0]) < 1e-15) throw new Error('VRFT op: den[0] must be non-zero');
  const out = new Array(signal.length).fill(0);
  for (let k = 0; k < signal.length; k++) {
    let acc = 0;
    for (let j = 0; j < M; j++) {
      if (k - j >= 0) acc += num[j] * signal[k - j];
    }
    for (let j = 1; j < N; j++) {
      if (k - j >= 0) acc -= den[j] * out[k - j];
    }
    out[k] = acc / den[0];
  }
  return out;
}

/**
 * Compute the virtual reference r̃ = M^{-1} y_d.
 * Inputs: reference model M as { num, den } discrete TF (descending z form).
 *
 * Inversion: r̃[k] = ( y[k] − (M_num[1] y[k-1] + …) ) − … in the recursion
 * implemented by `applyDiscreteOperator` with swapped roles.
 */
export function virtualReference(M, yd) {
  // r̃ such that M(z) r̃ = y_d.
  // M(z) is given in descending-z form (num[0] = coefficient of z^0, etc.).
  // When M has a pure delay (leading zeros in num), M^{-1} is non-causal.
  // We resolve this by shifting the recursion: strip leading zeros from M.num
  // to obtain a strictly causal kernel and then place r̃ in advance.
  let d = 0;
  while (d < M.num.length && Math.abs(M.num[d]) < 1e-15) d++;
  if (d === M.num.length) throw new Error('VRFT: M numerator is identically zero');
  const stripped = M.num.slice(d);
  // r̃(k) computed such that M(z) r̃(k+d) = y_d(k); we run the recursion as
  // if the data were "shifted forward" by d. Output r̃ has the same length
  // as y_d with leading d samples set to zero.
  const inverted = applyDiscreteOperator(M.den, stripped, yd);
  const out = new Array(yd.length).fill(0);
  for (let k = 0; k < yd.length - d; k++) out[k] = inverted[k + d];
  return out;
}

/**
 * VRFT identification: fit controller parameters θ such that
 *   u_d ≈ Σ_i θ_i (β_i(z) ẽ)
 * where ẽ = r̃ − y_d.
 *
 * basis: array of discrete operators [{ num, den }, …].
 */
export function vrft(M, ud, yd, basis, options = {}) {
  if (ud.length !== yd.length) throw new Error('VRFT: u_d, y_d length mismatch');
  if (!Array.isArray(basis) || basis.length === 0) throw new Error('VRFT: basis array required');
  const T = ud.length;

  const rtilde = virtualReference(M, yd);
  const etilde = new Array(T);
  for (let k = 0; k < T; k++) etilde[k] = rtilde[k] - yd[k];

  // Optional pre-filter L(z): default to (1 − M) by Bazanella heuristic.
  let filt;
  if (options.filterDisabled) {
    filt = etilde.slice();
  } else {
    const Lnum = options.filterNum ?? subtractPoly([1], M.num);
    const Lden = options.filterDen ?? M.den;
    filt = applyDiscreteOperator(Lnum, Lden, etilde);
  }

  // Build regression matrix Φ where Φ[k][i] = β_i(z) filt[k]
  const Phi = matCreate(T, basis.length, 0);
  for (let i = 0; i < basis.length; i++) {
    const beta = applyDiscreteOperator(basis[i].num, basis[i].den, filt);
    for (let k = 0; k < T; k++) Phi[k][i] = beta[k];
  }
  let target;
  if (options.filterDisabled) {
    target = ud.slice();
  } else {
    const Lnum = options.filterNum ?? subtractPoly([1], M.num);
    const Lden = options.filterDen ?? M.den;
    target = applyDiscreteOperator(Lnum, Lden, ud);
  }

  // Normal equations: (Φ^T Φ) θ = Φ^T target
  const PhiT = matTranspose(Phi);
  const A = matMul(PhiT, Phi);
  const b = new Array(basis.length).fill(0);
  for (let i = 0; i < basis.length; i++) {
    for (let k = 0; k < T; k++) b[i] += PhiT[i][k] * target[k];
  }
  const theta = matSolve(A, b);
  return { theta, virtualReference: rtilde, virtualError: etilde };
}

function subtractPoly(a, b) {
  const N = Math.max(a.length, b.length);
  const out = new Array(N).fill(0);
  for (let i = 0; i < N; i++) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}
