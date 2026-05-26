/**
 * interval.js — Tier E5: Interval Arithmetic + robust-stability tools
 *
 * Provides:
 *   class Interval        - [lo, hi] with arithmetic methods
 *   intervalMatMul        - interval matrix * interval matrix
 *   intervalEigenvalueBounds - Gerschgorin-style real-part bounds
 *   kharitonovRobustStability - test interval polynomial via Kharitonov 4 polys
 *
 * Interval arithmetic rules (IEEE 1788-style, but real-valued only):
 *   [a,b] + [c,d] = [a+c, b+d]
 *   [a,b] - [c,d] = [a-d, b-c]
 *   [a,b] * [c,d] = [min(ac,ad,bc,bd), max(...)]
 *   [a,b] / [c,d] = [a,b] * [1/d, 1/c]   (only if 0 ∉ [c,d])
 */

// ── Class ───────────────────────────────────────────────────────────────────

export class Interval {
  constructor(lo, hi) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      throw new Error(`Interval bounds must be finite, got [${lo}, ${hi}]`);
    }
    if (lo > hi) {
      throw new Error(`Interval lo > hi: [${lo}, ${hi}]`);
    }
    this.lo = lo;
    this.hi = hi;
  }

  add(o) { return new Interval(this.lo + o.lo, this.hi + o.hi); }
  sub(o) { return new Interval(this.lo - o.hi, this.hi - o.lo); }

  mul(o) {
    const vals = [
      this.lo * o.lo, this.lo * o.hi,
      this.hi * o.lo, this.hi * o.hi,
    ];
    return new Interval(Math.min(...vals), Math.max(...vals));
  }

  div(o) {
    if (o.lo <= 0 && o.hi >= 0) {
      throw new Error('Interval division: divisor contains 0');
    }
    const inv = new Interval(1 / o.hi, 1 / o.lo);
    return this.mul(inv);
  }

  neg() { return new Interval(-this.hi, -this.lo); }
  width() { return this.hi - this.lo; }
  mid() { return (this.lo + this.hi) / 2; }
  contains(x) { return x >= this.lo && x <= this.hi; }

  intersect(o) {
    const lo = Math.max(this.lo, o.lo);
    const hi = Math.min(this.hi, o.hi);
    if (lo > hi) return null;
    return new Interval(lo, hi);
  }

  toString() { return `[${this.lo}, ${this.hi}]`; }
}

// Convenience: convert scalar -> singleton Interval
export function toInterval(x) {
  if (x instanceof Interval) return x;
  return new Interval(x, x);
}

// ── Interval matrix operations ─────────────────────────────────────────────

/**
 * Multiply two interval matrices A (n×m) * B (m×p) → result n×p of intervals.
 * Each entry follows: C[i][j] = sum_k A[i][k] * B[k][j] (interval sum/mul).
 */
export function intervalMatMul(A, B) {
  if (!Array.isArray(A) || !Array.isArray(B)) {
    throw new Error('A, B must be arrays');
  }
  const n = A.length;
  const m = A[0].length;
  const m2 = B.length;
  const p = B[0].length;
  if (m !== m2) {
    throw new Error(`inner dimension mismatch: A is ${n}x${m}, B is ${m2}x${p}`);
  }
  const C = Array.from({ length: n }, () => new Array(p).fill(null));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      let acc = new Interval(0, 0);
      for (let k = 0; k < m; k++) {
        const prod = A[i][k].mul(B[k][j]);
        acc = acc.add(prod);
      }
      C[i][j] = acc;
    }
  }
  return C;
}

/**
 * Gerschgorin-disc style real-part bounds on eigenvalues of an interval matrix.
 * For each row i, real(λ) ∈ [a_ii.lo - R_i, a_ii.hi + R_i], where
 *   R_i = sum_{j≠i} max(|a_ij.lo|, |a_ij.hi|)
 * (Conservative: the union of all such intervals.)
 */
export function intervalEigenvalueBounds(IM) {
  const n = IM.length;
  if (!IM.every((row) => row.length === n)) {
    throw new Error('Interval matrix must be square');
  }
  let realMin = Infinity;
  let realMax = -Infinity;
  for (let i = 0; i < n; i++) {
    let R = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const aij = IM[i][j];
      const mag = Math.max(Math.abs(aij.lo), Math.abs(aij.hi));
      R += mag;
    }
    const aii = IM[i][i];
    realMin = Math.min(realMin, aii.lo - R);
    realMax = Math.max(realMax, aii.hi + R);
  }
  return { realMin, realMax };
}

// ── Kharitonov robust stability ────────────────────────────────────────────

/**
 * Hurwitz stability check for a monic / coefficient-vector polynomial
 *   p(s) = a_n s^n + ... + a_1 s + a_0
 * Required: all leading principal minors of Hurwitz matrix > 0.
 * Uses Routh array.
 *
 * @param {number[]} coeffs  high-to-low: [a_n, a_{n-1}, ..., a_0]
 * @returns {boolean}
 */
function hurwitzStable(coeffs) {
  const n = coeffs.length - 1;  // degree
  if (n < 1) return false;
  // Necessary: all coefficients same sign (and non-zero)
  const sign = Math.sign(coeffs[0]);
  if (sign === 0) return false;
  for (const c of coeffs) {
    if (Math.sign(c) !== sign && c !== 0) return false;
    if (c === 0) return false;  // strict for stability
  }
  // Build Routh array
  const rows = n + 1;
  const cols = Math.ceil((n + 1) / 2);
  const r = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i <= n; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    r[row][col] = coeffs[i];
  }
  for (let i = 2; i <= n; i++) {
    const pivot = r[i - 1][0];
    if (Math.abs(pivot) < 1e-14) return false;
    for (let j = 0; j < cols - 1; j++) {
      r[i][j] = (r[i - 1][0] * r[i - 2][j + 1] - r[i - 2][0] * r[i - 1][j + 1]) / pivot;
    }
  }
  // Stable iff first column all positive (or all negative)
  const firstSign = Math.sign(r[0][0]);
  for (let i = 1; i <= n; i++) {
    if (Math.sign(r[i][0]) !== firstSign) return false;
    if (Math.abs(r[i][0]) < 1e-14) return false;
  }
  return true;
}

/**
 * Kharitonov's theorem: an interval polynomial
 *   p(s) = [a_n] s^n + [a_{n-1}] s^{n-1} + ... + [a_0]
 * is robustly Hurwitz iff the four extremal polynomials are Hurwitz:
 *
 *   p1(s) = a_0_lo + a_1_lo s + a_2_hi s^2 + a_3_hi s^3 + a_4_lo s^4 + ...
 *   p2(s) = a_0_hi + a_1_hi s + a_2_lo s^2 + a_3_lo s^3 + a_4_hi s^4 + ...
 *   p3(s) = a_0_lo + a_1_hi s + a_2_hi s^2 + a_3_lo s^3 + a_4_lo s^4 + ...
 *   p4(s) = a_0_hi + a_1_lo s + a_2_lo s^2 + a_3_hi s^3 + a_4_hi s^4 + ...
 *
 * (pattern: lo,lo,hi,hi,lo,lo,... etc.)
 *
 * @param {Interval[]} intervalCoeffs  high-to-low: [a_n, a_{n-1}, ..., a_0]
 * @returns {{ stable: boolean, polys: number[][], hurwitz: boolean[] }}
 */
export function kharitonovRobustStability(intervalCoeffs) {
  if (!Array.isArray(intervalCoeffs) || intervalCoeffs.length < 2) {
    throw new Error('intervalCoeffs must have length >= 2');
  }
  const n = intervalCoeffs.length - 1;  // degree
  // Coefficients indexed from low (a_0) to high (a_n) for Kharitonov pattern;
  // input is high-to-low, so reverse.
  const lo2hi = intervalCoeffs.slice().reverse();  // [a_0, a_1, ..., a_n]
  // Kharitonov picks per index i: pattern based on i % 4
  // Standard form:
  //   K1: lo, lo, hi, hi, lo, lo, hi, hi, ...
  //   K2: hi, hi, lo, lo, hi, hi, lo, lo, ...
  //   K3: lo, hi, hi, lo, lo, hi, hi, lo, ...
  //   K4: hi, lo, lo, hi, hi, lo, lo, hi, ...
  const patterns = [
    [0, 0, 1, 1],  // K1
    [1, 1, 0, 0],  // K2
    [0, 1, 1, 0],  // K3
    [1, 0, 0, 1],  // K4
  ];
  const polys = [];
  const hurwitz = [];
  for (const pat of patterns) {
    const coeffsLow2High = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const pick = pat[i % 4];  // 0 = lo, 1 = hi
      coeffsLow2High[i] = pick === 0 ? lo2hi[i].lo : lo2hi[i].hi;
    }
    // Convert back to high-to-low for Routh
    const high2low = coeffsLow2High.slice().reverse();
    polys.push(high2low);
    hurwitz.push(hurwitzStable(high2low));
  }
  const stable = hurwitz.every((h) => h);
  return { stable, polys, hurwitz };
}
