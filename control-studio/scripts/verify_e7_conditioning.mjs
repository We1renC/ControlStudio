#!/usr/bin/env node
/**
 * verify_e7_conditioning.mjs
 *
 * Tier E7 — Condition number gating
 *
 * Checks:
 *  L1 Analytic — Identity matrix: kappa = 1
 *  L1 Analytic — Diagonal [1,1,...] kappa = 1; [1,10^-k]: kappa ~ 10^k
 *  L2 Property — Hilbert matrix n=10 detects kappa > 1e10
 *  L2 Property — Vandermonde matrix detects high condition
 *  L3 Cross   — withConditionCheck returns x consistent with matSolve, plus kappa
 *  L4 Boundary — singular matrix returns Infinity kappa, throws if requested
 */
import {
  estimateCondition,
  withConditionCheck,
  scaleAndSolve,
  CONDITION_WARN_THRESHOLD,
  CONDITION_SEVERE_THRESHOLD,
} from '../js/math/conditioning.js';
import { matSolve, matIdentity } from '../js/math/matrix.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
let failed = 0;

function assertTrue(label, cond, detail = '') {
  console.log(`${cond ? PASS : FAIL} ${label}${detail ? ': ' + detail : ''}`);
  if (!cond) failed++;
}
function assertInRange(label, val, lo, hi) {
  const ok = Number.isFinite(val) && val >= lo && val <= hi;
  console.log(`${ok ? PASS : FAIL} ${label}: got ${val}, expected in [${lo}, ${hi}]`);
  if (!ok) failed++;
}

console.log('===============================================================');
console.log('  E7 Condition Number Gating');
console.log('===============================================================\n');

// L1 Identity
console.log('> L1 Analytic');
const I3 = matIdentity(3);
const kappaI = estimateCondition(I3);
assertTrue('kappa(I) ~ 1', Math.abs(kappaI - 1) < 1e-9, `got ${kappaI}`);

// Diagonal [1, 1e-6] -> kappa ~ 1e6
const D2 = [[1, 0], [0, 1e-6]];
const kappaD = estimateCondition(D2);
assertInRange('kappa(diag[1, 1e-6])', kappaD, 5e5, 5e6);

// L2 Hilbert n=10
console.log('\n> L2 Hilbert n=10 high condition');
function hilbert(n) {
  const H = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(1 / (i + j + 1));
    H.push(row);
  }
  return H;
}
const H10 = hilbert(10);
const kH = estimateCondition(H10);
assertTrue('kappa(H10) > 1e10', kH > 1e10, `kappa=${kH.toExponential(2)}`);
assertTrue('H10 triggers severe threshold', kH > CONDITION_SEVERE_THRESHOLD,
  `kappa=${kH.toExponential(2)}, threshold=${CONDITION_SEVERE_THRESHOLD.toExponential(0)}`);

// L2 Vandermonde
const V = [
  [1, 1, 1, 1],
  [1, 2, 4, 8],
  [1, 3, 9, 27],
  [1, 4, 16, 64],
];
const kV = estimateCondition(V);
assertTrue('kappa(V) > 100', kV > 100, `kappa=${kV.toExponential(2)}`);

// L3 Cross: withConditionCheck returns x equal to matSolve
console.log('\n> L3 withConditionCheck consistency');
const A = [[2, 1], [1, 3]];
const b = [[5], [4]];
const xDirect = matSolve(A, b);
const wrapped = withConditionCheck(A, b, () => matSolve(A, b));
assertTrue('x returned',
  Array.isArray(wrapped.x) && wrapped.x.length === 2 && wrapped.x[0].length === 1);
assertTrue('x matches direct solve',
  Math.abs(wrapped.x[0][0] - xDirect[0][0]) < 1e-10 &&
  Math.abs(wrapped.x[1][0] - xDirect[1][0]) < 1e-10);
assertTrue('kappa returned', Number.isFinite(wrapped.kappa) && wrapped.kappa > 0);
assertTrue('no warning for well-cond matrix', !wrapped.warning,
  `warning=${wrapped.warning}`);

// L3 Warning level for moderate ill-conditioning
const Aill = [[1, 1], [1, 1 + 1e-7]];
const bill = [[2], [2]];
const wrappedIll = withConditionCheck(Aill, bill, () => matSolve(Aill, bill));
assertTrue('warning produced for kappa > warn threshold',
  !!wrappedIll.warning, `warning=${wrappedIll.warning}, kappa=${wrappedIll.kappa.toExponential(2)}`);

// L4 Boundary: singular matrix
console.log('\n> L4 Boundary');
const Sing = [[1, 2], [2, 4]];
const kSing = estimateCondition(Sing);
assertTrue('kappa(singular) is Infinity or huge',
  !Number.isFinite(kSing) || kSing > 1e14, `kappa=${kSing}`);

// 1x1 matrix
const k1 = estimateCondition([[5]]);
assertTrue('kappa([[5]]) = 1', Math.abs(k1 - 1) < 1e-12, `got ${k1}`);

// Empty / invalid
let threw = false;
try { estimateCondition([]); } catch { threw = true; }
assertTrue('empty matrix throws', threw);

threw = false;
try { estimateCondition([[1, 2], [3]]); } catch { threw = true; }
assertTrue('jagged matrix throws', threw);

// scaleAndSolve sanity — non-singular but ill-scaled diagonal matrix
console.log('\n> Bonus: scaleAndSolve reduces ill-scaling');
const Aill2 = [[1e5, 0], [0, 1e-5]];   // det=1, kappa=1e10 (badly scaled)
const bill2 = [[1e5], [1e-5]];          // solution = [1, 1]
const scaled = scaleAndSolve(Aill2, bill2);
assertTrue('scaleAndSolve recovers x ~ [1, 1]',
  Math.abs(scaled.x[0][0] - 1) < 1e-6 && Math.abs(scaled.x[1][0] - 1) < 1e-6,
  `x=[${scaled.x[0][0]}, ${scaled.x[1][0]}], kappa_after=${scaled.kappa_after?.toExponential(2)}`);
assertTrue('kappa_after << kappa_before',
  scaled.kappa_after < scaled.kappa_before / 100,
  `before=${scaled.kappa_before.toExponential(2)}, after=${scaled.kappa_after.toExponential(2)}`);

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All E7 checks passed');
  process.exit(0);
} else {
  console.log(`${failed} E7 check(s) FAILED`);
  process.exit(1);
}
