#!/usr/bin/env node
/**
 * Verification: EKF and UKF implementation (ekf.js)
 *
 * Tests:
 *   1. numericalJacobian accuracy on a known nonlinear function
 *   2. simulateEKF on a linear 2-state system converges (final error < 0.5)
 *   3. simulateUKF on the same system converges (final error < 0.5)
 *   4. All innovations are finite
 *   5. runLinearEKF convenience wrapper (EKF and UKF modes)
 */

import { numericalJacobian, simulateEKF, simulateUKF, runLinearEKF } from '../js/control/ekf.js';
import { setSeed } from '../js/math/rng.js';
import { discretizeZOH } from '../js/control/state-feedback.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function assertClose(a, b, tol, label) {
  const ok = Math.abs(a - b) <= tol;
  assert(ok, label, `got ${a}, expected ≈ ${b} (tol ${tol})`);
}

// ---------------------------------------------------------------------------
// 1. numericalJacobian
// ---------------------------------------------------------------------------
console.log('\n[1] numericalJacobian');

// f(x) = [x0^2 + x1, x0 - x1]  →  J at [1,1] = [[2,1],[1,-1]]
const f_test = (x) => [x[0] * x[0] + x[1], x[0] - x[1]];
const J = numericalJacobian(f_test, [1, 1]);

assertClose(J[0][0], 2,  1e-4, 'J[0][0] ≈ 2');
assertClose(J[0][1], 1,  1e-4, 'J[0][1] ≈ 1');
assertClose(J[1][0], 1,  1e-4, 'J[1][0] ≈ 1');
assertClose(J[1][1], -1, 1e-4, 'J[1][1] ≈ -1');

// ---------------------------------------------------------------------------
// Build a simple 2-state linear discrete model for EKF/UKF tests
// Continuous: double integrator-like  A=[[0,1],[0,-0.5]], B=[[0],[1]], C=[[1,0]]
// ---------------------------------------------------------------------------
const Ac = [[0, 1], [0, -0.5]];
const Bc = [[0], [1]];
const Cc = [[1, 0]];
const Ts = 0.1;
const { Ad, Bd } = discretizeZOH(Ac, Bc, Ts);
const Cd = Cc;

const N = 80;
const uSeq = Array.from({ length: N }, (_, k) => [k < 5 ? 0 : 1]);

const Q = [[0.01, 0], [0, 0.01]];
const R = [[1]];
const P0 = [[1, 0], [0, 1]];
const x0hat = [0, 0];

// Define f and h for simulateEKF / simulateUKF
const f_lin = (x, u) => {
  return [
    Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0][0] * u[0],
    Ad[1][0] * x[0] + Ad[1][1] * x[1] + Bd[1][0] * u[0],
  ];
};
const h_lin = (x) => [Cd[0][0] * x[0] + Cd[0][1] * x[1]];

// Simulate a noisy measurement sequence to test against
setSeed(42);
const ekfHelper = runLinearEKF({ Ad, Bd, Cd }, uSeq, Q, R, { useUKF: false });
const ySeq = ekfHelper.y;
const xTrueRef = ekfHelper.xTrue;

// ---------------------------------------------------------------------------
// 2. simulateEKF convergence
// ---------------------------------------------------------------------------
console.log('\n[2] simulateEKF convergence');
setSeed(42);

const ekfResult = simulateEKF(f_lin, h_lin, uSeq, ySeq, Q, R, P0, x0hat, {
  Fjacobian: () => Ad,
  Hjacobian: () => Cd,
});

const ekfFinalErr0 = Math.abs(ekfResult.xhat[N - 1][0] - xTrueRef[N - 1][0]);
const ekfFinalErr1 = Math.abs(ekfResult.xhat[N - 1][1] - xTrueRef[N - 1][1]);

assert(ekfFinalErr0 < 0.5, `EKF x₁ final error < 0.5`, `got ${ekfFinalErr0.toFixed(4)}`);
assert(ekfFinalErr1 < 0.5, `EKF x₂ final error < 0.5`, `got ${ekfFinalErr1.toFixed(4)}`);
assert(ekfResult.xhat.length === N, 'EKF xhat length matches N');

// ---------------------------------------------------------------------------
// 3. simulateUKF convergence
// ---------------------------------------------------------------------------
console.log('\n[3] simulateUKF convergence');
setSeed(42);

const ukfResult = simulateUKF(f_lin, h_lin, uSeq, ySeq, Q, R, P0, x0hat);

const ukfFinalErr0 = Math.abs(ukfResult.xhat[N - 1][0] - xTrueRef[N - 1][0]);
const ukfFinalErr1 = Math.abs(ukfResult.xhat[N - 1][1] - xTrueRef[N - 1][1]);

assert(ukfFinalErr0 < 0.5, `UKF x₁ final error < 0.5`, `got ${ukfFinalErr0.toFixed(4)}`);
assert(ukfFinalErr1 < 0.5, `UKF x₂ final error < 0.5`, `got ${ukfFinalErr1.toFixed(4)}`);
assert(ukfResult.xhat.length === N, 'UKF xhat length matches N');

// ---------------------------------------------------------------------------
// 4. Innovations are all finite
// ---------------------------------------------------------------------------
console.log('\n[4] Innovations are finite');

const ekfInnovFinite = ekfResult.innovations.every(iv => iv.every(Number.isFinite));
const ukfInnovFinite = ukfResult.innovations.every(iv => iv.every(Number.isFinite));

assert(ekfInnovFinite, 'EKF innovations all finite');
assert(ukfInnovFinite, 'UKF innovations all finite');

// ---------------------------------------------------------------------------
// 5. runLinearEKF convenience wrapper
// ---------------------------------------------------------------------------
console.log('\n[5] runLinearEKF convenience wrapper');
setSeed(7);

const ekfConv = runLinearEKF({ Ad, Bd, Cd }, uSeq, Q, R, { useUKF: false });
assert(ekfConv.xhat.length === N, 'runLinearEKF EKF: xhat length');
assert(ekfConv.xTrue.length === N, 'runLinearEKF EKF: xTrue length');
assert(ekfConv.t.length === N, 'runLinearEKF EKF: t length');
assert(Array.isArray(ekfConv.innovations), 'runLinearEKF EKF: innovations is array');

setSeed(7);
const ukfConv = runLinearEKF({ Ad, Bd, Cd }, uSeq, Q, R, { useUKF: true });
assert(ukfConv.xhat.length === N, 'runLinearEKF UKF: xhat length');
assert(ukfConv.innovations.every(iv => iv.every(Number.isFinite)), 'runLinearEKF UKF: innovations finite');

// Check final error for convenience wrapper (EKF)
const convErr0 = Math.abs(ekfConv.xhat[N - 1][0] - ekfConv.xTrue[N - 1][0]);
assert(convErr0 < 1.0, `runLinearEKF EKF: final x₁ error < 1.0`, `got ${convErr0.toFixed(4)}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`EKF/UKF verification: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
