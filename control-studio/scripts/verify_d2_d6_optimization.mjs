#!/usr/bin/env node
/**
 * Verification for Functional Roadmap D2-D6 optimization APIs.
 */

import { solveQPAdmm } from '../js/optimization/admm_qp.js';
import { solveSQP, multipleShooting } from '../js/optimization/sqp.js';
import { solveKnapsack, solveBinaryMILP, solveTSPHeldKarp } from '../js/optimization/milp.js';
import { minimizeLBFGS, trustRegion } from '../js/optimization/lbfgs_trust.js';
import { solveMixedIntegerMPC } from '../js/optimization/mixed_integer_mpc.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function rosenbrock(x) {
  return 100 * (x[1] - x[0] * x[0]) ** 2 + (1 - x[0]) ** 2;
}

function verifyD2() {
  const r = solveQPAdmm({
    P: [[2, 0], [0, 2]],
    q: [-2, -5],
    l: [0, 0],
    u: [1, 2],
    rho: 1.2,
    tol: 1e-7,
  });
  assert(Math.abs(r.x[0] - 1) < 2e-4, `ADMM x0 should match clipped QP optimum: ${r.x[0]}`);
  assert(Math.abs(r.x[1] - 2) < 2e-4, `ADMM x1 should match clipped QP optimum: ${r.x[1]}`);

  const n = 1000;
  const big = solveQPAdmm({
    P: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 2 : 0))),
    q: new Array(n).fill(-1),
    l: new Array(n).fill(0),
    u: new Array(n).fill(1),
    maxIter: 40,
    tol: 1e-5,
  });
  assert(big.x.length === n && big.iter <= 40, 'ADMM large diagonal QP should stay bounded and iteration-limited');
}

function verifyD3() {
  const result = solveSQP({
    x0: [3, -2],
    objective: (x) => (x[0] - 0.5) ** 2 + (x[1] + 0.25) ** 2,
    maxIter: 90,
    tol: 1e-5,
  });
  assert(result.fval < 1e-8, `SQP merit baseline should converge on smooth nonlinear objective: ${result.fval}`);
  const ms = multipleShooting({
    x0: [0],
    controls: [[1], [1], [1]],
    dt: 1,
    dynamics: (x, u, dt) => [x[0] + dt * u[0]],
  });
  const maxContinuity = Math.max(...ms.continuityResidual.flat().map(Math.abs));
  assert(maxContinuity < 1e-12 && ms.states[3][0] === 3, 'Multiple-shooting continuity failed');
}

function verifyD4() {
  const knap = solveKnapsack({ values: [6, 10, 12], weights: [1, 2, 3], capacity: 5 });
  assert(knap.objective === 22 && knap.selected.includes(1) && knap.selected.includes(2), `Knapsack optimum wrong: ${knap.objective}`);
  const infeasible = solveBinaryMILP({ c: [1], A: [[1], [-1]], b: [0, -1], maximize: true });
  assert(infeasible.status === 'infeasible', 'Binary MILP infeasible case not detected');
  const tsp = solveTSPHeldKarp([
    [0, 10, 15, 20],
    [10, 0, 35, 25],
    [15, 35, 0, 30],
    [20, 25, 30, 0],
  ]);
  assert(tsp.objective === 80 && tsp.tour[0] === 0 && tsp.tour.at(-1) === 0, `TSP Held-Karp optimum wrong: ${tsp.objective}`);
}

function verifyD5() {
  const lb = minimizeLBFGS({ f: rosenbrock, x0: [-1.2, 1], maxIter: 90, tol: 1e-5, m: 7 });
  assert(lb.fval < 1e-6, `L-BFGS Rosenbrock fval too high: ${lb.fval}`);
  assert(lb.memoryVectors <= 14, `L-BFGS memory vectors too high: ${lb.memoryVectors}`);
  const tr = trustRegion({ f: (x) => (x[0] - 3) ** 2 + (x[1] + 2) ** 2, x0: [0, 0], maxIter: 80 });
  assert(Math.abs(tr.x[0] - 3) < 1e-3 && Math.abs(tr.x[1] + 2) < 1e-3, `Trust-region quadratic optimum wrong: ${tr.x}`);
}

function verifyD6() {
  const modes = [
    { A: [[1]], B: [[0.2]] },
    { A: [[1]], B: [[1.0]] },
  ];
  const result = solveMixedIntegerMPC({
    modes,
    x0: [0],
    ref: [3],
    horizon: 3,
    inputs: [[1]],
    Q: 1,
    R: 0,
  });
  assert(result.status === 'optimal', 'MIMPC did not find a feasible switched sequence');
  assert(result.modeSeq.every((idx) => idx === 1), `MIMPC should select fast mode for tracking: ${result.modeSeq}`);
  assert(Math.abs(result.terminal[0] - 3) < 1e-12, `MIMPC terminal state wrong: ${result.terminal[0]}`);
}

verifyD2();
verifyD3();
verifyD4();
verifyD5();
verifyD6();

console.log('PASS: D2-D6 optimization verification');
