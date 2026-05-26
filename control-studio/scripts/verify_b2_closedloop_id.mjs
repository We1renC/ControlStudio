#!/usr/bin/env node
/**
 * verify_b2_closedloop_id.mjs - Tier B2 closed-loop identification.
 */

import { identifyClosedLoop, analyzeBiasRisk } from '../js/control/closedloop_id.js';

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

function prbs(N) {
  return Array.from({ length: N }, (_, k) => (((k * 17 + Math.floor(k / 7)) % 11) < 5 ? -1 : 1));
}

function makeClosedLoop({ N = 800, a = 0.65, b = 0.35, K = 1.2, noise = 0 }) {
  const r = prbs(N);
  const y = new Array(N).fill(0);
  const u = new Array(N).fill(0);
  for (let k = 1; k < N; k++) {
    u[k - 1] = K * (r[k - 1] - y[k - 1]);
    const deterministicNoise = noise * Math.sin(0.37 * k + 0.11 * (k % 9));
    y[k] = a * y[k - 1] + b * u[k - 1] + deterministicNoise;
  }
  u[N - 1] = K * (r[N - 1] - y[N - 1]);
  return { r, u, y, truePlant: { a, b }, K };
}

console.log('\n=== Tier B2: Closed-loop Identification ===\n');

// Test 1: indirect closed-loop identification recovers true first-order plant.
{
  const data = makeClosedLoop({ noise: 0 });
  const id = identifyClosedLoop({
    r: data.r,
    u: data.u,
    y: data.y,
    controllerK: data.K,
    method: 'indirect',
  });
  ok('Test 1: indirect method recovers plant pole a',
    Math.abs(id.plant.aPole - data.truePlant.a) < 1e-3,
    `a=${id.plant.aPole.toFixed(5)}`);
  ok('Test 1: indirect method recovers plant gain b',
    Math.abs(id.plant.bGain - data.truePlant.b) < 1e-3,
    `b=${id.plant.bGain.toFixed(5)}`);
}

// Test 2: joint I/O IV estimate is accurate with deterministic output noise.
{
  const data = makeClosedLoop({ noise: 0.03 });
  const id = identifyClosedLoop({
    r: data.r,
    u: data.u,
    y: data.y,
    controllerK: data.K,
    method: 'jointIO',
  });
  ok('Test 2: jointIO estimate remains close under output noise',
    Math.abs(id.plant.aPole - data.truePlant.a) < 0.08 && Math.abs(id.plant.bGain - data.truePlant.b) < 0.08,
    `a=${id.plant.aPole.toFixed(4)}, b=${id.plant.bGain.toFixed(4)}`);
  ok('Test 2: jointIO returns a residual noise model',
    id.noiseModel?.mse > 0,
    `mse=${id.noiseModel?.mse.toExponential(3)}`);
}

// Test 3: direct method works but exposes bias risk metadata.
{
  const data = makeClosedLoop({ noise: 0.2 });
  const direct = identifyClosedLoop({
    r: data.r,
    u: data.u,
    y: data.y,
    controllerK: data.K,
    method: 'direct',
  });
  ok('Test 3: direct method returns ARX model and risk analysis',
    direct.model && direct.biasRisk.biasIndex >= 0 && direct.conditionNumber > 1,
    `biasIndex=${direct.biasRisk.biasIndex.toFixed(3)}`);
}

// Test 4: low-excitation / noisy closed-loop data warns against direct ARX.
{
  const N = 500;
  const r = new Array(N).fill(0.1);
  const y = Array.from({ length: N }, (_, k) => 0.1 + 0.5 * Math.sin(0.2 * k));
  const u = y.map((value, k) => 1.5 * (r[k] - value));
  const risk = analyzeBiasRisk({ r, u, y }, 1.5);
  ok('Test 4: low-excitation dataset has high bias risk',
    risk.biasIndex > 0.45 && risk.recommendation.includes('indirect'),
    `biasIndex=${risk.biasIndex.toFixed(3)}`);
}

// Test 5: validation guards.
{
  let badMethod = false, badLengths = false, badK = false;
  const data = makeClosedLoop({});
  try { identifyClosedLoop({ ...data, controllerK: data.K, method: 'unknown' }); } catch { badMethod = true; }
  try { identifyClosedLoop({ r: [1, 2], u: [1], y: [1, 2], method: 'direct' }); } catch { badLengths = true; }
  try { identifyClosedLoop({ r: data.r, u: data.u, y: data.y, controllerK: 0, method: 'indirect' }); } catch { badK = true; }
  ok('Test 5: unknown method throws', badMethod);
  ok('Test 5: unequal data lengths throw', badLengths);
  ok('Test 5: indirect with zero controller gain throws', badK);
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`B2 closed-loop ID verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.');
