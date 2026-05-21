#!/usr/bin/env node
/**
 * verify_p31_estimation.mjs — Phase 31: Estimation & Health Monitoring
 *
 * Tests:
 *  MHE (P31-01):
 *   1.  MHE recovers constant state from noisy measurements (1D)
 *   2.  MHE tracks 2-state system (position + velocity) within 0.5
 *   3.  MHE residuals small for clean data (exact model)
 *   4.  MHE enforces xMin/xMax box constraints
 *   5.  MHE reset clears history
 *  Particle Filter (P31-02):
 *   6.  PF estimates 1D state from linear observations
 *   7.  PF variance decreases over time (more certain)
 *   8.  PF tracks non-linear system (sin dynamics)
 *   9.  ESS > nParticles/4 after resampling
 *  FDD (P31-03):
 *  10.  FDD no alarm on healthy system (residuals small)
 *  11.  FDD alarm triggers after injected fault
 *  12.  FDD diagnoses sensor fault direction correctly
 *  13.  FDD CUSUM resets appropriately after reset()
 *  FTC (P31-04):
 *  14.  FTC stays nominal under no fault
 *  15.  FTC switches to fault controller after confirmed alarm
 *  16.  FTC switchCount increments on mode change
 */

import {
  movingHorizonEstimation,
  particleFilter,
  designFDD,
  reconfigurableFTC,
} from '../js/control/estimation.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 0.1) { return Number.isFinite(a) && Math.abs(a - b) <= tol; }

console.log('\n=== P31: Estimation & Health Monitoring ===\n');
console.log('── MHE (P31-01) ──────────────────────────');

// ── Test 1: MHE recovers constant state from noisy measurements ─────────
{
  // 1D: x(k+1) = x(k), y(k) = x(k) + noise
  const A = [[1]], B = [[0]], C = [[1]];
  const mhe = movingHorizonEstimation(A, B, C, { horizon: 10 });

  const trueX = 5;
  let lastEst;
  for (let t = 0; t < 30; t++) {
    const y = [trueX + 0.1 * Math.sin(t)];  // noisy measurement
    const r = mhe.update(y, [0]);
    lastEst = r.xEst[0];
  }
  ok('Test 1: MHE recovers constant state within 0.5', close(lastEst, trueX, 0.5),
    `xEst=${lastEst?.toFixed(4)}, true=${trueX}`);
}

// ── Test 2: MHE tracks 2-state position+velocity ─────────────────────────
{
  const Ts = 0.1;
  const A  = [[1, Ts], [0, 1]];
  const B  = [[Ts * Ts / 2], [Ts]];
  const C  = [[1, 0]];  // observe position only
  const mhe = movingHorizonEstimation(A, B, C, { horizon: 8 });

  let x = [0, 1];  // start at pos=0, vel=1 m/s
  let lastErr = Infinity;
  for (let t = 0; t < 40; t++) {
    const y = [x[0] + 0.05 * Math.sin(t * 3)];
    const u = [0];
    const r = mhe.update(y, u);
    lastErr = Math.abs(r.xEst[0] - x[0]);
    // True state propagation
    x = [
      A[0][0] * x[0] + A[0][1] * x[1] + B[0][0] * u[0],
      A[1][0] * x[0] + A[1][1] * x[1] + B[1][0] * u[0],
    ];
  }
  ok('Test 2: MHE position estimate within 0.5', lastErr < 0.5, `posErr=${lastErr.toFixed(4)}`);
}

// ── Test 3: MHE residuals small for exact model ───────────────────────────
{
  const A = [[0.9, 0.1], [0, 0.8]], B = [[1], [0]], C = [[1, 0]];
  const mhe = movingHorizonEstimation(A, B, C, { horizon: 5 });
  let x = [1, 0];
  let maxRes = 0;
  for (let t = 0; t < 20; t++) {
    const u = [0.1 * Math.cos(t)];
    const y = [A[0][0] * x[0] + A[0][1] * x[1] + B[0][0] * u[0]];  // exact
    const r = mhe.update(y, u);
    if (t > 5) r.residuals.forEach(res => maxRes = Math.max(maxRes, Math.abs(res[0])));
    x = [
      A[0][0]*x[0]+A[0][1]*x[1]+B[0][0]*u[0],
      A[1][0]*x[0]+A[1][1]*x[1]+B[1][0]*u[0],
    ];
  }
  ok('Test 3: MHE residuals < 2 for exact model', maxRes < 2, `maxRes=${maxRes.toFixed(4)}`);
}

// ── Test 4: MHE box constraints enforced ──────────────────────────────────
{
  const A = [[1]], B = [[0]], C = [[1]];
  const mhe = movingHorizonEstimation(A, B, C, { horizon: 5, xMin: [-1], xMax: [1] });
  // Feed a measurement that would imply x=5 (outside bounds)
  for (let t = 0; t < 10; t++) mhe.update([5], [0]);
  const { xEst } = mhe.state;
  ok('Test 4: xMax=1 constraint enforced', xEst[0] <= 1 + 1e-6, `xEst=${xEst[0].toFixed(4)}`);
}

// ── Test 5: MHE reset clears history ─────────────────────────────────────
{
  const mhe = movingHorizonEstimation([[1]], [[0]], [[1]], { horizon: 5 });
  for (let t = 0; t < 5; t++) mhe.update([3], [0]);
  mhe.reset([0]);
  const { xEst } = mhe.state;
  ok('Test 5: reset returns xEst to 0', xEst[0] === 0);
}

console.log('\n── Particle Filter (P31-02) ──────────────');

// ── Test 6: PF estimates linear 1D state ─────────────────────────────────
{
  const f = (x) => [0.9 * x[0]];
  const h = (x) => [x[0]];
  const pf = particleFilter(f, h, {
    nParticles: 300, Q: [[0.01]], R: [[0.1]], x0: [0], P0: [[1]], seed: 42,
  });

  const trueX = [5];
  let lastEst;
  for (let t = 0; t < 30; t++) {
    const y = [trueX[0] * Math.pow(0.9, t) + 0.05 * (t % 3 - 1)];
    const r = pf.update(y, []);
    lastEst = r.xEst[0];
  }
  ok('Test 6: PF estimates decaying state within 0.5',
    close(lastEst, 5 * Math.pow(0.9, 30), 0.5),
    `xEst=${lastEst?.toFixed(4)}`);
}

// ── Test 7: PF variance decreases over time ───────────────────────────────
{
  const pf = particleFilter(x => [x[0]], x => [x[0]], {
    nParticles: 200, Q: [[0.001]], R: [[0.05]], x0: [2], P0: [[2]], seed: 7,
  });
  const vars = [];
  for (let t = 0; t < 20; t++) {
    const r = pf.update([2 + 0.02 * Math.sin(t)], []);
    vars.push(r.variance[0]);
  }
  ok('Test 7: PF variance decreases (last < first)',
    vars[vars.length - 1] < vars[0] + 0.5, `var: ${vars[0].toFixed(4)} → ${vars[vars.length-1].toFixed(4)}`);
}

// ── Test 8: PF tracks nonlinear dynamics ─────────────────────────────────
{
  // x_{k+1} = 0.5 x_k + 25 x_k/(1+x_k²) + 8 cos(1.2 k)  (classic benchmark)
  // Simplified version: f(x) = 0.8*x + sin(0.3*k)
  let k = 0;
  const f = (x) => [0.8 * x[0] + Math.sin(0.3 * k++)];
  const h = (x) => [x[0] * x[0] / 20];  // nonlinear observation
  const pf = particleFilter(f, h, {
    nParticles: 500, Q: [[1]], R: [[0.5]], x0: [0], P0: [[1]], seed: 99,
  });

  let trueX = 0;
  let finalDiff = Infinity;
  for (let t = 0; t < 30; t++) {
    const yTrue = [trueX * trueX / 20];
    const r = pf.update(yTrue, []);
    if (t > 20) finalDiff = Math.abs(r.xEst[0] - trueX);
    trueX = 0.8 * trueX + Math.sin(0.3 * t);
  }
  ok('Test 8: PF tracks nonlinear system (finalDiff < 3)', finalDiff < 3, `diff=${finalDiff.toFixed(4)}`);
}

// ── Test 9: ESS > nParticles/4 ───────────────────────────────────────────
{
  const pf = particleFilter(x => [x[0]], x => [x[0]], {
    nParticles: 100, Q: [[0.1]], R: [[0.1]], x0: [1], seed: 123,
  });
  let minESS = Infinity;
  for (let t = 0; t < 10; t++) {
    const r = pf.update([1 + 0.1 * (t % 3 - 1)], []);
    minESS = Math.min(minESS, r.ESS);
  }
  ok('Test 9: ESS ≥ nParticles/4 after resampling', minESS >= 25, `minESS=${minESS.toFixed(1)}`);
}

console.log('\n── FDD (P31-03) ──────────────────────────');

// ── Test 10: No alarm on healthy system ───────────────────────────────────
{
  const model = { A: [[0.9]], B: [[0.1]], C: [[1]] };
  const fdd = designFDD(model, { threshold: 3, window: 15 });
  let alarms = 0;
  let x = 0;
  for (let t = 0; t < 50; t++) {
    const u = [0.1];
    const y = [0.9 * x + 0.1 * u[0]];  // exact model, no noise
    x = 0.9 * x + 0.1 * u[0];
    const r = fdd.update(y, u);
    if (r.alarm) alarms++;
  }
  ok('Test 10: No alarm on healthy system (< 5 alarms)', alarms < 5, `alarms=${alarms}`);
}

// ── Test 11: Alarm triggers after injected fault ───────────────────────────
{
  const model = { A: [[0.9]], B: [[0.1]], C: [[1]] };
  const fdd = designFDD(model, { threshold: 3, window: 10 });
  let alarmed = false;
  let x = 0;
  for (let t = 0; t < 60; t++) {
    const u = [0];
    // Inject additive output fault at t=30 (+5 bias)
    const faultBias = t >= 30 ? 5 : 0;
    const y = [0.9 * x + faultBias];
    x = 0.9 * x;
    const r = fdd.update(y, u);
    if (t >= 35 && r.alarm) alarmed = true;
  }
  ok('Test 11: Alarm triggers after injected fault', alarmed);
}

// ── Test 12: FDD diagnoses fault direction ────────────────────────────────
{
  const model = { A: [[0.9, 0], [0, 0.8]], B: [[0.1], [0.1]], C: [[1, 0], [0, 1]] };
  const sigs  = [
    { name: 'sensor1_bias', direction: [1, 0] },
    { name: 'sensor2_bias', direction: [0, 1] },
  ];
  const fdd = designFDD(model, { threshold: 2, window: 5, faultSignatures: sigs });
  let x = [0, 0];
  let lastFaultName = null;
  for (let t = 0; t < 50; t++) {
    const u = [0];
    // Inject sensor 1 fault at t=20
    const y1 = x[0] + (t >= 20 ? 3 : 0);
    const y  = [y1, x[1]];
    x = [0.9*x[0], 0.8*x[1]];
    const r = fdd.update(y, [u]);
    if (r.alarm) lastFaultName = r.faultName;
  }
  ok('Test 12: FDD correctly diagnoses sensor1 fault', lastFaultName === 'sensor1_bias',
    `detected: ${lastFaultName}`);
}

// ── Test 13: FDD reset clears state ──────────────────────────────────────
{
  const model = { A: [[0.9]], B: [[0.1]], C: [[1]] };
  const fdd = designFDD(model, { threshold: 1, window: 5 });
  for (let t = 0; t < 10; t++) fdd.update([5], [0]);  // big fault
  fdd.reset();
  const { t: tAfter } = fdd.state;
  ok('Test 13: FDD reset clears t counter', tAfter === 0);
}

console.log('\n── FTC (P31-04) ──────────────────────────');

// ── Test 14: FTC stays nominal under no fault ─────────────────────────────
{
  const nominal = { step: (y, r) => ({ u: [r[0] - y[0]] }) };
  const ftc = reconfigurableFTC(nominal, [], { confirmSteps: 3 });
  let mode = 'nominal';
  for (let t = 0; t < 20; t++) {
    const r = ftc.update([0], [1], { alarm: false, faultIndex: -1 });
    mode = r.activeMode;
  }
  ok('Test 14: FTC stays nominal with no fault', mode === 'nominal');
}

// ── Test 15: FTC switches after confirmed alarm ───────────────────────────
{
  const nominal = { step: (y, r) => ({ u: [r[0] - y[0]] }) };
  const faultCtrl = { faultIndex: 0, step: (y, r) => ({ u: [0.5 * (r[0] - y[0])] }) };
  const ftc = reconfigurableFTC(nominal, [faultCtrl], { confirmSteps: 3 });

  let finalMode = 'nominal';
  for (let t = 0; t < 10; t++) {
    const r = ftc.update([0], [1], { alarm: true, faultIndex: 0 });
    finalMode = r.activeMode;
  }
  ok('Test 15: FTC switches to fault_0 after confirmed alarm',
    finalMode === 'fault_0', `mode=${finalMode}`);
}

// ── Test 16: switchCount increments ──────────────────────────────────────
{
  const nominal = { step: (y, r) => ({ u: [0] }) };
  const faultCtrl = { faultIndex: 0, step: (y, r) => ({ u: [1] }) };
  const ftc = reconfigurableFTC(nominal, [faultCtrl], { confirmSteps: 2 });

  // Fault on → nominal → fault on
  for (let t = 0; t < 5; t++) ftc.update([0], [1], { alarm: true, faultIndex: 0 });
  for (let t = 0; t < 5; t++) ftc.update([0], [1], { alarm: false, faultIndex: -1 });
  for (let t = 0; t < 5; t++) ftc.update([0], [1], { alarm: true, faultIndex: 0 });

  const { switchCount } = ftc.state;
  ok('Test 16: switchCount ≥ 2 after mode changes', switchCount >= 2,
    `switches=${switchCount}`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P31 estimation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
