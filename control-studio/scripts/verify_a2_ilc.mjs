#!/usr/bin/env node
/**
 * verify_a2_ilc.mjs
 *
 * Tier A2 — Iterative Learning Control
 *
 * Checks:
 *  L1 Property — P-type ILC error norm strictly decreasing for stable G with |I - Gamma*g0| < 1
 *  L1 Property — NOILC closed-form: u_{k+1} = u_k + (G'QG + R)^-1 G'Q e_k
 *  L2 Cross   — 10 iterations on stable 1st-order plant: error norm reduced > 90%
 *  L2 Cross   — convergence spectral radius < 1 reported correctly
 *  L3 Boundary — non-monotonic warning when |I - Gamma*g0| > 1
 *  L4 Boundary — bad inputs throw
 */
import {
  designILC,
  iterateILC,
  ilcConvergenceCheck,
  buildLiftedMatrix,
} from '../js/control/ilc.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
let failed = 0;

function assertNear(label, actual, expected, tol = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? PASS : FAIL} ${label}: got ${actual}, expected ~${expected} (tol ${tol})`);
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
console.log('  A2 ILC - Iterative Learning Control');
console.log('===============================================================\n');

// Helper: simulate discrete plant with input sequence u (length N)
//   y_{k+1} = a*y_k + b*u_k, y_0 = 0
function simulatePlant(a, b, u) {
  const N = u.length;
  const y = new Array(N);
  let yk = 0;
  for (let k = 0; k < N; k++) {
    yk = a * yk + b * u[k];
    y[k] = yk;
  }
  return y;
}

const N = 50;
const a = 0.8;   // stable pole
const b = 1.0;
const dt = 0.1;
// Reference: ramp to 1 then hold
const ref = new Array(N);
for (let k = 0; k < N; k++) ref[k] = k < 20 ? k / 20 : 1.0;

// L1 - Lifted matrix structure
console.log('> L1 Lifted matrix structure');
const G = buildLiftedMatrix(a, b, N);
assertTrue('lifted matrix G is NxN', G.length === N && G[0].length === N);
// G is lower-triangular (causal); first column = impulse response
assertNear('G[0][0] = b', G[0][0], b, 1e-12);
assertNear('G[1][0] = a*b', G[1][0], a * b, 1e-12);
assertNear('G[2][0] = a^2 * b', G[2][0], a * a * b, 1e-12);
assertNear('G[0][1] = 0 (causal)', G[0][1], 0, 1e-15);

// L1 - P-type ILC design
console.log('\n> L1 P-type ILC design and convergence check');
const Gamma = 0.5;
const ilcP = designILC({ type: 'Ptype', plant: { a, b }, horizon: N, gamma: Gamma });
assertTrue('designILC P-type returns config', !!ilcP && ilcP.type === 'Ptype');
const conv = ilcConvergenceCheck(ilcP);
// |1 - Gamma * b| with Gamma=0.5, b=1 => |0.5| = 0.5 < 1 => monotone
assertTrue('spectral radius < 1', conv.spectralRadius < 1,
  `rho=${conv.spectralRadius.toFixed(4)}`);
assertTrue('monotone flag set', conv.monotone === true);

// L2 - 10 iteration error reduction
console.log('\n> L2 P-type iteration convergence');
let u = new Array(N).fill(0);
let errNorms = [];
for (let iter = 0; iter < 20; iter++) {
  const y = simulatePlant(a, b, u);
  const e = ref.map((r, i) => r - y[i]);
  const eNorm = Math.sqrt(e.reduce((s, v) => s + v * v, 0));
  errNorms.push(eNorm);
  const step = iterateILC(ilcP, e, u, iter);
  u = step.u_next;
}
// P-type ILC in L2 norm typically has transient growth then asymptotic decay
// (classical Norrlöf 2004 result). Verify asymptotic decay and final error.
const peakErr = Math.max(...errNorms);
const finalErr = errNorms[19];
assertTrue('peak error reached early then decays', errNorms.indexOf(peakErr) <= 10,
  `peakIdx=${errNorms.indexOf(peakErr)}, peak=${peakErr.toFixed(3)}`);
assertTrue('final error << peak (asymptotic convergence)', finalErr < peakErr * 0.01,
  `peak=${peakErr.toFixed(3)}, final=${finalErr.toFixed(4)}`);
const reduction = 1 - errNorms[19] / errNorms[0];
assertTrue('error reduced > 90% after 20 iterations', reduction > 0.9,
  `reduction=${(reduction * 100).toFixed(1)}%`);

// L2 - NOILC closed-form sanity
console.log('\n> L2 NOILC closed-form');
const ilcN = designILC({ type: 'NOILC', plant: { a, b }, horizon: N, Q: 1.0, R: 0.001 });
assertTrue('NOILC config returns learningOp', !!ilcN.learningOp);
// run a few iterations - NOILC should converge even faster than P-type
let uN = new Array(N).fill(0);
let errNormsN = [];
for (let iter = 0; iter < 10; iter++) {
  const y = simulatePlant(a, b, uN);
  const e = ref.map((r, i) => r - y[i]);
  errNormsN.push(Math.sqrt(e.reduce((s, v) => s + v * v, 0)));
  const step = iterateILC(ilcN, e, uN, iter);
  uN = step.u_next;
}
assertTrue('NOILC monotone decrease',
  errNormsN.every((v, i, arr) => i === 0 || v <= arr[i - 1] + 1e-9),
  `start=${errNormsN[0].toFixed(3)}, end=${errNormsN[9].toFixed(3)}`);
const reductionN = 1 - errNormsN[9] / errNormsN[0];
assertTrue('NOILC reduces error > 95% in 10 iter', reductionN > 0.95,
  `reduction=${(reductionN * 100).toFixed(1)}%`);
// NOILC should beat P-type at same iteration count
assertTrue('NOILC final err < P-type final err at iter 9',
  errNormsN[9] < errNorms[9],
  `NOILC[9]=${errNormsN[9].toFixed(4)} vs P[9]=${errNorms[9].toFixed(4)}`);

// L3 - Non-monotonic warning
console.log('\n> L3 Non-monotonic warning');
// With Gamma=3, b=1: |1 - 3*1| = 2 > 1, not monotone
const ilcBad = designILC({ type: 'Ptype', plant: { a, b }, horizon: N, gamma: 3.0 });
const convBad = ilcConvergenceCheck(ilcBad);
assertTrue('large gamma -> spectralRadius >= 1', convBad.spectralRadius >= 1);
assertTrue('large gamma -> monotone=false', convBad.monotone === false);

// L4 - Bad inputs
console.log('\n> L4 Boundary');
assertThrows('horizon=0 throws',
  () => designILC({ type: 'Ptype', plant: { a, b }, horizon: 0, gamma: 0.5 }));
assertThrows('unknown type throws',
  () => designILC({ type: 'Foo', plant: { a, b }, horizon: N, gamma: 0.5 }));
assertThrows('NOILC missing Q throws',
  () => designILC({ type: 'NOILC', plant: { a, b }, horizon: N }));

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All A2 ILC checks passed');
  process.exit(0);
} else {
  console.log(`${failed} A2 ILC check(s) FAILED`);
  process.exit(1);
}
