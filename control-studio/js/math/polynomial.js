/**
 * polynomial.js — Polynomial operations for transfer function manipulation
 * Coefficients stored high-degree-first: [a_n, ..., a_1, a_0]
 */
import { Complex } from './complex.js';

export function polymul(a, b) {
  if (!a.length || !b.length) return [0];
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      result[i + j] += a[i] * b[j];
  return result;
}

export function polyadd(a, b) {
  const len = Math.max(a.length, b.length);
  const r = new Array(len).fill(0);
  for (let i = 0; i < a.length; i++) r[len - a.length + i] += a[i];
  for (let i = 0; i < b.length; i++) r[len - b.length + i] += b[i];
  return trimPoly(r);
}

export function polysub(a, b) {
  return polyadd(a, b.map(c => -c));
}

export function polyscale(poly, k) {
  return poly.map(c => c * k);
}

export function trimPoly(poly) {
  let s = 0;
  while (s < poly.length - 1 && Math.abs(poly[s]) < 1e-15) s++;
  return poly.slice(s);
}

export function polydegree(poly) {
  return trimPoly(poly).length - 1;
}

export function polyvalReal(coeffs, x) {
  let r = 0;
  for (const c of coeffs) r = r * x + c;
  return r;
}

/** Derivative of polynomial in high-degree-first form. */
export function polyderiv(coeffs) {
  const n = coeffs.length - 1;
  if (n <= 0) return [0];
  const result = new Array(n);
  for (let i = 0; i < n; i++) result[i] = coeffs[i] * (n - i);
  return result;
}

function rootParts(root) {
  if (root instanceof Complex) return { re: root.re, im: root.im };
  if (typeof root === 'number') return { re: root, im: 0 };
  if (root && typeof root === 'object') return { re: Number(root.re ?? 0), im: Number(root.im ?? 0) };
  return { re: Number(root), im: 0 };
}

/**
 * Convert roots to real polynomial coefficients.
 * Complex roots must form conjugate pairs. Pair matching uses a best-match
 * strategy with relative tolerance to handle numerical drift from root finders
 * (Durand-Kerner can drift ~1e-5 for ill-conditioned / repeated roots).
 */
export function rootsToRealPoly(roots) {
  if (!roots.length) return [1];
  let poly = [1];
  const used = new Array(roots.length).fill(false);
  for (let i = 0; i < roots.length; i++) {
    if (used[i]) continue;
    const { re, im } = rootParts(roots[i]);
    if (Math.abs(im) < 1e-12) {
      // Real root
      poly = polymul(poly, [1, -re]);
      used[i] = true;
    } else {
      // Complex root: find best conjugate match among remaining roots.
      // Tolerance is relative to root magnitude so large-magnitude roots
      // (e.g. from high-gain systems) are handled correctly.
      const mag = Math.hypot(re, im);
      const tol = Math.max(1e-6, 1e-4 * mag);
      let bestJ = -1, bestDist = Infinity;
      for (let j = i + 1; j < roots.length; j++) {
        if (used[j]) continue;
        const { re: rej, im: imj } = rootParts(roots[j]);
        if (Math.abs(imj) < 1e-12) continue; // skip real roots
        // Distance to ideal conjugate (re, -im)
        const dist = Math.hypot(re - rej, im + imj);
        if (dist < bestDist) { bestDist = dist; bestJ = j; }
      }
      if (bestJ === -1 || bestDist > tol) {
        throw new Error(
          `Complex root (${re.toExponential(3)}+${im.toExponential(3)}j) ` +
          `has no conjugate pair within tolerance ${tol.toExponential(2)}; ` +
          `complex roots must appear in conjugate pairs to form a real polynomial ` +
          `(closest distance: ${bestDist.toExponential(2)})`
        );
      }
      used[bestJ] = true;
      used[i] = true;
      poly = polymul(poly, [1, -2 * re, re * re + im * im]);
    }
  }
  return trimPoly(poly);
}

export function zpkToTF(zeros, poles, gain) {
  const num = polyscale(rootsToRealPoly(zeros), gain);
  const den = rootsToRealPoly(poles);
  return { num, den };
}

/** Find roots via companion matrix eigenvalues */
export function polyroots(poly) {
  const p = trimPoly(poly);
  const n = p.length - 1;
  if (n <= 0) return [];
  if (n === 1) return [new Complex(-p[1] / p[0], 0)];
  if (n === 2) {
    const [a, b, c] = p;
    const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
    const as = a / scale;
    const bs = b / scale;
    const cs = c / scale;
    const disc = bs * bs - 4 * as * cs;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      if (sq === 0) return [new Complex(-bs / (2 * as), 0), new Complex(-bs / (2 * as), 0)];
      // Stable quadratic formula: compute the large-magnitude root with
      // subtraction-free q, then use x1*x2 = c/a for the other root.
      const signB = bs >= 0 ? 1 : -1;
      const q = -0.5 * (bs + signB * sq);
      return [new Complex(q / as, 0), new Complex(cs / q, 0)];
    }
    const sq = Math.sqrt(-disc);
    return [new Complex(-bs / (2 * as), sq / (2 * as)), new Complex(-bs / (2 * as), -sq / (2 * as))];
  }
  const trailingZeros = countTrailingZeros(p);
  if (trailingZeros > 0) {
    const reduced = p.slice(0, p.length - trailingZeros);
    return [
      ...polyroots(reduced),
      ...Array.from({ length: trailingZeros }, () => new Complex(0, 0)),
    ];
  }
  return durandKernerRoots(p);
}

function countTrailingZeros(poly) {
  let count = 0;
  for (let i = poly.length - 1; i > 0; i--) {
    if (Math.abs(poly[i]) > 1e-14) break;
    count++;
  }
  return count;
}

function evalComplexPoly(coeffs, z) {
  let out = new Complex(0, 0);
  for (const coeff of coeffs) out = out.mul(z).add(coeff);
  return out;
}

function durandKernerRoots(poly) {
  const n = poly.length - 1;
  const lead = poly[0];
  const coeffs = poly.map((value) => value / lead);
  const maxCoeff = coeffs.slice(1).reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const radius = Math.max(1, 1 + maxCoeff);
  const roots = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n + Math.PI / (2 * n);
    return Complex.fromPolar(radius, angle);
  });

  for (let iter = 0; iter < 2000; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      let denom = new Complex(1, 0);
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        let diff = roots[i].sub(roots[j]);
        if (diff.magnitude < 1e-14) {
          diff = diff.add(new Complex(1e-12 * (i + 1), -1e-12 * (j + 1)));
        }
        denom = denom.mul(diff);
      }
      const delta = evalComplexPoly(coeffs, roots[i]).div(denom);
      roots[i] = roots[i].sub(delta);
      maxDelta = Math.max(maxDelta, delta.magnitude);
    }
    if (maxDelta < 1e-12) break;
  }

  return roots.map((root) => new Complex(
    Math.abs(root.re) < 1e-10 ? 0 : root.re,
    Math.abs(root.im) < 1e-10 ? 0 : root.im,
  ));
}

/**
 * Polynomial long division: a(s) / b(s) = q(s) remainder r(s).
 * Coefficients [high → low].
 * @returns {{ quotient: number[], remainder: number[] }}
 */
export function polydiv(a, b) {
  a = trimPoly(a.slice());
  b = trimPoly(b.slice());
  if (b.length === 1 && Math.abs(b[0]) < 1e-15) throw new Error('Division by zero polynomial');
  if (a.length < b.length) return { quotient: [0], remainder: a };

  const q = [];
  let rem = a.slice();
  while (rem.length >= b.length) {
    const coeff = rem[0] / b[0];
    q.push(coeff);
    for (let i = 0; i < b.length; i++) {
      rem[i] -= coeff * b[i];
    }
    rem.shift();
  }
  return { quotient: trimPoly(q.length > 0 ? q : [0]), remainder: trimPoly(rem.length > 0 ? rem : [0]) };
}
