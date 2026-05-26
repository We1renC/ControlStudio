#!/usr/bin/env node
/**
 * verify_a3_smc.mjs - Tier A3 SMC + super-twisting verification.
 */

import {
  designSMC,
  simulateSMC,
  analyzeChattering,
} from '../js/control/smc.js';

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

function maxAbs(arr) {
  return Math.max(...arr.map(v => Math.abs(v)));
}

function meanAbsTail(arr, n) {
  const tail = arr.slice(-n);
  return tail.reduce((sum, v) => sum + Math.abs(v), 0) / tail.length;
}

function makeTime(T, dt) {
  return Array.from({ length: Math.floor(T / dt) + 1 }, (_, k) => k * dt);
}

console.log('\n=== Tier A3: SMC + Super-twisting ===\n');

const plant = { a: 0, b: 1 };
const surface = { c: 2.0 };
const disturbanceBound = 0.35;
const disturbance = (t) => 0.25 + 0.05 * Math.sin(1.5 * t);
const t = makeTime(5.0, 0.001);

// Test 1: gain design obeys super-twisting sufficient inequalities.
{
  const smc = designSMC({
    plant,
    slidingSurface: surface,
    disturbanceBound,
    variant: 'superTwisting',
  });
  ok('Test 1: k1 > sqrt(2L)',
    smc.gains.k1 > Math.sqrt(2 * disturbanceBound),
    `k1=${smc.gains.k1.toFixed(4)}, min=${Math.sqrt(2 * disturbanceBound).toFixed(4)}`);
  ok('Test 1: k2 > L',
    smc.gains.k2 > disturbanceBound,
    `k2=${smc.gains.k2.toFixed(4)}, L=${disturbanceBound}`);
}

// Test 2: double integrator with bounded disturbance reaches sliding surface.
{
  const smc = designSMC({
    plant,
    slidingSurface: surface,
    disturbanceBound,
    variant: 'classical',
    K: 1.2,
  });
  const sim = simulateSMC(plant, smc, 0, t, {
    x0: [2, 0],
    disturbance,
    slidingTol: 0.03,
  });
  const s0 = Math.abs(sim.s[0]);
  const tail = meanAbsTail(sim.s, 500);
  const bound = smc.reachingTime(sim.s[0]);
  ok('Test 2: classical SMC reaches sliding surface under disturbance',
    tail < 0.035,
    `meanTail|s|=${tail.toExponential(3)}, s0=${s0.toFixed(3)}`);
  ok('Test 2: reaching time bound is finite and conservative',
    Number.isFinite(bound) && bound > 0 && bound < 8,
    `bound=${bound.toFixed(3)}s`);
}

// Test 3: super-twisting converges and produces a continuous low-chatter input.
{
  const smc = designSMC({
    plant,
    slidingSurface: surface,
    disturbanceBound,
    variant: 'superTwisting',
    k1: 1.35,
    k2: 0.75,
  });
  const dtFast = 0.0001;
  const tFast = makeTime(5.0, dtFast);
  const sim = simulateSMC(plant, smc, 0, tFast, {
    x0: [1.5, -0.5],
    disturbance,
    slidingTol: 0.03,
  });
  const tail = meanAbsTail(sim.s, 5000);
  const settledU = sim.u.slice(5000);
  const chatter = analyzeChattering(settledU, dtFast);
  const maxStep = Math.max(...settledU.slice(1).map((v, i) => Math.abs(v - settledU[i])));
  ok('Test 3: super-twisting reaches |s| < 0.03 on average',
    tail < 0.03,
    `meanTail|s|=${tail.toExponential(3)}`);
  ok('Test 3: super-twisting chatterIndex < 0.05',
    chatter.chatterIndex < 0.05,
    `chatterIndex=${chatter.chatterIndex.toExponential(3)}`);
  ok('Test 3: super-twisting control input is numerically continuous',
    maxStep < 0.02,
    `max|du|=${maxStep.toExponential(3)}`);
}

// Test 4: boundary-layer thickness reduces chatter at the cost of larger residual s.
{
  const thin = designSMC({
    plant,
    slidingSurface: surface,
    disturbanceBound,
    variant: 'boundaryLayer',
    K: 1.2,
    Phi: 0.02,
  });
  const thick = designSMC({
    plant,
    slidingSurface: surface,
    disturbanceBound,
    variant: 'boundaryLayer',
    K: 1.2,
    Phi: 0.45,
  });
  const thinSim = simulateSMC(plant, thin, 0, t, { x0: [1.2, 0.0], disturbance });
  const thickSim = simulateSMC(plant, thick, 0, t, { x0: [1.2, 0.0], disturbance });
  const thinChat = analyzeChattering(thinSim.u.slice(500), 0.001).chatterIndex;
  const thickChat = analyzeChattering(thickSim.u.slice(500), 0.001).chatterIndex;
  const thinTail = meanAbsTail(thinSim.s, 500);
  const thickTail = meanAbsTail(thickSim.s, 500);
  ok('Test 4: thicker boundary layer lowers chatterIndex',
    thickChat < thinChat,
    `thin=${thinChat.toExponential(3)}, thick=${thickChat.toExponential(3)}`);
  ok('Test 4: thicker boundary layer allows larger residual surface band',
    thickTail > thinTail,
    `thinTail=${thinTail.toExponential(3)}, thickTail=${thickTail.toExponential(3)}`);
}

// Test 5: analyzeChattering separates switching from smooth signals.
{
  const square = Array.from({ length: 200 }, (_, k) => (k % 2 === 0 ? 1 : -1));
  const smooth = Array.from({ length: 200 }, (_, k) => Math.sin(0.01 * k));
  const cSquare = analyzeChattering(square, 0.01).chatterIndex;
  const cSmooth = analyzeChattering(smooth, 0.01).chatterIndex;
  ok('Test 5: square-wave chatter index exceeds smooth sinusoid',
    cSquare > 100 * cSmooth,
    `square=${cSquare.toExponential(3)}, smooth=${cSmooth.toExponential(3)}`);
}

// Test 6: argument validation and reachability guard.
{
  let badL = false, badVariant = false, badB = false, badGain = false, badPhi = false;
  try { designSMC({ plant, slidingSurface: surface, disturbanceBound: 0 }); } catch { badL = true; }
  try { designSMC({ plant, slidingSurface: surface, disturbanceBound, variant: 'bad' }); } catch { badVariant = true; }
  try { designSMC({ plant: { a: 0, b: 0 }, slidingSurface: surface, disturbanceBound }); } catch { badB = true; }
  try { designSMC({ plant, slidingSurface: surface, disturbanceBound, variant: 'superTwisting', k1: 0.2, k2: 0.8 }); } catch { badGain = true; }
  try { designSMC({ plant, slidingSurface: surface, disturbanceBound, variant: 'boundaryLayer', Phi: 0 }); } catch { badPhi = true; }
  ok('Test 6: disturbanceBound <= 0 throws', badL);
  ok('Test 6: unknown variant throws', badVariant);
  ok('Test 6: zero plant input gain throws', badB);
  ok('Test 6: insufficient super-twisting gain throws', badGain);
  ok('Test 6: non-positive Phi throws', badPhi);
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`A3 SMC verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.');
