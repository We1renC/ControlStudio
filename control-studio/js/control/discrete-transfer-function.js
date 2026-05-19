/**
 * discrete-transfer-function.js — SISO discrete transfer function in z^-1 form.
 *
 * G(z) = (b0 + b1 z^-1 + ... + bm z^-m) / (1 + a1 z^-1 + ... + an z^-n)
 */
import { Complex } from '../math/complex.js';
import { polymul, polyadd, polyroots, trimPoly } from '../math/polynomial.js';

export class DiscreteTransferFunction {
  constructor(num, den, sampleTime = 1) {
    if (!Array.isArray(num) || num.length === 0) num = [1];
    if (!Array.isArray(den) || den.length === 0) den = [1];
    this.num = num.map(Number);
    this.den = trimPoly(den.map(Number));
    this.sampleTime = Number(sampleTime);
    if (!this.num.every(Number.isFinite) || !this.den.every(Number.isFinite)) {
      throw new Error('Discrete transfer function coefficients must be finite numbers');
    }
    if (this.den.length === 1 && Math.abs(this.den[0]) < 1e-15) {
      throw new Error('Discrete denominator must not be the zero polynomial');
    }
    if (!Number.isFinite(this.sampleTime) || this.sampleTime <= 0) {
      throw new Error('Sample time must be greater than 0');
    }
    const lead = this.den[0];
    if (!Number.isFinite(lead) || Math.abs(lead) < 1e-15) {
      throw new Error('Discrete denominator leading coefficient must be non-zero');
    }
    if (lead !== 1) {
      this.num = this.num.map((value) => value / lead);
      this.den = this.den.map((value) => value / lead);
    }
  }

  get order() { return this.den.length - 1; }

  poles() {
    return polyroots(this.den);
  }

  /**
   * Zeros of the discrete TF — roots of the numerator polynomial only.
   * (Previously padded to match den length, which introduced spurious z=0 roots.)
   */
  zeros() {
    return polyroots(this.num);
  }

  dcGain() {
    const denSum = this.den.reduce((sum, value) => sum + value, 0);
    if (Math.abs(denSum) < 1e-15) return Infinity;
    return this.num.reduce((sum, value) => sum + value, 0) / denSum;
  }

  isStable() {
    return this.poles().every((pole) => Math.hypot(pole.re, pole.im) < 1 - 1e-10);
  }

  /**
   * Evaluate G(z) at a complex value z.
   * @param {Complex} z
   * @returns {Complex}
   */
  evalAt(z) {
    // G(z) = Σ b_k z^{-k} / Σ a_k z^{-k}
    // Use z^{-1} = 1/z and accumulate using mul(number) — Complex._ensure accepts numbers.
    const zInv = new Complex(1, 0).div(z);
    let numVal = new Complex(0, 0);
    let denVal = new Complex(0, 0);
    let zPow = new Complex(1, 0); // z^{-k}, starts at k=0 → 1
    const len = Math.max(this.num.length, this.den.length);
    for (let k = 0; k < len; k++) {
      if (k < this.num.length) numVal = numVal.add(zPow.mul(this.num[k]));
      if (k < this.den.length) denVal = denVal.add(zPow.mul(this.den[k]));
      zPow = zPow.mul(zInv);
    }
    return numVal.div(denVal);
  }

  /**
   * Series connection: G1(z) * G2(z).
   * Coefficients in z^{-k} form: convolution = polynomial multiplication.
   */
  series(other) {
    if (Math.abs(this.sampleTime - other.sampleTime) > 1e-12) {
      throw new Error('Sample times must match for discrete TF series connection');
    }
    return new DiscreteTransferFunction(
      polymul(this.num, other.num),
      polymul(this.den, other.den),
      this.sampleTime
    );
  }

  /**
   * Parallel connection: G1(z) + G2(z) = (N1*D2 + N2*D1) / (D1*D2).
   */
  parallel(other) {
    if (Math.abs(this.sampleTime - other.sampleTime) > 1e-12) {
      throw new Error('Sample times must match for discrete TF parallel connection');
    }
    const num = polyadd(
      polymul(this.num, other.den),
      polymul(other.num, this.den)
    );
    const den = polymul(this.den, other.den);
    return new DiscreteTransferFunction(num, den, this.sampleTime);
  }

  /**
   * Negative unity feedback: G/(1+G*H), H defaults to 1.
   * CL = G*Hd / (Gd*Hd + Gn*Hn)
   */
  feedback(H = null) {
    const Hnum = H ? H.num : [1];
    const Hden = H ? H.den : [1];
    const clNum = polymul(this.num, Hden);
    const clDen = polyadd(
      polymul(this.den, Hden),
      polymul(this.num, Hnum)
    );
    return new DiscreteTransferFunction(clNum, clDen, this.sampleTime);
  }

  /** LaTeX representation (z^{-k} form) */
  toLatex() {
    const numStr = dtfPolyToLatex(this.num);
    const denStr = dtfPolyToLatex(this.den);
    return `\\frac{${numStr}}{${denStr}}`;
  }

  toString() {
    return `(${delayPolyToString(this.num)}) / (${delayPolyToString(this.den)})`;
  }
}

function fmtCoeff(c) {
  const abs = Math.abs(c);
  if (Number.isInteger(c)) return c.toString();
  if (abs > 0 && abs < 0.001) return parseFloat(c.toPrecision(4)).toString();
  return parseFloat(c.toFixed(4)).toString();
}

function dtfPolyToLatex(coeffs) {
  const terms = [];
  coeffs.forEach((c, k) => {
    if (Math.abs(c) < 1e-15) return;
    let body;
    if (k === 0) body = fmtCoeff(c);
    else if (k === 1) body = (Math.abs(c - 1) < 1e-12) ? 'z^{-1}' : (Math.abs(c + 1) < 1e-12) ? '-z^{-1}' : `${fmtCoeff(c)}z^{-1}`;
    else body = (Math.abs(c - 1) < 1e-12) ? `z^{-${k}}` : (Math.abs(c + 1) < 1e-12) ? `-z^{-${k}}` : `${fmtCoeff(c)}z^{-${k}}`;
    if (terms.length > 0 && c > 0) body = '+' + body;
    terms.push(body);
  });
  return terms.length ? terms.join('') : '0';
}

function delayPolyToString(coeffs) {
  const terms = [];
  coeffs.forEach((coeff, idx) => {
    if (Math.abs(coeff) < 1e-15) return;
    const absCoeff = Math.abs(coeff);
    const coeffText = Number.isInteger(absCoeff) ? String(absCoeff) : parseFloat(absCoeff.toFixed(4)).toString();
    const body = idx === 0 ? coeffText : `${coeffText}z^-${idx}`;
    if (terms.length === 0) terms.push(coeff < 0 ? `-${body}` : body);
    else terms.push(`${coeff < 0 ? '-' : '+'} ${body}`);
  });
  return terms.length ? terms.join(' ') : '0';
}
