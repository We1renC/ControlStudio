/**
 * discrete-transfer-function.js — SISO discrete transfer function in z^-1 form.
 *
 * G(z) = (b0 + b1 z^-1 + ... + bm z^-m) / (1 + a1 z^-1 + ... + an z^-n)
 */
import { polyroots, trimPoly } from '../math/polynomial.js';

export class DiscreteTransferFunction {
  constructor(num, den, sampleTime = 1) {
    if (!Array.isArray(num) || num.length === 0) num = [1];
    if (!Array.isArray(den) || den.length === 0) den = [1];
    this.num = trimPoly(num.map(Number));
    this.den = trimPoly(den.map(Number));
    this.sampleTime = Number(sampleTime);
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

  zeros() {
    const padded = this.num.length >= this.den.length
      ? this.num
      : [...this.num, ...new Array(this.den.length - this.num.length).fill(0)];
    return polyroots(padded);
  }

  dcGain() {
    const denSum = this.den.reduce((sum, value) => sum + value, 0);
    if (Math.abs(denSum) < 1e-15) return Infinity;
    return this.num.reduce((sum, value) => sum + value, 0) / denSum;
  }

  isStable() {
    return this.poles().every((pole) => Math.hypot(pole.re, pole.im) < 1 - 1e-10);
  }

  toString() {
    return `(${delayPolyToString(this.num)}) / (${delayPolyToString(this.den)})`;
  }
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
