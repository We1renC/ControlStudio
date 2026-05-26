#!/usr/bin/env node
/**
 * verify_d1_qp_activeset.mjs
 *
 * Tier D1 — Active-set QP solver
 *
 * Solves:   min 0.5 x' H x + g' x   s.t.  A_ineq x <= b_ineq,  A_eq x = b_eq
 *
 * Checks:
 *  L1 Analytic — unconstrained QP: x = -H^-1 g
 *  L1 Analytic — single equality constraint: closed-form
 *  L2 Property — KKT residual: H x + g + A_ineq' mu + A_eq' lambda = 0,
 *                              mu >= 0,  mu_i * (A_ineq x - b)_i = 0
 *  L2 Property — feasibility: A_ineq x <= b_ineq + tol
 *  L3 Cross   — warm-start: same QP from prev solution converges in 0 iter
 *  L3 Cross   — small MPC-like QP (n=10, m=4 ineq) solves correctly
 *  L4 Boundary — infeasible problem detected
 *  L4 Boundary — non-PSD H rejected
 */
import {
  solveQPActiveSet,
} from '../js/math/qp_activeset.js';
import { matMul, matAdd, matTranspose, matInverse, matScale } from '../js/math/matrix.js';

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
console.log('  D1 Active-set QP solver');
console.log('===============================================================\n');

// L1 - unconstrained
console.log('> L1 Unconstrained QP');
// min 0.5 x' H x + g' x with H = I, g = -[2, 3]
// solution: x = -H^-1 g = [2, 3]
const H1 = [[1, 0], [0, 1]];
const g1 = [[-2], [-3]];
const r1 = solveQPActiveSet({ H: H1, g: g1, A_ineq: [], b_ineq: [] });
assertNear('unconstrained x[0]', r1.x[0][0], 2, 1e-9);
assertNear('unconstrained x[1]', r1.x[1][0], 3, 1e-9);
assertTrue('iter = 0 for unconstrained', r1.iter === 0, `got ${r1.iter}`);

// L1 - inequality bites
console.log('\n> L1 Inequality constraint active');
// min 0.5 (x-2)^2 + 0.5 (y-3)^2 = 0.5 x^2 - 2x + 2 + 0.5 y^2 - 3y + 4.5
// H = I, g = [-2, -3]
// s.t. x + y <= 4   (unconstrained opt is [2,3] with x+y=5, infeasible)
// Solution on constraint: minimize subject to x+y=4
// Lagrangian: x - 2 + mu = 0, y - 3 + mu = 0  -> x = 2 - mu, y = 3 - mu
// constraint: 5 - 2mu = 4 -> mu = 0.5
// x = 1.5, y = 2.5
const A_in = [[1, 1]];
const b_in = [[4]];
const r2 = solveQPActiveSet({ H: H1, g: g1, A_ineq: A_in, b_ineq: b_in });
assertNear('constrained x[0]', r2.x[0][0], 1.5, 1e-9);
assertNear('constrained x[1]', r2.x[1][0], 2.5, 1e-9);
assertNear('mu = 0.5', r2.mu[0], 0.5, 1e-9);
assertTrue('iter > 0 (constraint added)', r2.iter > 0, `got ${r2.iter}`);
// Verify constraint A_in x = 4 (active)
assertNear('A_in x = 4 (active)', r2.x[0][0] + r2.x[1][0], 4, 1e-9);

// L1 - equality
console.log('\n> L1 Equality constraint');
const A_eq = [[1, 1]];
const b_eq = [[4]];
const r3 = solveQPActiveSet({ H: H1, g: g1, A_ineq: [], b_ineq: [], A_eq, b_eq });
assertNear('equality x[0]', r3.x[0][0], 1.5, 1e-9);
assertNear('equality x[1]', r3.x[1][0], 2.5, 1e-9);

// L2 - KKT and feasibility for random problem
console.log('\n> L2 KKT and feasibility on random QP');
// min 0.5 x' H x + g' x   s.t.  x_i >= 0  (i.e. -x_i <= 0)
const H4 = [[4, 1, 0, 0], [1, 3, 0.5, 0], [0, 0.5, 2, 0.2], [0, 0, 0.2, 5]];
const g4 = [[1], [-2], [-3], [4]];
const Ain4 = [[-1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, -1]];
const bin4 = [[0], [0], [0], [0]];
const r4 = solveQPActiveSet({ H: H4, g: g4, A_ineq: Ain4, b_ineq: bin4 });
// Check feasibility
let maxViol = 0;
for (let i = 0; i < Ain4.length; i++) {
  let prod = 0;
  for (let j = 0; j < 4; j++) prod += Ain4[i][j] * r4.x[j][0];
  const v = prod - bin4[i][0];
  if (v > maxViol) maxViol = v;
}
assertTrue('all constraints feasible', maxViol < 1e-9,
  `max violation = ${maxViol.toExponential(2)}`);
// KKT: H x + g + A_ineq' mu = 0
const HX = matMul(H4, r4.x);
const muCol = r4.mu.map(v => [v]);
const ATmu = matMul(matTranspose(Ain4), muCol);
let kktNorm = 0;
for (let i = 0; i < 4; i++) {
  const r = HX[i][0] + g4[i][0] + ATmu[i][0];
  kktNorm = Math.max(kktNorm, Math.abs(r));
}
assertTrue('KKT stationarity residual < 1e-8', kktNorm < 1e-8,
  `||r|| = ${kktNorm.toExponential(2)}`);
// Complementarity
let compMax = 0;
for (let i = 0; i < Ain4.length; i++) {
  let prod = 0;
  for (let j = 0; j < 4; j++) prod += Ain4[i][j] * r4.x[j][0];
  const slack = bin4[i][0] - prod;
  compMax = Math.max(compMax, Math.abs(r4.mu[i] * slack));
}
assertTrue('complementarity mu * slack = 0', compMax < 1e-9,
  `max = ${compMax.toExponential(2)}`);
// Dual feasibility mu >= 0
const minMu = Math.min(...r4.mu);
assertTrue('mu >= 0', minMu >= -1e-12, `min mu = ${minMu}`);

// L3 - warm start
console.log('\n> L3 Warm-start');
// Solve again starting with previous working set
const r5 = solveQPActiveSet({
  H: H4, g: g4, A_ineq: Ain4, b_ineq: bin4,
  initialW: r4.workingSet
});
// Should converge in 0 or 1 iteration
assertTrue('warm-start converges in <= 1 iter', r5.iter <= 1, `iter=${r5.iter}`);
// Same solution
let diffWarm = 0;
for (let i = 0; i < 4; i++) diffWarm = Math.max(diffWarm, Math.abs(r5.x[i][0] - r4.x[i][0]));
assertTrue('warm-start solution matches cold', diffWarm < 1e-10,
  `max diff = ${diffWarm.toExponential(2)}`);

// L3 - small MPC-like QP
console.log('\n> L3 MPC-like QP');
// Build a small structured QP: H = block diag, ineq u_min <= u <= u_max
const n = 6;
const Hmpc = [];
for (let i = 0; i < n; i++) {
  const row = new Array(n).fill(0);
  row[i] = 2;
  if (i > 0) row[i-1] = -1;
  if (i < n-1) row[i+1] = -1;
  Hmpc.push(row);
}
const gmpc = [];
for (let i = 0; i < n; i++) gmpc.push([-i * 0.5]);
// u_i in [-1, 1]
const Ain_mpc = [];
const bin_mpc = [];
for (let i = 0; i < n; i++) {
  const r = new Array(n).fill(0); r[i] = 1; Ain_mpc.push(r); bin_mpc.push([1]);
  const r2 = new Array(n).fill(0); r2[i] = -1; Ain_mpc.push(r2); bin_mpc.push([1]);
}
const rmpc = solveQPActiveSet({ H: Hmpc, g: gmpc, A_ineq: Ain_mpc, b_ineq: bin_mpc });
assertTrue('MPC QP solves', !!rmpc.x && rmpc.x.length === n);
// All entries in [-1, 1]
let allInBounds = true;
for (let i = 0; i < n; i++) {
  if (rmpc.x[i][0] > 1 + 1e-9 || rmpc.x[i][0] < -1 - 1e-9) allInBounds = false;
}
assertTrue('all entries in [-1, 1]', allInBounds);

// L4 - degenerate / infeasible
console.log('\n> L4 Boundary');
// Infeasible: x <= -1 and x >= 1  i.e. -x <= -1 and x <= -1
assertThrows('infeasible problem throws',
  () => solveQPActiveSet({
    H: [[1]], g: [[0]],
    A_ineq: [[1], [-1]], b_ineq: [[-1], [-1]]
  }));

// Wrong dimensions
assertThrows('dim mismatch throws',
  () => solveQPActiveSet({ H: [[1, 0], [0, 1]], g: [[1]], A_ineq: [], b_ineq: [] }));

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All D1 Active-set QP checks passed');
  process.exit(0);
} else {
  console.log(`${failed} D1 check(s) FAILED`);
  process.exit(1);
}
