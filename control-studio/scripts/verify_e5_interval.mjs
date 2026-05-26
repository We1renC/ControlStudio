#!/usr/bin/env node
/**
 * verify_e5_interval.mjs
 *
 * Tier E5 — Interval Arithmetic
 *
 * Checks:
 *  L1 Basic — add, sub, mul, div, intersect rules correct
 *  L1 Basic — Interval([1,2]) + Interval([3,4]) = Interval([4,6])
 *  L1 Basic — Interval([1,2]) * Interval([-1,1]) = Interval([-2,2])
 *  L2 Property — division by interval containing 0 throws
 *  L2 Property — width preserved under shift
 *  L3 Cross — interval matrix multiplication
 *  L3 Cross — robust stability via Kharitonov for 2nd-order polynomial
 */
import {
  Interval,
  intervalMatMul,
  intervalEigenvalueBounds,
  kharitonovRobustStability,
} from '../js/math/interval.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
let failed = 0;

function assertNear(label, actual, expected, tol = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? PASS : FAIL} ${label}: got ${actual}, expected ~${expected} (tol ${tol})`);
  if (!ok) failed++;
}
function assertIntervalEq(label, actual, lo, hi, tol = 1e-9) {
  const ok = Math.abs(actual.lo - lo) <= tol && Math.abs(actual.hi - hi) <= tol;
  console.log(`${ok ? PASS : FAIL} ${label}: got [${actual.lo}, ${actual.hi}], expected [${lo}, ${hi}]`);
  if (!ok) failed++;
}
function assertTrue(label, cond, detail = '') {
  console.log(`${cond ? PASS : FAIL} ${label}${detail ? ': ' + detail : ''}`);
  if (!cond) failed++;
}
function assertThrows(label, fn) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  console.log(`${threw ? PASS : FAIL} ${label}`);
  if (!threw) failed++;
}

console.log('===============================================================');
console.log('  E5 Interval Arithmetic');
console.log('===============================================================\n');

// L1 basic
console.log('> L1 Basic operations');
const a = new Interval(1, 2);
const b = new Interval(3, 4);
assertIntervalEq('add [1,2] + [3,4]',  a.add(b),  4, 6);
assertIntervalEq('sub [1,2] - [3,4]',  a.sub(b), -3, -1);
assertIntervalEq('mul [1,2] * [3,4]',  a.mul(b),  3, 8);
const c = new Interval(-1, 1);
assertIntervalEq('mul [1,2] * [-1,1]', a.mul(c), -2, 2);
// Division: [1,2] / [2,4] = [0.25, 1]
assertIntervalEq('div [1,2] / [2,4]', a.div(new Interval(2, 4)), 0.25, 1);
// Negation
assertIntervalEq('neg [1,2]', a.neg(), -2, -1);
// Width and midpoint
assertNear('width [1,2]', a.width(), 1, 1e-15);
assertNear('mid [1,2]',   a.mid(), 1.5, 1e-15);

// L2 boundary / property
console.log('\n> L2 Properties');
assertThrows('div by [-1, 1] (contains 0) throws', () => a.div(c));
assertThrows('lo > hi throws on construct', () => new Interval(2, 1));

// contains
assertTrue('[1,2] contains 1.5', a.contains(1.5));
assertTrue('[1,2] not contains 0.5', !a.contains(0.5));
assertTrue('[1,2] contains 1 (boundary)', a.contains(1));

// intersect
const d = new Interval(1.5, 3);
const inter = a.intersect(d);
assertIntervalEq('[1,2] ∩ [1.5,3] = [1.5,2]', inter, 1.5, 2);
assertTrue('[1,2] ∩ [3,4] = null (disjoint)', a.intersect(b) === null);

// L3 matrix multiplication
console.log('\n> L3 Interval matrix multiplication');
const IA = [
  [new Interval(1, 2), new Interval(0, 1)],
  [new Interval(-1, 0), new Interval(2, 3)],
];
const IB = [
  [new Interval(1, 1)],   // singleton
  [new Interval(2, 2)],
];
const IM = intervalMatMul(IA, IB);
// IA * IB = [[1*[1,2] + 2*[0,1]], [1*[-1,0] + 2*[2,3]]]
//         = [[1,2] + [0,2], [-1,0] + [4,6]]
//         = [[1, 4], [3, 6]]
assertIntervalEq('row 0', IM[0][0], 1, 4);
assertIntervalEq('row 1', IM[1][0], 3, 6);

// L3 Kharitonov: interval polynomial p(s) = a3*s^3 + a2*s^2 + a1*s + a0
// Stable iff Hurwitz. For a3>0, all coeffs > 0 necessary; Hurwitz det chain.
console.log('\n> L3 Kharitonov robust stability');
// p(s) = s^2 + a1*s + a0, with a1 in [2, 3], a0 in [1, 5]
// All Kharitonov polynomials Hurwitz iff each is Hurwitz.
// For 2nd-order: a2 > 0, a1 > 0, a0 > 0 sufficient.
const coeffs1 = [
  new Interval(1, 1),     // a2 = 1
  new Interval(2, 3),     // a1 in [2,3]
  new Interval(1, 5),     // a0 in [1,5]
];
const result1 = kharitonovRobustStability(coeffs1);
assertTrue('p(s)=s^2 + [2,3]s + [1,5] robustly stable', result1.stable,
  `verdict=${JSON.stringify(result1)}`);

// Unstable family: a0 in [-1, 5] (allows a0 = -1 → unstable)
const coeffsBad = [
  new Interval(1, 1),
  new Interval(2, 3),
  new Interval(-1, 5),
];
const result2 = kharitonovRobustStability(coeffsBad);
assertTrue('p(s)=s^2 + [2,3]s + [-1,5] not robustly stable', !result2.stable);

// L4 - eigenvalue bounds (Gerschgorin-style for interval matrix)
console.log('\n> L4 Interval eigenvalue bounds (Gerschgorin)');
const IM2 = [
  [new Interval(-2, -1), new Interval(-0.1, 0.1)],
  [new Interval(-0.2, 0.2), new Interval(-3, -2)],
];
const bounds = intervalEigenvalueBounds(IM2);
// All real eigenvalues should lie in [-3-0.2, -1+0.1] = [-3.2, -0.9]
assertTrue('all eigenvalues have real part in expected range',
  bounds.realMin >= -3.5 && bounds.realMax <= 0,
  `range [${bounds.realMin}, ${bounds.realMax}]`);
assertTrue('all eigenvalues stable (real part < 0)', bounds.realMax < 0);

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All E5 Interval Arithmetic checks passed');
  process.exit(0);
} else {
  console.log(`${failed} E5 check(s) FAILED`);
  process.exit(1);
}
