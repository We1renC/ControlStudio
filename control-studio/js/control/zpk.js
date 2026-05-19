/**
 * zpk.js — Zero-Pole-Gain (ZPK) model
 *
 * Provides:
 *  - parseComplexRoot / parseRootsString  — input parsers
 *  - zpkToTransferFunction                — ZPK → TF (one-way)
 *  - tfToZPK                              — TF → ZPK structured data
 *  - ZPK class                            — ZPK object with arithmetic + display
 */
import { TransferFunction } from './transfer-function.js';
import { polymul, polyscale, trimPoly } from '../math/polynomial.js';
import { Complex } from '../math/complex.js';

// ---------------------------------------------------------------------------
// Root parsers
// ---------------------------------------------------------------------------

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
 * Complex conjugate pairs: enter ONLY ONE root of the pair (e.g. "-1+2j").
 * The conjugate is automatically generated.
 * If both z and z* are entered, the duplicate is detected and silently removed.
 */
export function parseRootsString(str) {
  if (!str || !str.trim()) return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean).map(parseComplexRoot).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Internal: build real polynomial from roots.
// Deduplicates conjugate pairs — if both z and z* appear in the list,
// the conjugate is counted only once (not twice).
// ---------------------------------------------------------------------------
function polyFromRoots(roots) {
  let poly = [1];
  const used = new Array(roots.length).fill(false);

  for (let i = 0; i < roots.length; i++) {
    if (used[i]) continue;
    const root = roots[i];
    used[i] = true;

    if (Math.abs(root.im) < 1e-9) {
      // Real root: factor (s − r)
      poly = polymul(poly, [1, -root.re]);
    } else {
      // Complex root: check if its conjugate already appears elsewhere in the list
      for (let j = i + 1; j < roots.length; j++) {
        if (!used[j] &&
            Math.abs(roots[j].re - root.re) < 1e-9 &&
            Math.abs(roots[j].im + root.im) < 1e-9) {
          used[j] = true; // mark conjugate as consumed
          break;
        }
      }
      // Always create the quadratic factor for the conjugate pair
      // (s − (a+bj))(s − (a−bj)) = s² − 2a·s + (a²+b²)
      poly = polymul(poly, [1, -2 * root.re, root.re * root.re + root.im * root.im]);
    }
  }
  return trimPoly(poly);
}

// ---------------------------------------------------------------------------
// zpkToTransferFunction — ZPK arrays → TransferFunction
// ---------------------------------------------------------------------------
export function zpkToTransferFunction(zeros, poles, gain) {
  const num = polyFromRoots(zeros).map((c) => c * gain);
  const den = polyFromRoots(poles);
  return new TransferFunction(num, den);
}

// ---------------------------------------------------------------------------
// tfToZPK — Extract ZPK data from a TransferFunction
// Returns { zeros: Complex[], poles: Complex[], gain: number }
// ---------------------------------------------------------------------------
export function tfToZPK(tf) {
  return tf.toZPK();
}

// ---------------------------------------------------------------------------
// ZPK class — factored-form transfer function with arithmetic
// ---------------------------------------------------------------------------
export class ZPK {
  /**
   * @param {Array<{re,im}|Complex>} zeros
   * @param {Array<{re,im}|Complex>} poles
   * @param {number} gain
   */
  constructor(zeros, poles, gain) {
    this.zeros = zeros.map(r => r instanceof Complex ? r : new Complex(r.re ?? 0, r.im ?? 0));
    this.poles = poles.map(r => r instanceof Complex ? r : new Complex(r.re ?? 0, r.im ?? 0));
    this.gain  = Number(gain);
    if (!Number.isFinite(this.gain)) throw new Error('ZPK gain must be finite');
  }

  /** Convert to TransferFunction */
  toTransferFunction() {
    return zpkToTransferFunction(this.zeros, this.poles, this.gain);
  }

  /** Evaluate G(s) at complex s — exact factored-form evaluation */
  evalAt(s) {
    const sc = s instanceof Complex ? s : new Complex(s, 0);
    let num = new Complex(this.gain, 0);
    for (const z of this.zeros) num = num.mul(sc.sub(z));
    let den = new Complex(1, 0);
    for (const p of this.poles) den = den.mul(sc.sub(p));
    return num.div(den);
  }

  /** DC gain G(0) */
  dcGain() {
    const v = this.evalAt(new Complex(0, 0));
    return v.re; // imaginary part should be 0 for a real system at s=0
  }

  /** Series: G1 * G2 = ZPK(z1∪z2, p1∪p2, k1·k2) */
  series(other) {
    return new ZPK(
      [...this.zeros, ...other.zeros],
      [...this.poles, ...other.poles],
      this.gain * other.gain
    );
  }

  /** Parallel: G1 + G2 (convert via TF, then back) */
  parallel(other) {
    const sum = this.toTransferFunction().parallel(other.toTransferFunction());
    return ZPK.fromTF(sum);
  }

  /** Scale gain */
  scale(k) {
    return new ZPK(this.zeros, this.poles, this.gain * k);
  }

  /** Create ZPK from a TransferFunction */
  static fromTF(tf) {
    const { zeros, poles, gain } = tf.toZPK();
    return new ZPK(zeros, poles, gain);
  }

  /** LaTeX: K·∏(s−zᵢ)/∏(s−pⱼ) */
  toLatex() {
    return this.toTransferFunction().toZPKLatex();
  }

  toString() {
    const fmtRoot = r => {
      if (Math.abs(r.im) < 1e-9) return r.re.toFixed(4);
      return `${r.re.toFixed(3)}${r.im >= 0 ? '+' : ''}${r.im.toFixed(3)}j`;
    };
    const z = this.zeros.map(fmtRoot).join(', ') || '—';
    const p = this.poles.map(fmtRoot).join(', ') || '—';
    return `K=${this.gain.toFixed(4)}\nZeros: ${z}\nPoles: ${p}`;
  }
}
