/**
 * transfer-function.js — Transfer function model G(s) = num(s)/den(s)
 */
import { Complex, polyval } from '../math/complex.js';
import { polymul, polyadd, polydiv, polyroots, trimPoly, polyscale, rootsToRealPoly } from '../math/polynomial.js';

export class TransferFunction {
  /**
   * @param {number[]} num - Numerator coefficients [high→low]
   * @param {number[]} den - Denominator coefficients [high→low]
   */
  constructor(num, den) {
    if (!num || !Array.isArray(num)) num = [1];
    if (!den || !Array.isArray(den)) den = [1];
    this.num = trimPoly(num.slice());
    this.den = trimPoly(den.slice());
    if (this.den.length === 1 && Math.abs(this.den[0]) < 1e-15) {
      throw new Error('TransferFunction denominator must not be the zero polynomial');
    }
    if (!this.num.every(Number.isFinite) || !this.den.every(Number.isFinite)) {
      throw new Error('TransferFunction coefficients must be finite numbers');
    }
    // Normalize so leading den coeff = 1
    const lead = this.den[0];
    if (lead !== 0 && lead !== 1) {
      this.num = this.num.map(c => c / lead);
      this.den = this.den.map(c => c / lead);
    }
  }

  get order() { return this.den.length - 1; }
  get numOrder() { return this.num.length - 1; }

  /** Evaluate G(s) at a complex value s */
  evalAt(s) {
    return polyval(this.num, s).div(polyval(this.den, s));
  }

  /** Poles of the system */
  poles() { return polyroots(this.den); }

  /** Zeros of the system */
  zeros() { return polyroots(this.num); }

  /** DC gain G(0) */
  dcGain() {
    const d = this.den[this.den.length - 1];
    const n = this.num[this.num.length - 1];
    if (Math.abs(d) < 1e-15) return Infinity;
    return n / d;
  }

  /**
   * Check stability: all poles have strictly negative real part.
   * Uses p.re < 0 so marginally-stable (jω-axis) poles are flagged correctly.
   */
  isStable() {
    return this.poles().every(p => p.re < 0);
  }

  /** Series connection: this * other */
  series(other) {
    return new TransferFunction(
      polymul(this.num, other.num),
      polymul(this.den, other.den)
    );
  }

  /** Parallel connection: this + other */
  parallel(other) {
    const num = polyadd(
      polymul(this.num, other.den),
      polymul(other.num, this.den)
    );
    const den = polymul(this.den, other.den);
    return new TransferFunction(num, den);
  }

  /** Subtraction: this - other */
  subtract(other) {
    const num = polyadd(
      polymul(this.num, other.den),
      polyscale(polymul(other.num, this.den), -1)
    );
    const den = polymul(this.den, other.den);
    return new TransferFunction(num, den);
  }

  /** Negate: -this */
  negate() {
    return new TransferFunction(polyscale(this.num, -1), this.den.slice());
  }

  /** Inverse: 1/this = den/num */
  inverse() {
    return new TransferFunction(this.den.slice(), this.num.slice());
  }

  /** Division: this / other = this * (1/other) */
  divide(other) {
    return this.series(other.inverse());
  }

  /** Negative unity feedback: G/(1+G*H), H defaults to 1 */
  feedback(H = null) {
    const Hnum = H ? H.num : [1];
    const Hden = H ? H.den : [1];
    const clNum = polymul(this.num, Hden);
    const clDen = polyadd(
      polymul(this.den, Hden),
      polymul(this.num, Hnum)
    );
    return new TransferFunction(clNum, clDen);
  }

  /** Scale by constant */
  scale(k) {
    return new TransferFunction(polyscale(this.num, k), this.den.slice());
  }

  /**
   * Pole-zero cancellation (minimal realization).
   * Cancels nearby pole-zero pairs within `tol` in complex distance.
   * @param {number} tol - Cancellation tolerance (default 1e-6)
   * @returns {TransferFunction}
   */
  minreal(tol = 1e-6) {
    const poles = this.poles();
    const zeros = this.zeros();
    const usedZ = new Array(zeros.length).fill(false);
    const remainingPoles = [];

    for (const pole of poles) {
      let cancelled = false;
      for (let zi = 0; zi < zeros.length; zi++) {
        if (usedZ[zi]) continue;
        const dist = Math.hypot(zeros[zi].re - pole.re, zeros[zi].im - pole.im);
        if (dist < tol) {
          usedZ[zi] = true;
          cancelled = true;
          break;
        }
      }
      if (!cancelled) remainingPoles.push(pole);
    }
    const remainingZeros = zeros.filter((_, i) => !usedZ[i]);

    // Rebuild TF preserving DC gain (or high-freq gain for improper)
    const newNum = remainingZeros.length ? rootsToRealPoly(remainingZeros) : [1];
    const newDen = remainingPoles.length ? rootsToRealPoly(remainingPoles) : [1];

    // Match DC gain of original using G(0) = N(0)/D(0) = last coefficient ratio
    const origDC = this.dcGain();
    if (Number.isFinite(origDC) && Math.abs(origDC) > 1e-15) {
      const N0 = newNum[newNum.length - 1];
      const D0 = newDen[newDen.length - 1];
      const newDC = Math.abs(D0) > 1e-15 ? N0 / D0 : Infinity;
      if (Number.isFinite(newDC) && Math.abs(newDC) > 1e-15) {
        return new TransferFunction(polyscale(newNum, origDC / newDC), newDen);
      }
    }
    // Fallback: scale by ratio of leading coefficients
    const kOrig = this.num[0] / this.den[0];
    const kNew  = newNum[0] / newDen[0];
    return new TransferFunction(polyscale(newNum, kOrig / kNew), newDen);
  }

  /**
   * Convert to Zero-Pole-Gain form.
   * @returns {{ zeros: Complex[], poles: Complex[], gain: number }}
   */
  toZPK() {
    const zs = this.zeros();
    const ps = this.poles();
    // Gain = leading num coeff / leading den coeff (both monic after normalization)
    const gain = this.num[0]; // den is monic (den[0]=1 after normalization)
    return { zeros: zs, poles: ps, gain };
  }

  /** LaTeX representation */
  toLatex() {
    const numStr = polyToLatex(this.num);
    const denStr = polyToLatex(this.den);
    return `\\frac{${numStr}}{${denStr}}`;
  }

  /**
   * ZPK LaTeX representation: K · ∏(s−zᵢ) / ∏(s−pⱼ)
   * @returns {string}
   */
  toZPKLatex() {
    const { zeros, poles, gain } = this.toZPK();
    const fmt = (c, unit = 's') => {
      const re = Math.abs(c.re) < 1e-10 ? 0 : c.re;
      const im = Math.abs(c.im) < 1e-10 ? 0 : c.im;
      if (Math.abs(im) < 1e-10) {
        // Real root
        const shift = -re;
        if (Math.abs(shift) < 1e-10) return `${unit}`;
        return shift > 0 ? `(${unit}+${formatCoeff(shift)})` : `(${unit}${formatCoeff(shift)})`;
      }
      // Complex pair
      const a = -2 * re, b = re * re + im * im;
      let q = `${unit}^{2}`;
      if (Math.abs(a) > 1e-10) q += (a > 0 ? `+${formatCoeff(a)}` : formatCoeff(a)) + `${unit}`;
      if (Math.abs(b) > 1e-10) q += (b > 0 ? `+${formatCoeff(b)}` : formatCoeff(b));
      return `(${q})`;
    };
    // Deduplicate conjugate pairs in zeros/poles
    const usedZ = new Array(zeros.length).fill(false);
    const usedP = new Array(poles.length).fill(false);
    const zTerms = [], pTerms = [];
    for (let i = 0; i < zeros.length; i++) {
      if (usedZ[i]) continue;
      if (Math.abs(zeros[i].im) > 1e-10) {
        for (let j = i + 1; j < zeros.length; j++) {
          if (!usedZ[j] && Math.abs(zeros[j].re - zeros[i].re) < 1e-8
              && Math.abs(zeros[j].im + zeros[i].im) < 1e-8) { usedZ[j] = true; break; }
        }
      }
      usedZ[i] = true;
      zTerms.push(fmt(zeros[i]));
    }
    for (let i = 0; i < poles.length; i++) {
      if (usedP[i]) continue;
      if (Math.abs(poles[i].im) > 1e-10) {
        for (let j = i + 1; j < poles.length; j++) {
          if (!usedP[j] && Math.abs(poles[j].re - poles[i].re) < 1e-8
              && Math.abs(poles[j].im + poles[i].im) < 1e-8) { usedP[j] = true; break; }
        }
      }
      usedP[i] = true;
      pTerms.push(fmt(poles[i]));
    }
    const gainStr = formatCoeff(gain);
    const numPart = zTerms.length ? `${gainStr}\\cdot${zTerms.join('')}` : gainStr;
    const denPart = pTerms.length ? pTerms.join('') : '1';
    return `\\frac{${numPart}}{${denPart}}`;
  }

  /** Plain text representation */
  toString() {
    return `(${polyToString(this.num)}) / (${polyToString(this.den)})`;
  }
}

function polyToLatex(coeffs) {
  const deg = coeffs.length - 1;
  if (deg === 0) return formatCoeff(coeffs[0]);
  const terms = [];
  for (let i = 0; i <= deg; i++) {
    const c = coeffs[i];
    const power = deg - i;
    if (Math.abs(c) < 1e-15) continue;
    let term = '';
    if (power === 0) {
      term = formatCoeff(c);
    } else if (power === 1) {
      term = c === 1 ? 's' : c === -1 ? '-s' : `${formatCoeff(c)}s`;
    } else {
      term = c === 1 ? `s^{${power}}` : c === -1 ? `-s^{${power}}` : `${formatCoeff(c)}s^{${power}}`;
    }
    if (terms.length > 0 && c > 0) term = '+' + term;
    terms.push(term);
  }
  return terms.length ? terms.join('') : '0';
}

function polyToString(coeffs) {
  const deg = coeffs.length - 1;
  if (deg === 0) return formatCoeff(coeffs[0]);
  const terms = [];
  for (let i = 0; i <= deg; i++) {
    const c = coeffs[i];
    const power = deg - i;
    if (Math.abs(c) < 1e-15) continue;
    let term = '';
    if (power === 0) term = formatCoeff(c);
    else if (power === 1) term = c === 1 ? 's' : c === -1 ? '-s' : `${formatCoeff(c)}s`;
    else term = c === 1 ? `s^${power}` : c === -1 ? `-s^${power}` : `${formatCoeff(c)}s^${power}`;
    if (terms.length > 0 && c > 0) term = '+' + term;
    terms.push(term);
  }
  return terms.length ? terms.join(' ') : '0';
}

/**
 * Format a coefficient for display.
 * Integers shown exact; small values use toPrecision(4) to avoid rounding to '0'.
 */
function formatCoeff(c) {
  if (Number.isInteger(c)) return c.toString();
  const abs = Math.abs(c);
  if (abs > 0 && abs < 0.001) {
    // Use significant figures for very small values
    return parseFloat(c.toPrecision(4)).toString();
  }
  return parseFloat(c.toFixed(4)).toString();
}
