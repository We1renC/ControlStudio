#!/usr/bin/env node
/**
 * verify_flatness.mjs — Zero-Flaw Loop 1 verification for differential
 * flatness baseline (Fliess-Lévine-Martin-Rouchon).
 */

import {
  certifyLinearFlatness, flatPolynomialTrajectory,
  recoverFromFlatTrajectory, planFlatTrajectorySISO,
} from '../js/control/flatness.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── Case 1: double integrator is flat ─────────────────────────────────────
{
  const A = [[0, 1], [0, 0]];
  const B = [[0], [1]];
  const cert = certifyLinearFlatness(A, B);
  ok('flat: double integrator flat (controllable + observable)', cert.flat);
  ok('flat: observability rank = 2', cert.observabilityRank === 2);
}

// ── Case 2: uncontrollable system not flat ────────────────────────────────
{
  const A = [[0, 1], [0, 0]];
  const B = [[0], [0]];
  const cert = certifyLinearFlatness(A, B);
  ok('flat: uncontrollable system rejected', !cert.flat);
}

// ── Case 3: boundary conditions exactly satisfied by polynomial ───────────
{
  // Rest-to-rest in 4 s, n=2: z(0)=0, ż(0)=0, z(T)=10, ż(T)=0.
  const T = 4;
  const traj = flatPolynomialTrajectory([0, 0], [10, 0], T);
  ok('flat poly: z(0) = 0', Math.abs(traj.evaluate(0) - 0) < 1e-10);
  ok('flat poly: ż(0) = 0', Math.abs(traj.evaluateDerivative(0, 1)) < 1e-10);
  ok('flat poly: z(T) = 10', Math.abs(traj.evaluate(T) - 10) < 1e-10);
  ok('flat poly: ż(T) = 0', Math.abs(traj.evaluateDerivative(T, 1)) < 1e-10);
  // 2n-1 = 3 → cubic polynomial
  ok('flat poly: degree = 2n-1 = 3', traj.coefficients.length === 4);
}

// ── Case 4: state/input recovery shape ─────────────────────────────────────
{
  const T = 1.0;
  const traj = flatPolynomialTrajectory([0, 0], [1, 0], T);
  const profile = recoverFromFlatTrajectory(traj, 2, { samples: 11 });
  ok('flat recovery: t length = 11', profile.t.length === 11);
  ok('flat recovery: x[i] has 2 entries', profile.x[5].length === 2);
  ok('flat recovery: x[0] = [0, 0]', Math.abs(profile.x[0][0]) < 1e-10 && Math.abs(profile.x[0][1]) < 1e-10);
  ok('flat recovery: x[last] = [1, 0]',
     Math.abs(profile.x[10][0] - 1) < 1e-10 && Math.abs(profile.x[10][1]) < 1e-10);
}

// ── Case 5: high-order rest-to-rest with constrained jerk ─────────────────
{
  // n=4: position, velocity, accel, jerk all zero at both ends, except position 0→5.
  const T = 2.0;
  const traj = flatPolynomialTrajectory([0, 0, 0, 0], [5, 0, 0, 0], T);
  ok('flat poly n=4: boundary positions exact',
     Math.abs(traj.evaluate(0)) < 1e-10 && Math.abs(traj.evaluate(T) - 5) < 1e-10);
  ok('flat poly n=4: boundary accelerations exact',
     Math.abs(traj.evaluateDerivative(0, 2)) < 1e-10 &&
     Math.abs(traj.evaluateDerivative(T, 2)) < 1e-10);
  ok('flat poly n=4: degree = 2n-1 = 7', traj.coefficients.length === 8);
}

// ── Case 6: end-to-end planFlatTrajectorySISO ─────────────────────────────
{
  const A = [[0, 1], [0, 0]];
  const B = [[0], [1]];
  const plan = planFlatTrajectorySISO(A, B, 1.5, [0, 0], [3, 0], { samples: 21 });
  ok('plan flat SISO: certificate flat', plan.certificate.flat);
  ok('plan flat SISO: profile samples = 21', plan.profile.t.length === 21);
  ok('plan flat SISO: final position ≈ 3',
     Math.abs(plan.profile.x[20][0] - 3) < 1e-10);
}

console.log('');
console.log(`Differential flatness summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
