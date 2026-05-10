/**
 * zpk.js — Zero-Pole-Gain model to Transfer Function conversion
 */
import { TransferFunction } from './transfer-function.js';
import { polymul, trimPoly } from '../math/polynomial.js';

/**
 * Parse a complex root string like "-1", "0.5", "-1+2j", "3j".
 * Returns { re, im }.
 */
export function parseComplexRoot(str) {
  const s = str.replace(/\s/g, '');
  if (!s) return null;

  // Pure imaginary: "3j", "-2j", "j", "-j"
  const pureIm = s.match(/^([+-]?\d*\.?\d*)j$/);
  if (pureIm) {
    const v = pureIm[1];
    const im = v === '' || v === '+' ? 1 : v === '-' ? -1 : Number(v);
    return { re: 0, im };
  }

  // Complex: "-1+2j", "3-4j"
  const cplx = s.match(/^([+-]?\d*\.?\d+)([+-]\d*\.?\d*)j$/);
  if (cplx) {
    const re = Number(cplx[1]);
    const v = cplx[2];
    const im = v === '+' ? 1 : v === '-' ? -1 : Number(v);
    return { re, im };
  }

  // Real number
  const n = Number(s);
  if (Number.isFinite(n)) return { re: n, im: 0 };

  return null;
}

/**
 * Parse roots string: comma-separated list of real or complex roots.
 * Complex conjugate pairs should only include one root — the pair is auto-generated.
 * E.g. "-1, -2+3j"
 */
export function parseRootsString(str) {
  if (!str || !str.trim()) return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean).map(parseComplexRoot).filter(Boolean);
}

/**
 * Build polynomial [high → low] from roots.
 * Each real root r produces factor [1, -r].
 * Each complex root a+bj with b≠0 produces conjugate pair factor [1, -2a, a²+b²].
 */
function polyFromRoots(roots) {
  let poly = [1];
  for (const root of roots) {
    if (Math.abs(root.im) < 1e-15) {
      // Real root: (s - r)
      poly = polymul(poly, [1, -root.re]);
    } else {
      // Complex conjugate pair: (s - (a+bj))(s - (a-bj)) = s² - 2a·s + (a²+b²)
      poly = polymul(poly, [1, -2 * root.re, root.re * root.re + root.im * root.im]);
    }
  }
  return trimPoly(poly);
}

/**
 * Convert a Zero-Pole-Gain representation to a TransferFunction.
 * @param {Array<{re, im}>} zeros - System zeros
 * @param {Array<{re, im}>} poles - System poles
 * @param {number} gain - Static gain
 * @returns {TransferFunction}
 */
export function zpkToTransferFunction(zeros, poles, gain) {
  const num = polyFromRoots(zeros).map((c) => c * gain);
  const den = polyFromRoots(poles);
  return new TransferFunction(num, den);
}
