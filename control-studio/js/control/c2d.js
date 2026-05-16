/**
 * c2d.js — Continuous-to-discrete transfer function conversion.
 * Supports Tustin (bilinear) for any-order TF, and ZOH for first-order TF.
 */
import { polymul, polyscale } from '../math/polynomial.js';
import { matCreate, matExp } from '../math/matrix.js';
import { stateSpaceToTransferFunction, tfToControllableCanonical } from './state-space.js';
import { DiscreteTransferFunction } from './discrete-transfer-function.js';

function validateTs(Ts) {
  if (!Number.isFinite(Ts) || Ts <= 0) throw new Error('Sample time must be a positive number');
}

/**
 * Substitute s = (2/Ts)*(z-1)/(z+1) into a polynomial given in high-degree-first form.
 * Returns the resulting polynomial in z (high-degree-first, degree n).
 */
function tustinPoly(coeffs, Ts) {
  const n = coeffs.length - 1;
  const K = 2 / Ts;
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
