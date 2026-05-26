#!/usr/bin/env node
/**
 * verify_b3_srivc.mjs - Tier B3 SRIVC continuous-time identification.
 */

import { poissonFilter, identifyCT } from '../js/identification/srivc.js';

let passed = 0;
let failed = 0;

function ok(msg, cond, detail = '') {
  if (cond) {
    console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`);
    failed++;
  }
}

function rms(v) {
  return Math.sqrt(v.reduce((sum, value) => sum + value * value, 0) / v.length);
}

function simulateFirstOrder({ a = 2, b = 3, dt = 0.001, N = 5000 }) {
  const t = Array.from({ length: N }, (_, k) => k * dt);
  const u = t.map((time) => Math.sin(0.7 * time) + 0.5 * Math.sin(2.3 * time));
  const y = new Array(N).fill(0);
  for (let k = 1; k < N; k++) y[k] = y[k - 1] + dt * (-a * y[k - 1] + b * u[k - 1]);
  return { t, u, y };
}

console.log('\n=== Tier B3: SRIVC Continuous-time ID ===\n');

// Test 1: Poisson filter smooths a stepped signal without changing length.
{
  const signal = Array.from({ length: 100 }, (_, k) => (k < 20 ? 0 : 1));
  const filtered = poissonFilter(signal, 3, 2, 0.01);
  ok('Test 1: Poisson filter preserves signal length', filtered.length === signal.length);
  ok('Test 1: Poisson filter smooths the step response',
    filtered[21] < filtered[80] && filtered[80] < 1,
    `y21=${filtered[21].toFixed(4)}, y80=${filtered[80].toFixed(4)}`);
}

// Test 2: clean CT plant identification error < 1%.
{
  const data = simulateFirstOrder({});
  const id = identifyCT({ ...data, na: 1, nb: 0, lambda_filter: 5, maxIter: 5 });
  const aErr = Math.abs(id.den[1] - 2) / 2;
  const bErr = Math.abs(id.num[0] - 3) / 3;
  ok('Test 2: identifies denominator coefficient within 1%',
    aErr < 0.01,
    `a=${id.den[1].toFixed(6)}, relErr=${aErr.toExponential(3)}`);
  ok('Test 2: identifies numerator coefficient within 1%',
    bErr < 0.01,
    `b=${id.num[0].toFixed(6)}, relErr=${bErr.toExponential(3)}`);
}

// Test 3: residuals remain small for clean data.
{
  const data = simulateFirstOrder({ a: 1.5, b: 2.2, dt: 0.001, N: 4000 });
  const id = identifyCT({ ...data, na: 1, nb: 0, lambda_filter: 4, maxIter: 5 });
  const residualRms = rms(id.residual.slice(20));
  ok('Test 3: residual RMS is small for clean CT data',
    residualRms < 0.08,
    `rms=${residualRms.toExponential(3)}`);
}

// Test 4: validation guards.
{
  let badLambda = false, badLength = false, badTime = false;
  try { poissonFilter([1, 2, 3], 0, 1, 0.1); } catch { badLambda = true; }
  try { identifyCT({ t: [0, 1], u: [1], y: [1, 2], na: 1, nb: 0 }); } catch { badLength = true; }
  try { identifyCT({ t: [0, 1, 3], u: [1, 1, 1], y: [0, 0, 0], na: 1, nb: 0 }); } catch { badTime = true; }
  ok('Test 4: non-positive lambda throws', badLambda);
  ok('Test 4: unequal input lengths throw', badLength);
  ok('Test 4: non-uniform sampling throws', badTime);
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`B3 SRIVC verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.');
