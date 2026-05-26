/**
 * lie_derivative.js - numerical Lie derivative helpers.
 */

export function numericalGradient(fn, x, h = 1e-5) {
  if (!Array.isArray(x) || x.length === 0) throw new Error('x must be a non-empty vector');
  if (!(h > 0)) throw new Error('finite-difference step must be positive');
  return x.map((_, i) => {
    const xp = x.slice();
    const xm = x.slice();
    xp[i] += h;
    xm[i] -= h;
    return (fn(xp) - fn(xm)) / (2 * h);
  });
}

export function dot(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    throw new Error('dot arguments must be same-length vectors');
  }
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

export function lieDerivative(scalarFn, vectorField, opts = {}) {
  const h = opts.h ?? 1e-5;
  return (x) => dot(numericalGradient(scalarFn, x, h), vectorField(x));
}

export function iteratedLieDerivative(scalarFn, vectorField, order, opts = {}) {
  if (!Number.isInteger(order) || order < 0) throw new Error('order must be a non-negative integer');
  let out = scalarFn;
  for (let i = 0; i < order; i++) out = lieDerivative(out, vectorField, opts);
  return out;
}

export default {
  numericalGradient,
  dot,
  lieDerivative,
  iteratedLieDerivative,
};
