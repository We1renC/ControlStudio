#!/usr/bin/env node
/**
 * verify_phase11_setpoint_and_state_constraints.mjs
 *
 * CS-P11-02 — MPC Setpoint Tracking: solveSetpointSteadyState, simulateMpcTracking
 * CS-P11-05 — State constraints + soft slack: firstMpcActionStateConstrained,
 *              simulateStateConstrainedMpc
 */
import {
  solveSetpointSteadyState,
  firstMpcActionTracking,
  simulateMpcTracking,
  firstMpcActionStateConstrained,
  simulateStateConstrainedMpc,
} from '../js/control/mpc.js';
import { matIdentity } from '../js/math/matrix.js';

let failed = 0;
function assertNear(label, actual, expected, tol = 1e-8) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}: got ${actual.toExponential(4)}, expected ≈${expected.toExponential(4)}`);
  if (!ok) failed++;
}
function assertTrue(label, cond, detail = '') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${detail ? ': ' + detail : ''}`);
  if (!cond) failed++;
}
function assertThrows(label, fn) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  console.log(`${threw ? '[PASS]' : '[FAIL]'} ${label}`);
  if (!threw) failed++;
}
function maxAbsMatrix(A) {
  let m = 0;
  for (const row of A) for (const v of row) m = Math.max(m, Math.abs(v));
  return m;
}

// Shared plant: discrete double-integrator, Ts=0.1
const Ts = 0.1;
const Ad = [[1, Ts], [0, 1]];
const Bd = [[Ts * Ts / 2], [Ts]];
const Q = [[1, 0], [0, 0.1]];
const R = [[0.01]];

// ============================================================
// CS-P11-02: Setpoint Tracking
// ============================================================
console.log('\n=== CS-P11-02: MPC Setpoint Tracking ===\n');

// L1: Steady-state computation
{
  const r = [[1], [0]]; // want position=1, velocity=0
  const { u_ss, steadyStateResidual } = solveSetpointSteadyState(Ad, Bd, r);
  // (I-Ad)*r = [[0,-Ts],[0,0]]*[[1],[0]] = [[0],[0]], so u_ss = 0
  assertNear('steady-state residual for double-integrator r=[1,0]', steadyStateResidual, 0, 1e-12);
  // For double integrator: (I-Ad) = [[0,-Ts],[0,0]], (I-Ad)*r = [[0],[0]], u_ss = [0]
  assertNear('u_ss = 0 for double-integrator at rest setpoint', u_ss[0][0], 0, 1e-12);
}

// L1: Scalar unstable plant – non-trivial u_ss
{
  const A_scalar = [[0.9]];
  const B_scalar = [[1]];
  const r_scalar = [[5]];
  const { u_ss, steadyStateResidual } = solveSetpointSteadyState(A_scalar, B_scalar, r_scalar);
  // (I - 0.9)*5 = 0.1*5 = 0.5, u_ss = 0.5/1 = 0.5
  assertNear('scalar plant u_ss = 0.5', u_ss[0][0], 0.5, 1e-10);
  assertNear('scalar plant steady-state residual', steadyStateResidual, 0, 1e-12);
}

// L2: Tracking error converges to zero
{
  const r = [[2], [0]]; // setpoint: position=2, velocity=0
  const x0 = [[0], [0]];
  const horizon = 15;
  const steps = 60;
  const result = simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, r, {}, { steps });
  const finalErr = result.finalTrackingErrorNormInf;
  assertTrue('tracking error converges: ‖e_final‖ < 0.05', finalErr < 0.05,
    `‖e_final‖∞ = ${finalErr.toExponential(3)}`);
  // Cost should be finite
  assertTrue('tracking total cost finite', Number.isFinite(result.totalCost));
}

// L2: Tracking from nonzero initial state
{
  const r = [[0], [0]];  // setpoint: origin
  const x0 = [[3], [0.5]];
  const horizon = 10;
  const steps = 50;
  const result = simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, r, {}, { steps });
  assertTrue('regulate to origin: ‖e_final‖ < 0.01',
    result.finalTrackingErrorNormInf < 0.01,
    `‖e_final‖∞ = ${result.finalTrackingErrorNormInf.toExponential(3)}`);
}

// L3: Tracking with input constraints
{
  const r = [[1], [0]];
  const x0 = [[0], [0]];
  const horizon = 12;
  const steps = 80;
  const constraints = { uMin: -0.5, uMax: 0.5 };
  const result = simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, r, constraints, { steps });
  // All applied u must respect bounds
  let boundViolated = false;
  for (const uk of result.u) {
    if (uk[0][0] < -0.5 - 1e-7 || uk[0][0] > 0.5 + 1e-7) boundViolated = true;
  }
  assertTrue('constrained tracking: all u within [−0.5, 0.5]', !boundViolated);
  assertTrue('constrained tracking converges', result.finalTrackingErrorNormInf < 0.1,
    `‖e_final‖∞ = ${result.finalTrackingErrorNormInf.toExponential(3)}`);
}

// L3: Step reference change (time-varying reference as function)
{
  const x0 = [[0], [0]];
  const horizon = 10;
  const steps = 100;
  // Step at k=50: r changes from [0] to [1]
  const refFn = (k) => k < 50 ? [[0], [0]] : [[1], [0]];
  const result = simulateMpcTracking(Ad, Bd, Q, R, horizon, x0, refFn, {}, { steps });
  assertTrue('time-varying reference tracking: final error < 0.05',
    result.finalTrackingErrorNormInf < 0.05,
    `‖e_final‖∞ = ${result.finalTrackingErrorNormInf.toExponential(3)}`);
}

// L4: Wrong reference shape throws
assertThrows('wrong reference shape throws', () => {
  firstMpcActionTracking(Ad, Bd, Q, R, 10, [[0], [0]], [[0], [0], [0]]);
});

// ============================================================
// CS-P11-05: State Constraints + Soft Slack
// ============================================================
console.log('\n=== CS-P11-05: State Constraints + Soft Slack ===\n');

// L1: No state constraints → same result as firstMpcActionConstrained
{
  const x0 = [[1], [0]];
  const horizon = 10;
  // With huge penalty but no bounds → should match unconstrained solve
  const resultSC = firstMpcActionStateConstrained(Ad, Bd, Q, R, horizon, x0,
    { uMin: -Infinity, uMax: Infinity },
    { xMin: [-Infinity, -Infinity], xMax: [Infinity, Infinity], penalty: 1e5 },
  );
  assertTrue('no state constraints: feasible=true', resultSC.feasible);
  assertNear('no state constraints: slackNormInf = 0', resultSC.slackNormInf, 0, 1e-10);
}

// L2: Upper state constraint limits velocity
{
  // x0 = [0,0], push to positive but clamp velocity < 0.1
  const Ad2 = [[1, Ts], [0, 0.95]]; // slightly damped
  const Bd2 = [[Ts], [Ts]];
  const Q2 = [[1, 0], [0, 0.01]];
  const R2 = [[0.01]];
  const x0 = [[0], [0]];
  const horizon = 15;
  const steps = 30;
  const result = simulateStateConstrainedMpc(
    Ad2, Bd2, Q2, R2, horizon, x0,
    { uMin: -5, uMax: 5 },
    { xMin: [-10, -0.05], xMax: [10, 0.15], penalty: 1e5 },
    { steps },
  );
  // At least some steps should have been feasible (penalty should suppress violations)
  const maxVel = Math.max(...result.x.map((xi) => Math.abs(xi[1][0])));
  console.log(`  [INFO] max velocity = ${maxVel.toFixed(4)} (limit=0.15+slack)`);
  // With penalty=1e5, violations should be small (≤ 0.05 above the bound)
  assertTrue('soft state constraint: max velocity within soft tolerance',
    maxVel < 0.15 + 0.05,
    `max|v| = ${maxVel.toFixed(4)}`);
}

// L2: Zero initial state → no state violations expected
{
  const x0 = [[0], [0]];
  const horizon = 8;
  const steps = 20;
  const result = simulateStateConstrainedMpc(
    Ad, Bd, Q, R, horizon, x0,
    { uMin: -2, uMax: 2 },
    { xMin: [-5, -5], xMax: [5, 5], penalty: 1e4 },
    { steps },
  );
  assertTrue('zero x0: no state violations (within wide bounds)',
    !result.anyViolation,
    `anyViolation = ${result.anyViolation}`);
}

// L3: State constraint with tight bound leads to higher cost vs unconstrained
{
  // Use a system that naturally overshoots
  const x0 = [[1], [0]];
  const horizon = 10;
  const steps = 20;

  const uncResult = simulateStateConstrainedMpc(
    Ad, Bd, Q, R, horizon, x0,
    { uMin: -5, uMax: 5 },
    { xMin: [-5, -5], xMax: [5, 5], penalty: 1 },  // very small penalty = nearly unconstrained
    { steps },
  );

  const tightResult = simulateStateConstrainedMpc(
    Ad, Bd, Q, R, horizon, x0,
    { uMin: -5, uMax: 5 },
    { xMin: [-5, -1], xMax: [5, 0.05], penalty: 1e6 }, // tight velocity bound
    { steps },
  );

  assertTrue('tight x constraints: cost ≥ loose cost',
    tightResult.totalCost >= uncResult.totalCost - 1e-6,
    `tight=${tightResult.totalCost.toFixed(4)}, loose=${uncResult.totalCost.toFixed(4)}`);
}

// L4: Violations are reported after simulation
{
  // Force a scenario where violations WOULD be detected (if penalty is too small)
  const x0 = [[2], [0]]; // large initial state
  const horizon = 5;
  const steps = 10;
  // Very small penalty → soft constraint mostly ignored → violations may occur
  const result = simulateStateConstrainedMpc(
    Ad, Bd, Q, R, horizon, x0,
    { uMin: -0.1, uMax: 0.1 }, // very tight u bounds
    { xMin: [1.5, -5], xMax: [2.5, 5], penalty: 0 }, // penalty=0 → no enforcement
    { steps },
  );
  // Result should still compute without throwing
  assertTrue('violation reporting does not crash', Array.isArray(result.violationsLog));
  assertTrue('violationsLog length matches steps', result.violationsLog.length === steps);
}

// ============================================================
console.log('');
if (failed === 0) {
  console.log('CS-P11-02/05 verification: all checks passed');
} else {
  console.log(`CS-P11-02/05 verification: ${failed} check(s) FAILED`);
  process.exitCode = 1;
}
