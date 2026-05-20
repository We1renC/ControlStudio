#!/usr/bin/env node
/**
 * verify_p24_tube_explicit_mpc.mjs — Phase 24 Tube MPC + Explicit MPC.
 */

import { firstMpcActionConstrained } from '../js/control/mpc.js';
import { designTubeMpc, propagateTubeRadius, simulateTubeMPC } from '../js/control/tube_mpc.js';
import { buildExplicitMPC, evaluateExplicitMPC, simulateExplicitMPC } from '../js/control/explicit_mpc.js';

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

function near(msg, actual, expected, tol = 1e-9) {
  ok(msg, Math.abs(actual - expected) <= tol, `actual=${actual}, expected=${expected}, tol=${tol}`);
}

console.log('\n=== P24-02/04: Tube MPC + Explicit MPC ===\n');

// Scalar stable plant: x[k+1] = x[k] + u[k] + w[k].
{
  const Ad = [[1]];
  const Bd = [[1]];
  const Q = [[1]];
  const R = [[0.2]];
  const horizon = 5;
  const constraints = { uMin: -1, uMax: 1 };
  const K = [[0.5]];

  const nextRadius = propagateTubeRadius(Ad, Bd, K, [0.2], [0.05]);
  near('Tube 1: scalar radius propagation uses |A-BK|r+w', nextRadius[0], 0.15, 1e-12);

  const design = designTubeMpc(Ad, Bd, Q, R, horizon, constraints, {
    K,
    initialRadius: [0.2],
    disturbanceBound: [0.05],
  });
  near('Tube 2: input tightening = |K|r', design.tightening[0], 0.1, 1e-12);
  near('Tube 3: tightened uMin shifts upward', design.tightenedConstraints.uMin[0], -0.9, 1e-12);
  near('Tube 4: tightened uMax shifts downward', design.tightenedConstraints.uMax[0], 0.9, 1e-12);
  ok('Tube 5: tightened scalar design is feasible', design.feasible);

  const sim = simulateTubeMPC(Ad, Bd, Q, R, horizon, [[2]], constraints, {
    K,
    initialRadius: [0.2],
    disturbanceBound: [0.05],
    disturbanceFn: (k) => [[k % 2 === 0 ? 0.04 : -0.03]],
    steps: 12,
  });
  ok('Tube 6: trajectory has steps+1 states', sim.x.length === 13, `got ${sim.x.length}`);
  ok('Tube 7: all applied controls respect original input bounds',
    sim.u.every((u) => u[0][0] <= 1 + 1e-10 && u[0][0] >= -1 - 1e-10));
  ok('Tube 8: final actual state moves toward origin', Math.abs(sim.x.at(-1)[0][0]) < Math.abs(sim.x[0][0][0]),
    `x0=${sim.x[0][0][0].toFixed(3)}, xf=${sim.x.at(-1)[0][0].toFixed(3)}`);

  const infeasible = designTubeMpc(Ad, Bd, Q, R, horizon, { uMin: -0.05, uMax: 0.05 }, {
    K,
    initialRadius: [0.2],
    disturbanceBound: [0.05],
  });
  ok('Tube 9: infeasible tightened input bounds are diagnosed',
    !infeasible.feasible && infeasible.diagnostics[0].type === 'tightenedInputConflict');
}

// Explicit MPC: compare lookup policy against online constrained MPC.
{
  const Ad = [[0.9]];
  const Bd = [[0.5]];
  const Q = [[1]];
  const R = [[0.1]];
  const horizon = 4;
  const constraints = { uMin: -1.25, uMax: 1.25 };

  const policy = buildExplicitMPC(Ad, Bd, Q, R, horizon, constraints, {
    xMin: -4,
    xMax: 4,
    gridSize: 161,
    mergeTolerance: 1e-4,
  });

  ok('Explicit 1: policy returns piecewise-linear regions', policy.regions.length >= 3,
    `regions=${policy.regions.length}`);
  ok('Explicit 2: online QP converged for every grid sample', policy.allOnlineConverged);
  ok('Explicit 3: compressed fit error stays small', policy.maxFitError < 2e-3,
    `maxFitError=${policy.maxFitError.toExponential(3)}`);

  const testStates = [-3.5, -1.2, 0, 1.2, 3.5];
  const maxDiff = Math.max(...testStates.map((x) => {
    const explicit = evaluateExplicitMPC(policy, x).u[0][0];
    const online = firstMpcActionConstrained(Ad, Bd, Q, R, horizon, [[x]], constraints).u[0][0];
    return Math.abs(explicit - online);
  }));
  ok('Explicit 4: explicit policy matches online constrained MPC at sample states',
    maxDiff < 2e-3, `maxDiff=${maxDiff.toExponential(3)}`);

  const sim = simulateExplicitMPC(policy, 3, 25);
  ok('Explicit 5: explicit MPC regulates scalar plant', sim.finalStateAbs < 0.1,
    `final=${sim.finalStateAbs.toFixed(4)}`);
  ok('Explicit 6: evaluation clips outside domain with explicit flag',
    evaluateExplicitMPC(policy, 999).clipped === true);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P24 Tube/Explicit MPC: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.');
