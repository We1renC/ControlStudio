/**
 * c2d.js — Continuous-to-discrete transfer function conversion.
 * Methods: Tustin (bilinear), Tustin with prewarping, ZOH, Matched-Z.
 */
import { polymul, polyscale, rootsToRealPoly } from '../math/polynomial.js?v=p5';
import { matCreate, matExp } from '../math/matrix.js?v=p5';
import { stateSpaceToTransferFunction, tfToControllableCanonical } from './state-space.js?v=p5';
import { DiscreteTransferFunction } from './discrete-transfer-function.js';

function validateTs(Ts) {
  if (!Number.isFinite(Ts) || Ts <= 0) throw new Error('Sample time must be a positive number');
}

/**
 * Substitute s = (2/Ts)*(z-1)/(z+1) into a polynomial given in high-degree-first form.
 * Returns the resulting polynomial in z (high-degree-first, degree n).
 */
function tustinPoly(coeffs, Ts, K = null) {
  const n = coeffs.length - 1;
  if (K === null) K = 2 / Ts;
  const zm1 = [[1]];
  const zp1 = [[1]];
  for (let i = 1; i <= n; i++) {
    zm1.push(polymul(zm1[i - 1], [1, -1]));
    zp1.push(polymul(zp1[i - 1], [1, 1]));
  }
  const result = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) {
    const a = coeffs[n - j];
    if (Math.abs(a) < 1e-15) continue;
    const term = polyscale(polymul(zm1[j], zp1[n - j]), a * Math.pow(K, j));
    for (let i = 0; i < term.length; i++) result[i] += term[i];
  }
  return result;
}

/**
 * Tustin (bilinear) discretization: s = (2/Ts)*(z-1)/(z+1).
 * Preserves DC gain. Works for any proper continuous TF.
 *
 * @param {TransferFunction} sys - Continuous SISO TF (high-degree-first coeffs)
 * @param {number} Ts - Sample time (seconds)
 * @returns {DiscreteTransferFunction}
 */
export function c2dTustin(sys, Ts) {
  validateTs(Ts);
  const n = sys.den.length - 1;
  const m = sys.num.length - 1;
  if (m > n) throw new Error('System must be proper (numerator degree ≤ denominator degree)');
  const paddedNum = [...new Array(n - m).fill(0), ...sys.num];
  const denZ = tustinPoly(sys.den, Ts);
  const numZ = tustinPoly(paddedNum, Ts);
  const lead = denZ[0];
  return new DiscreteTransferFunction(numZ.map((c) => c / lead), denZ.map((c) => c / lead), Ts);
}

/**
 * Tustin (bilinear) with frequency prewarping at ω_prewarp.
 * The bilinear mapping `s = K_w * (z-1)/(z+1)` uses
 *   K_w = ω_prewarp / tan(ω_prewarp · Ts / 2)
 * instead of the standard K = 2/Ts, ensuring the continuous-time and
 * discrete-time frequency responses match exactly at ω_prewarp rad/s.
 *
 * @param {TransferFunction} sys
 * @param {number} Ts - sample time
 * @param {number} omegaPrewarp - desired exact-match frequency (rad/s)
 * @returns {DiscreteTransferFunction}
 */
export function c2dTustinPrewarp(sys, Ts, omegaPrewarp) {
  validateTs(Ts);
  if (!Number.isFinite(omegaPrewarp) || omegaPrewarp <= 0) {
    throw new Error('omegaPrewarp must be a positive finite number (rad/s)');
  }
  const halfPeriod = omegaPrewarp * Ts / 2;
  const tanHalf = Math.tan(halfPeriod);
  if (!Number.isFinite(tanHalf) || Math.abs(tanHalf) < 1e-12) {
    throw new Error('Prewarping: ω_prewarp·Ts/2 is too close to π/2; reduce Ts or ω_prewarp');
  }
  const K = omegaPrewarp / tanHalf;
  const n = sys.den.length - 1;
  const m = sys.num.length - 1;
  if (m > n) throw new Error('System must be proper (numerator degree ≤ denominator degree)');
  const paddedNum = [...new Array(n - m).fill(0), ...sys.num];
  const denZ = tustinPoly(sys.den, Ts, K);
  const numZ = tustinPoly(paddedNum, Ts, K);
  const lead = denZ[0];
  return new DiscreteTransferFunction(numZ.map((c) => c / lead), denZ.map((c) => c / lead), Ts);
}

/**
 * Matched-Z (pole-zero mapping) discretization.
 * Maps each continuous pole s_k → z_k = exp(s_k·Ts) and zero similarly.
 * Adds z=-1 zeros for excess poles (standard convention).
 * DC gain is matched to the continuous-time system.
 *
 * @param {TransferFunction} sys
 * @param {number} Ts
 * @returns {DiscreteTransferFunction}
 */
export function c2dMatchedZ(sys, Ts) {
  validateTs(Ts);
  const mapToZ = (s) => {
    const mag = Math.exp(s.re * Ts);
    return { re: mag * Math.cos(s.im * Ts), im: mag * Math.sin(s.im * Ts) };
  };

  const contPoles = sys.poles();
  const contZeros = sys.zeros();
  const discPoles = contPoles.map(mapToZ);
  const discZeros = contZeros.map(mapToZ);

  // Add z=-1 zeros for excess poles (preserves causality)
  const nExcess = contPoles.length - contZeros.length;
  for (let i = 0; i < nExcess; i++) discZeros.push({ re: -1, im: 0 });

  // Build numerator and denominator polynomials from discrete roots
  const numZ = rootsToRealPoly(discZeros);
  const denZ = rootsToRealPoly(discPoles);

  // Match DC gain: G_c(0) should equal G_d(1)
  // G_c(0) = sys.dcGain(); G_d(1) = sum(numZ) / sum(denZ)
  const dcCont = sys.dcGain();
  const sumNum = numZ.reduce((a, b) => a + b, 0);
  const sumDen = denZ.reduce((a, b) => a + b, 0);
  let gainFactor = 1;
  if (Number.isFinite(dcCont) && Math.abs(sumNum) > 1e-14 && Math.abs(sumDen) > 1e-14) {
    gainFactor = dcCont * sumDen / sumNum;
  }
  const scaledNum = numZ.map((c) => c * gainFactor);
  return new DiscreteTransferFunction(scaledNum, denZ, Ts);
}

/**
 * Zero-Order Hold discretization for first-order TF: G(s) = b0 / (a1*s + a0).
 * Exact step-response equivalence. Limited to order-1 denominators.
 *
 * @param {TransferFunction} sys - First-order continuous TF
 * @param {number} Ts - Sample time (seconds)
 * @returns {DiscreteTransferFunction}
 */
export function c2dZOH(sys, Ts) {
  validateTs(Ts);
  if (sys.num.length > sys.den.length) throw new Error('ZOH：分子次數不得超過分母次數');
  const n = sys.den.length - 1;
  if (n === 0) throw new Error('ZOH 需要至少一階系統');

  // Fast path for first-order: closed-form (also robust for pure integrators)
  if (n === 1) {
    const a1 = sys.den[0];
    const a0 = sys.den[1];
    const b0 = sys.num[sys.num.length - 1];
    if (Math.abs(a1) < 1e-12) throw new Error('ZOH：分母首項係數不可為 0');
    if (Math.abs(a0) < 1e-12) throw new Error('ZOH：純積分器請改用 Tustin');
    const zp = Math.exp((-Ts * a0) / a1);
    const gain = (b0 / a0) * (1 - zp);
    return new DiscreteTransferFunction([0, gain], [1, -zp], Ts);
  }

  // General N-th order: SS path with augmented matrix exponential
  //   [A_d  B_d]     ( [A  B]·Ts )
  //   [ 0    I ] = exp( [0  0]    )
  const { A, B, C, D } = tfToControllableCanonical(sys.num, sys.den);
  const aug = matCreate(n + 1, n + 1, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i][j] = A[i][j] * Ts;
    aug[i][n] = B[i][0] * Ts;
  }
  const expAug = matExp(aug);
  const Ad = matCreate(n, n);
  const Bd = matCreate(n, 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) Ad[i][j] = expAug[i][j];
    Bd[i][0] = expAug[i][n];
  }
  const tf = stateSpaceToTransferFunction(Ad, Bd, C, D);
  return tfToDtf(tf, Ts);
}

/**
 * Convert a polynomial-form TransferFunction to a DiscreteTransferFunction.
 * The high-degree-first coefficient array is identical to the z⁻¹ representation
 * after padding the numerator with leading zeros to match denominator length
 * and normalising the leading denominator coefficient to 1.
 */
function tfToDtf(tf, Ts) {
  const denArr = tf.den.map(Number);
  let numArr = tf.num.map(Number);
  const diff = denArr.length - numArr.length;
  if (diff > 0) numArr = [...new Array(diff).fill(0), ...numArr];
  return new DiscreteTransferFunction(numArr, denArr, Ts);
}
