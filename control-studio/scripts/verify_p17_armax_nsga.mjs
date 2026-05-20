#!/usr/bin/env node
/**
 * Verification tests for Feature 1 (ARMAX) and Feature 2 (NSGA-II).
 */
import { identifyARMAX, identifyARX } from '../js/control/sysid.js';
import { nsga2TunePID } from '../js/control/ga_tuner.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { setSeed, randn } from '../js/math/rng.js';
import { generatePRBS } from '../js/control/sysid_signals.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS  ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL  ${msg}`);
    failed++;
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ~${b}, tol ${tol})`);
}

// ---------------------------------------------------------------------------
// Generate ARX data: y[k] = 0.7*y[k-1] - 0.12*y[k-2] + 0.4*u[k-1] + 0.2*u[k-2]
// True: na=2, nb=2, nk=1
function generateARXData(N = 300, noiseStd = 0) {
  setSeed(42);
  const u = Array.from({ length: N }, (_, k) => (k < 10 ? 0 : 1));
  const y = new Array(N).fill(0);
  // simple random noise if needed
  for (let k = 2; k < N; k++) {
    const noise = noiseStd > 0 ? noiseStd * (Math.random() - 0.5) * 2 : 0;
    y[k] = 0.7 * y[k - 1] - 0.12 * y[k - 2] + 0.4 * u[k - 1] + 0.2 * u[k - 2] + noise;
  }
  return { u, y };
}

// ---------------------------------------------------------------------------
console.log('\n=== ARMAX Tests ===\n');

// Test 1: ARMAX(nc=0) on ARX data should match ARX closely
{
  setSeed(42);
  const { u, y } = generateARXData(300, 0);
  const arx = identifyARX(u, y, 2, 2, 1, 1);
  const armax = identifyARMAX(u, y, 2, 2, 0, 1, 1);
  assertClose(armax.fitPercent, arx.fitPercent, 0.01,
    'Test 1: ARMAX(nc=0) fitPercent matches ARX exactly');
}

// Test 2: ARMAX with nc=2 on noisy data should have fitPercent >= ARX or at least comparable
{
  setSeed(123);
  const { u, y } = generateARXData(400, 0.05);
  const arx = identifyARX(u, y, 2, 2, 1, 1);
  const armax = identifyARMAX(u, y, 2, 2, 2, 1, 1);
  // ARMAX should not significantly degrade vs ARX
  assert(armax.fitPercent >= arx.fitPercent - 5,
    `Test 2: ARMAX(nc=2) fitPercent (${armax.fitPercent.toFixed(2)}%) not significantly worse than ARX (${arx.fitPercent.toFixed(2)}%)`);
  assert(armax.fitPercent >= 0,
    `Test 2b: ARMAX fitPercent is non-negative (${armax.fitPercent.toFixed(2)}%)`);
}

// Test 3: c array has nc elements
{
  const { u, y } = generateARXData(300, 0);
  const nc = 3;
  const armax = identifyARMAX(u, y, 2, 2, nc, 1, 1);
  assert(Array.isArray(armax.c) && armax.c.length === nc,
    `Test 3: c array has nc=${nc} elements (got ${armax.c?.length})`);
}

// Test 4: iterations <= maxIter
{
  const { u, y } = generateARXData(300, 0);
  const maxIter = 10;
  const armax = identifyARMAX(u, y, 2, 2, 1, 1, 1, { maxIter });
  assert(armax.iterations <= maxIter,
    `Test 4: iterations (${armax.iterations}) <= maxIter (${maxIter})`);
}

// Test 5: nc=0 returns c=[] and degenerates to ARX
{
  const { u, y } = generateARXData(300, 0);
  const armax = identifyARMAX(u, y, 2, 2, 0, 1, 1);
  assert(Array.isArray(armax.c) && armax.c.length === 0,
    'Test 5: nc=0 returns empty c array');
  assert(Number.isFinite(armax.fitPercent) && armax.fitPercent > 0,
    `Test 5b: nc=0 gives valid fitPercent (${armax.fitPercent.toFixed(2)}%)`);
}

// Test 6: ARMAX output fields present
{
  const { u, y } = generateARXData(300, 0);
  const armax = identifyARMAX(u, y, 2, 2, 2, 1, 1);
  assert('tf' in armax && armax.tf !== null, 'Test 6a: armax.tf exists');
  assert(Array.isArray(armax.yhat), 'Test 6b: armax.yhat is array');
  assert(Array.isArray(armax.residual), 'Test 6c: armax.residual is array');
  assert(Number.isFinite(armax.mse), 'Test 6d: armax.mse is finite');
  assert(Number.isFinite(armax.aic), 'Test 6e: armax.aic is finite');
  assert(typeof armax.iterations === 'number', 'Test 6f: armax.iterations is number');
}

// ---------------------------------------------------------------------------
// AIC Model-Selection Tests — verifies that the AIC criterion correctly
// identifies the true model structure over competing candidates.

console.log('\n=== AIC Model-Selection Tests ===\n');

// Test 7: White equation-error noise → ARX wins over ARMAX on AIC.
// Data generating model: y[k] = 0.7·y[k-1] + 0.4·u[k-1] + e[k], e iid N(0,0.04)
// True structure is ARX(1,1), so ARX has the correct order and should be preferred.
{
  setSeed(42);
  const N = 500;
  const u = generatePRBS(N, 7, 1.0);
  const y = new Array(N).fill(0);
  for (let k = 1; k < N; k++) y[k] = 0.7 * y[k - 1] + 0.4 * u[k - 1] + 0.2 * randn();
  const arx   = identifyARX(u, y, 1, 1, 1, 1.0);
  const armax  = identifyARMAX(u, y, 1, 1, 1, 1, 1.0); // ARMAX(1,1,1) — over-parametrised
  assert(arx.aic < armax.aic,
    `Test 7: ARX AIC (${arx.aic.toFixed(1)}) < ARMAX AIC (${armax.aic.toFixed(1)}) for white equation-error noise`);
}

// Test 8: Colored MA(1) noise → ARMAX wins over ARX on AIC.
// Data generating model: y[k] = 0.7·y[k-1] + 0.4·u[k-1] + e[k] + 0.5·e[k-1]
// True structure is ARMAX(1,1,nc=1); ARX is mis-specified and should have higher AIC.
{
  setSeed(55);
  const N = 600;
  const u = generatePRBS(N, 8, 1.0);
  const e = Array.from({ length: N }, () => 0.2 * randn());
  const y = new Array(N).fill(0);
  for (let k = 1; k < N; k++)
    y[k] = 0.7 * y[k - 1] + 0.4 * u[k - 1] + e[k] + 0.5 * (e[k - 1] ?? 0);
  const arx   = identifyARX(u, y, 1, 1, 1, 1.0);
  const armax  = identifyARMAX(u, y, 1, 1, 1, 1, 1.0);
  assert(armax.aic < arx.aic,
    `Test 8: ARMAX AIC (${armax.aic.toFixed(1)}) < ARX AIC (${arx.aic.toFixed(1)}) for colored MA(1) noise`);
}

// ---------------------------------------------------------------------------
console.log('\n=== NSGA-II Tests ===\n');

// Use a 2nd-order underdamped plant: 1/(s²+0.4s+1) — creates genuine overshoot/settling trade-off
function makeSimplePlant() {
  return new TransferFunction([1], [1, 0.4, 1]);
}

// Test 7: nsga2TunePID returns paretoFront with at least 2 solutions
{
  setSeed(7);
  const plant = makeSimplePlant();
  // Use larger population for diversity — ensures multiple Pareto-optimal trade-offs
  const result = nsga2TunePID(plant, { populationSize: 40, generations: 15 });
  assert(Array.isArray(result.paretoFront) && result.paretoFront.length >= 2,
    `Test 7: paretoFront has >= 2 solutions (got ${result.paretoFront.length})`);
}

// Test 8: Pareto front solutions are non-dominated (pairwise check)
{
  setSeed(8);
  const plant = makeSimplePlant();
  const result = nsga2TunePID(plant, { populationSize: 24, generations: 10 });
  const pf = result.paretoFront;
  let dominated = false;
  for (let i = 0; i < pf.length && !dominated; i++) {
    for (let j = 0; j < pf.length && !dominated; j++) {
      if (i === j) continue;
      const a = pf[i].objectives;
      const b = pf[j].objectives;
      // Check if j dominates i (all b[k] <= a[k] and at least one strictly less)
      const allLE = a.every((_, k) => b[k] <= a[k]);
      const oneStrict = a.some((_, k) => b[k] < a[k]);
      if (allLE && oneStrict) dominated = true;
    }
  }
  assert(!dominated, 'Test 8: Pareto front solutions are mutually non-dominated');
}

// Test 9: All PID gains are non-negative
{
  setSeed(9);
  const plant = makeSimplePlant();
  const result = nsga2TunePID(plant, { populationSize: 20, generations: 8 });
  const allNonNeg = result.paretoFront.every(
    (s) => s.Kp >= 0 && s.Ki >= 0 && s.Kd >= 0
  );
  assert(allNonNeg, 'Test 9: All PID gains in Pareto front are non-negative');
}

// Test 10: Pareto front sorted by first objective (overshoot ascending)
{
  setSeed(10);
  const plant = makeSimplePlant();
  const result = nsga2TunePID(plant, { populationSize: 20, generations: 8 });
  const pf = result.paretoFront;
  let sorted = true;
  for (let i = 1; i < pf.length; i++) {
    if (pf[i].objectives[0] < pf[i - 1].objectives[0]) { sorted = false; break; }
  }
  assert(sorted, 'Test 10: Pareto front is sorted by first objective (overshoot) ascending');
}

// Test 11: history array has length == generations
{
  setSeed(11);
  const plant = makeSimplePlant();
  const gens = 12;
  const result = nsga2TunePID(plant, { populationSize: 20, generations: gens });
  assert(result.history.length === gens,
    `Test 11: history.length (${result.history.length}) equals generations (${gens})`);
}

// Test 12: All paretoFront objectives are finite
{
  setSeed(12);
  const plant = makeSimplePlant();
  const result = nsga2TunePID(plant, { populationSize: 20, generations: 8 });
  const allFinite = result.paretoFront.every((s) =>
    s.objectives.every((o) => Number.isFinite(o))
  );
  assert(allFinite, 'Test 12: All Pareto front objectives are finite');
}

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
}
