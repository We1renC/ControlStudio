#!/usr/bin/env node
/**
 * verify_a4_backstepping.mjs - Tier A4 backstepping verification.
 */

import {
  designBackstepping,
  simulateBackstepping,
  verifyBackstepping,
} from '../js/control/backstepping.js';

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

function norm(x) {
  return Math.sqrt(x.reduce((sum, value) => sum + value * value, 0));
}

function final(arr) {
  return arr[arr.length - 1];
}

function countIncreases(values, tol = 1e-9) {
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1] + tol) count++;
  }
  return count;
}

console.log('\n=== Tier A4: Backstepping ===\n');

// Test 1: static Lyapunov metadata is negative definite for positive gains.
{
  const design = designBackstepping({
    plantModel: { order: 3, f3: () => 0, g: () => 1 },
    gains: [2, 3, 4],
  });
  const proof = verifyBackstepping(design);
  ok('Test 1: verifyBackstepping reports negative-definite Vdot',
    proof.isNegDef && proof.VdotExpression.includes('-k1*z1^2'),
    proof.VdotExpression);
  ok('Test 1: global region is reported for supported normal form',
    proof.regionOfAttraction.includes('global'),
    proof.regionOfAttraction);
}

// Test 2: third-order chain integrator with terminal triangular drift stabilizes.
{
  const f3 = (x) => 0.2 * Math.sin(x[0]) + 0.05 * x[1] * x[1];
  const design = designBackstepping({
    plantModel: { order: 3, f3, g: () => 1 },
    gains: [2.2, 3.0, 4.0],
  });
  const sim = simulateBackstepping(design, {
    x0: [1.2, -0.4, 0.6],
    dt: 0.001,
    T: 6,
    f3,
    g: () => 1,
  });
  const endNorm = norm(final(sim.x));
  const endZ = norm(final(sim.z));
  ok('Test 2: triangular third-order plant state converges near origin',
    endNorm < 0.02,
    `||x(T)||=${endNorm.toExponential(3)}`);
  ok('Test 2: transformed z coordinates converge near zero',
    endZ < 0.03,
    `||z(T)||=${endZ.toExponential(3)}`);
}

// Test 3: Lyapunov function is monotonically decreasing after the first sample.
{
  const f3 = (x) => 0.15 * Math.sin(x[0]);
  const design = designBackstepping({
    plantModel: { order: 3, f3, g: () => 1 },
    gains: [2, 2.5, 3.5],
  });
  const sim = simulateBackstepping(design, {
    x0: [0.8, 0.2, -0.5],
    dt: 0.0005,
    T: 2.5,
    f3,
  });
  const increases = countIncreases(sim.V.slice(5), 2e-5);
  ok('Test 3: V decreases along closed-loop trajectory',
    increases === 0 && final(sim.V) < 0.05 * sim.V[0],
    `increases=${increases}, V0=${sim.V[0].toExponential(3)}, Vend=${final(sim.V).toExponential(3)}`);
}

// Test 4: compare with feedback-linearized pole-placement controller.
{
  const f3 = (x) => 0.1 * Math.sin(x[0]) - 0.05 * x[2];
  const x0 = [1.0, 0.1, -0.2];
  const dt = 0.001;
  const T = 5;
  const design = designBackstepping({
    plantModel: { order: 3, f3, g: () => 1 },
    gains: [2.5, 3.0, 3.5],
  });
  const bs = simulateBackstepping(design, { x0, dt, T, f3 });

  let x = x0.slice();
  const polePlaced = [];
  const gains = [24, 26, 9]; // (s+2)(s+3)(s+4)
  const steps = Math.floor(T / dt) + 1;
  for (let k = 0; k < steps; k++) {
    polePlaced.push(x.slice());
    const u = -gains[0] * x[0] - gains[1] * x[1] - gains[2] * x[2] - f3(x);
    if (k === steps - 1) break;
    x = [
      x[0] + dt * x[1],
      x[1] + dt * x[2],
      x[2] + dt * (f3(x) + u),
    ];
  }
  const bsNorm = norm(final(bs.x));
  const fblNorm = norm(final(polePlaced));
  ok('Test 4: backstepping tracking is comparable to feedback linearization',
    bsNorm < 0.04 && fblNorm < 0.04,
    `backstepping=${bsNorm.toExponential(3)}, fbl=${fblNorm.toExponential(3)}`);
}

// Test 5: adaptive backstepping estimates an unknown matched parameter.
{
  const thetaTrue = 1.2;
  const phi = (x) => x[0];
  const design = designBackstepping({
    plantModel: { phi },
    gains: [2.0, 3.0],
    adaptive: true,
    thetaInit: 0,
    gamma: 2,
  });
  const sim = simulateBackstepping(design, {
    x0: [1.0, 0.0],
    dt: 0.001,
    T: 8,
    theta: thetaTrue,
    phi,
  });
  const endX = norm(final(sim.x));
  const endTheta = final(sim.thetaHat);
  ok('Test 5: adaptive backstepping stabilizes the uncertain plant',
    endX < 0.03,
    `||x(T)||=${endX.toExponential(3)}`);
  ok('Test 5: thetaHat moves toward the true parameter under excitation',
    Math.abs(thetaTrue - endTheta) < 0.3,
    `thetaHat=${endTheta.toFixed(4)}, theta=${thetaTrue}`);
}

// Test 6: validation guards.
{
  let badGain = false, badOrder = false, badG = false, badAdaptiveGamma = false;
  try { designBackstepping({ plantModel: { order: 3 }, gains: [1, -1, 1] }); } catch { badGain = true; }
  try { designBackstepping({ plantModel: { order: 4 }, gains: [1, 1, 1, 1] }); } catch { badOrder = true; }
  try {
    const design = designBackstepping({ plantModel: { order: 3, g: () => 0 }, gains: [1, 1, 1] });
    design.controlLaw([1, 0, 0]);
  } catch { badG = true; }
  try { designBackstepping({ plantModel: {}, gains: [1, 1], adaptive: true, gamma: 0 }); } catch { badAdaptiveGamma = true; }
  ok('Test 6: non-positive gain throws', badGain);
  ok('Test 6: unsupported non-adaptive order throws', badOrder);
  ok('Test 6: zero input gain throws at control evaluation', badG);
  ok('Test 6: non-positive adaptive gamma throws', badAdaptiveGamma);
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`A4 backstepping verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.');
