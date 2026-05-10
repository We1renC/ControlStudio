/**
 * complex.js — Complex number arithmetic for control system computations
 * Provides a lightweight Complex class with all operations needed for
 * transfer function evaluation, root finding, and frequency response.
 */

export class Complex {
  constructor(re = 0, im = 0) {
    this.re = re;
    this.im = im;
  }

  // --- Factory methods ---
  static fromPolar(mag, angle) {
    return new Complex(mag * Math.cos(angle), mag * Math.sin(angle));
  }

  static fromReal(x) {
    return new Complex(x, 0);
  }

  static j() {
    return new Complex(0, 1);
  }

  // --- Basic properties ---
  get magnitude() {
    return Math.sqrt(this.re * this.re + this.im * this.im);
  }

  get magnitudeSquared() {
    return this.re * this.re + this.im * this.im;
  }

  get angle() {
    return Math.atan2(this.im, this.re);
  }

  get angleDeg() {
    return this.angle * (180 / Math.PI);
  }

  get conjugate() {
    return new Complex(this.re, -this.im);
  }

  get isReal() {
    return Math.abs(this.im) < 1e-12;
  }

  get isImaginary() {
    return Math.abs(this.re) < 1e-12 && Math.abs(this.im) > 1e-12;
  }

  // --- Arithmetic ---
  add(other) {
    const c = Complex._ensure(other);
    return new Complex(this.re + c.re, this.im + c.im);
  }

  sub(other) {
    const c = Complex._ensure(other);
    return new Complex(this.re - c.re, this.im - c.im);
  }

  mul(other) {
    const c = Complex._ensure(other);
    return new Complex(
      this.re * c.re - this.im * c.im,
      this.re * c.im + this.im * c.re
    );
  }

  div(other) {
    const c = Complex._ensure(other);
    const denom = c.re * c.re + c.im * c.im;
    if (denom === 0) throw new Error('Division by zero');
    return new Complex(
      (this.re * c.re + this.im * c.im) / denom,
      (this.im * c.re - this.re * c.im) / denom
    );
  }

  neg() {
    return new Complex(-this.re, -this.im);
  }

  pow(n) {
    if (n === 0) return new Complex(1, 0);
    const mag = Math.pow(this.magnitude, n);
    const ang = this.angle * n;
    return Complex.fromPolar(mag, ang);
  }

  sqrt() {
    const mag = Math.sqrt(this.magnitude);
    const ang = this.angle / 2;
    return Complex.fromPolar(mag, ang);
  }

  exp() {
    const expRe = Math.exp(this.re);
    return new Complex(expRe * Math.cos(this.im), expRe * Math.sin(this.im));
  }

  log() {
    return new Complex(Math.log(this.magnitude), this.angle);
  }

  // --- Comparison ---
  equals(other, tol = 1e-10) {
    const c = Complex._ensure(other);
    return Math.abs(this.re - c.re) < tol && Math.abs(this.im - c.im) < tol;
  }

  // --- Formatting ---
  toString(precision = 4) {
    const re = parseFloat(this.re.toFixed(precision));
    const im = parseFloat(this.im.toFixed(precision));
    if (Math.abs(im) < 1e-12) return `${re}`;
    if (Math.abs(re) < 1e-12) return `${im}j`;
    const sign = im >= 0 ? '+' : '-';
    return `${re}${sign}${Math.abs(im)}j`;
  }

  clone() {
    return new Complex(this.re, this.im);
  }

  // --- Internal helper ---
  static _ensure(val) {
    if (val instanceof Complex) return val;
    if (typeof val === 'number') return new Complex(val, 0);
    throw new TypeError(`Cannot convert ${typeof val} to Complex`);
  }

  // --- Utility: magnitude in dB ---
  get magnitudeDB() {
    return 20 * Math.log10(Math.max(this.magnitude, 1e-30));
  }
}

/**
 * Evaluate a polynomial (coefficients high→low) at a complex value s.
 * poly = [a_n, a_{n-1}, ..., a_1, a_0]
 * result = a_n * s^n + a_{n-1} * s^{n-1} + ... + a_0
 */
export function polyval(coeffs, s) {
  const sc = Complex._ensure(s);
  let result = new Complex(0, 0);
  for (let i = 0; i < coeffs.length; i++) {
    result = result.mul(sc).add(Complex._ensure(coeffs[i]));
  }
  return result;
}
