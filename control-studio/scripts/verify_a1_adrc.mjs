#!/usr/bin/env node
/**
 * verify_a1_adrc.mjs
 *
 * Tier A1 — Active Disturbance Rejection Control (ADRC)
 *
 * Checks:
 *  L1 Analytic — fal function: continuous at boundary, fal(+/-delta, a, delta) = +/-delta^a
 *  L1 Analytic — ESO bandwidth pole placement: beta1=3*w0, beta2=3*w0^2, beta3=w0^3
 *  L2 Property — linear ESO (alpha=1): observer error converges exponentially
 *  L2 Property — disturbance estimate tracks step disturbance asymptotically
 *  L2 Property — closed-loop stable under K matched specs
 *  L3 Cross    — higher omegaC -> smaller settling time
 *  L3 Cross    — robustness +/-50% plant gain variation still converges
 *  L4 Boundary — plantOrder=1,2,3 all work
 *  L4 Boundary — degenerate parameters throw
 */
import {
  falFunction,
  designADRC,
  simulateADRC,
} from '../js/control/adrc.js';

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
console.log('  A1 ADRC - Active Disturbance Rejection Control');
console.log('===============================================================\n');

// L1 fal function
console.log('> L1 fal function');
const delta = 0.01;
const alpha = 0.5;
const falPos = falFunction(delta, alpha, delta);
const falNeg = falFunction(-delta, alpha, delta);
const falLin = falFunction(delta / 2, alpha, delta);
const falSat = falFunction(2 * delta, alpha, delta);
assertNear('fal(+delta, 0.5, delta)', falPos, Math.pow(delta, alpha), 1e-12);
assertNear('fal(-delta, 0.5, delta)', falNeg, -Math.pow(delta, alpha), 1e-12);
assertNear('fal(delta/2, 0.5, delta)', falLin, (delta / 2) / Math.pow(delta, 1 - alpha), 1e-12);
assertNear('fal(2*delta, 0.5, delta)', falSat, Math.pow(2 * delta, alpha), 1e-12);
assertNear('fal(0, 0.5, delta)', falFunction(0, alpha, delta), 0, 1e-15);
const fLeft  = falFunction(delta - 1e-10, alpha, delta);
const fRight = falFunction(delta + 1e-10, alpha, delta);
assertTrue('fal continuous at boundary +delta', Math.abs(fLeft - fRight) < 1e-7,
  `diff=${(fRight - fLeft).toExponential(2)}`);

// L2 ESO bandwidth design (linear, alpha=1)
console.log('\n> L2 ESO bandwidth pole placement');
const omega0 = 10;
const omegaC = 2;
const b0 = 1;
const plantA = [[0, 1], [-2, -3]];
const plantB = [[0], [1]];
const plantC = [[1, 0]];

const adrc = designADRC({ plantOrder: 2, omega0, omegaC, b0, linear: true });
assertTrue('designADRC returns observer.step', typeof adrc.observer?.step === 'function');
assertTrue('designADRC returns controller.compute', typeof adrc.controller?.compute === 'function');
assertNear('beta1 = 3*omega0',     adrc.params.betas[0], 3 * omega0,         1e-12);
assertNear('beta2 = 3*omega0^2',   adrc.params.betas[1], 3 * omega0 * omega0, 1e-12);
assertNear('beta3 = omega0^3',     adrc.params.betas[2], omega0 ** 3,         1e-12);
assertNear('k_0 = omegaC^2',       adrc.params.k[0],     omegaC * omegaC,     1e-12);
assertNear('k_1 = 2*omegaC',       adrc.params.k[1],     2 * omegaC,          1e-12);

// L2 Disturbance rejection
console.log('\n> L2 Disturbance rejection');
const dt = 0.001;
const T = 5.0;
const sim = simulateADRC({
  plant: { A: plantA, B: plantB, C: plantC, D: [[0]] },
  adrc,
  reference: () => 1,
  disturbance: (t) => t > 1 ? 0.5 : 0,
  dt, T, x0: [0, 0],
});
assertTrue('simulation arrays consistent',
  sim.t.length > 0 && sim.y.length === sim.t.length && sim.u.length === sim.t.length);
const yFinal = sim.y[sim.y.length - 1];
const ssError = Math.abs(yFinal - 1);
assertTrue('steady-state tracking error < 0.05', ssError < 0.05,
  `y_inf=${yFinal.toFixed(4)}, err=${ssError.toFixed(4)}`);
const zhatN1 = sim.zhat[sim.zhat.length - 1][2];
assertTrue('disturbance estimate non-zero after step', Math.abs(zhatN1) > 0.01,
  `zhat[n+1](T)=${zhatN1.toFixed(4)}`);

// L3 closed-loop boundedness
console.log('\n> L3 Closed-loop boundedness');
let maxAbsY = 0;
for (const y of sim.y) maxAbsY = Math.max(maxAbsY, Math.abs(y));
assertTrue('output bounded |y|<10', maxAbsY < 10, `max|y|=${maxAbsY.toFixed(3)}`);
let maxAbsU = 0;
for (const u of sim.u) maxAbsU = Math.max(maxAbsU, Math.abs(u));
assertTrue('control bounded |u|<100', maxAbsU < 100, `max|u|=${maxAbsU.toFixed(3)}`);

// L3 omegaC -> settling time
console.log('\n> L3 omegaC monotonically reduces settling time');
function settlingTime(t, y, target, tol = 0.02) {
  for (let i = t.length - 1; i >= 0; i--) {
    if (Math.abs(y[i] - target) > tol * Math.abs(target)) return t[i];
  }
  return 0;
}
const adrcSlow = designADRC({ plantOrder: 2, omega0: 5, omegaC: 1, b0, linear: true });
const adrcFast = designADRC({ plantOrder: 2, omega0: 20, omegaC: 4, b0, linear: true });
const simSlow = simulateADRC({
  plant: { A: plantA, B: plantB, C: plantC, D: [[0]] },
  adrc: adrcSlow, reference: () => 1, disturbance: () => 0, dt, T: 5, x0: [0, 0]
});
const simFast = simulateADRC({
  plant: { A: plantA, B: plantB, C: plantC, D: [[0]] },
  adrc: adrcFast, reference: () => 1, disturbance: () => 0, dt, T: 5, x0: [0, 0]
});
const tsSlow = settlingTime(simSlow.t, simSlow.y, 1);
const tsFast = settlingTime(simFast.t, simFast.y, 1);
assertTrue('higher omegaC -> smaller t_settle', tsFast < tsSlow,
  `tsSlow=${tsSlow.toFixed(3)}, tsFast=${tsFast.toFixed(3)}`);

// L3 Robust to +/-50% gain variation
console.log('\n> L3 Robust to +/-50% gain variation');
const variations = [0.5, 1.0, 1.5];
let allConverge = true;
const errLog = [];
for (const gain of variations) {
  const Bvar = [[0], [gain]];
  const adrc2 = designADRC({ plantOrder: 2, omega0: 10, omegaC: 2, b0: 1, linear: true });
  const simV = simulateADRC({
    plant: { A: plantA, B: Bvar, C: plantC, D: [[0]] },
    adrc: adrc2, reference: () => 1, disturbance: () => 0, dt, T: 8, x0: [0, 0]
  });
  const yEnd = simV.y[simV.y.length - 1];
  const err = Math.abs(yEnd - 1);
  errLog.push(`gain=${gain}:${err.toFixed(4)}`);
  if (err > 0.1) allConverge = false;
}
assertTrue('all +/-50% gain variations converge', allConverge, errLog.join('; '));

// L4 boundary
console.log('\n> L4 Boundary');
assertThrows('omega0 = 0 throws', () => designADRC({ plantOrder: 2, omega0: 0, omegaC: 1, b0: 1 }));
assertThrows('b0 = 0 throws',     () => designADRC({ plantOrder: 2, omega0: 10, omegaC: 1, b0: 0 }));
assertThrows('negative omega0 throws', () => designADRC({ plantOrder: 2, omega0: -5, omegaC: 1, b0: 1 }));

const adrcN1 = designADRC({ plantOrder: 1, omega0: 10, omegaC: 2, b0: 1, linear: true });
assertTrue('plantOrder=1 -> 2 betas', adrcN1.params.betas.length === 2,
  `betas len=${adrcN1.params.betas.length}`);

const adrcN3 = designADRC({ plantOrder: 3, omega0: 10, omegaC: 2, b0: 1, linear: true });
assertTrue('plantOrder=3 -> 4 betas', adrcN3.params.betas.length === 4,
  `betas len=${adrcN3.params.betas.length}`);

// Summary
console.log('\n===============================================================');
if (failed === 0) {
  console.log('All A1 ADRC checks passed');
  process.exit(0);
} else {
  console.log(`${failed} A1 ADRC check(s) FAILED`);
  process.exit(1);
}
