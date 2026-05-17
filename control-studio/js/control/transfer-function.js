/**
 * transfer-function.js — Transfer function model G(s) = num(s)/den(s)
 */
import { Complex, polyval } from '../math/complex.js';
import { polymul, polyadd, polyroots, trimPoly, polyscale } from '../math/polynomial.js';

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

  /** Check stability: all poles have negative real part */
  isStable() {
    return this.poles().every(p => p.re < -1e-10);
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

  /** Negative unity feedback: G/(1+G*H), H defaults to 1 */
  feedback(H = null) {
    const Hnum = H ? H.num : [1];
    const Hden = H ? H.den : [1];
    // CL = G / (1 + G*H)
    // = (Gn*Hd) / (Gd*Hd + Gn*Hn)
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

  /** LaTeX representation */
  toLatex() {
    const numStr = polyToLatex(this.num);
    const denStr = polyToLatex(this.den);
    return `\\frac{${numStr}}{${denStr}}`;
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

function formatCoeff(c) {
  if (Number.isInteger(c)) return c.toString();
  return parseFloat(c.toFixed(4)).toString();
}
