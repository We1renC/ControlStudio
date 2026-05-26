#!/usr/bin/env node
/**
 * verify_g2_move_blocking.mjs
 *
 * Tier G2 — MPC Move Blocking
 *
 * Checks:
 *  L1 Property — expansion matrix E correct: blocks=[1,1,1,1,1] gives identity I_N
 *  L1 Property — blocks=[3] gives N x 1 ones-vector
 *  L1 Property — blocks=[2,3] gives N=5, M=2 expected pattern
 *  L2 Cross   — blocks=[1,1,1,...,1] equivalent to standard MPC (same control)
 *  L2 Cross   — blocks=[1,N-1] cost >= standard (since coarser parameterization)
 *  L2 Property — N decision vars reduced from N to M
 *  L3 Cross   — total horizon N preserved
 *  L4 Boundary — block lengths sum != N throws
 */
import {
  buildBlockExpansion,
  blockedFiniteHorizonLqr,
  movedBlockingMpcSimulate,
} from '../js/control/mpc_moveblock.js';
import { finiteHorizonLqr, simulateUnconstrainedMpc } from '../js/control/mpc.js';

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
console.log('  G2 MPC Move Blocking');
console.log('===============================================================\n');

// L1 - expansion matrix
console.log('> L1 Expansion matrix');
const E1 = buildBlockExpansion([1, 1, 1, 1, 1]);
assertTrue('blocks=[1,1,1,1,1] -> 5x5', E1.length === 5 && E1[0].length === 5);
// Should be identity
let isI = true;
for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
  if (E1[i][j] !== (i === j ? 1 : 0)) isI = false;
}
assertTrue('all-singleton blocks -> identity', isI);

const E2 = buildBlockExpansion([3]);
assertTrue('blocks=[3] -> 3x1', E2.length === 3 && E2[0].length === 1);
assertTrue('all entries = 1', E2.every(r => r[0] === 1));

const E3 = buildBlockExpansion([2, 3]);
// N=5, M=2
// u_step[0]=u_step[1]=block[0], u_step[2]=u_step[3]=u_step[4]=block[1]
// E = [[1,0],[1,0],[0,1],[0,1],[0,1]]
const expectedE3 = [[1,0],[1,0],[0,1],[0,1],[0,1]];
let ok3 = true;
for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
  if (E3[i][j] !== expectedE3[i][j]) ok3 = false;
}
assertTrue('blocks=[2,3] expansion correct', ok3,
  `got ${JSON.stringify(E3)}`);

// L2 - All-singleton blocks equivalent to standard MPC
console.log('\n> L2 Singleton-blocks ≡ standard MPC');
const Ad = [[1.0, 0.1], [0.0, 0.95]];
const Bd = [[0.005], [0.1]];
const Q = [[1, 0], [0, 1]];
const R = [[0.1]];
const N = 8;
const x0 = [[1], [0]];

// Standard MPC trajectory
const stdTraj = simulateUnconstrainedMpc(Ad, Bd, Q, R, N, x0, { steps: N });
const blockedTraj = movedBlockingMpcSimulate(Ad, Bd, Q, R, N, [1,1,1,1,1,1,1,1], x0, { steps: N });
// Note: stdTraj uses controls array stdTraj.u; blockedTraj uses controls
const stdControls = stdTraj.u;
let maxDiff = 0;
for (let i = 0; i < stdControls.length; i++) {
  const d = Math.abs(stdControls[i][0][0] - blockedTraj.controls[i][0][0]);
  if (d > maxDiff) maxDiff = d;
}
assertTrue('all-singleton blocks match standard MPC controls', maxDiff < 1e-9,
  `maxDiff=${maxDiff.toExponential(2)}`);

// L2 - Coarse blocking has >= cost (less freedom)
console.log('\n> L2 Coarser blocking -> higher (or equal) cost');
function totalCost(states, controls, Q, R) {
  let cost = 0;
  for (const x of states) {
    for (let i = 0; i < Q.length; i++) for (let j = 0; j < Q.length; j++)
      cost += x[i][0] * Q[i][j] * x[j][0];
  }
  for (const u of controls) {
    cost += u[0][0] * R[0][0] * u[0][0];
  }
  return cost;
}
const coarse = movedBlockingMpcSimulate(Ad, Bd, Q, R, N, [1, 7], x0, { steps: N });
const costStd = totalCost(stdTraj.x, stdTraj.u, Q, R);
const costCoarse = totalCost(coarse.states, coarse.controls, Q, R);
assertTrue('coarse blocking cost >= standard cost', costCoarse >= costStd - 1e-9,
  `std=${costStd.toFixed(4)}, coarse=${costCoarse.toFixed(4)}`);

// L2 - decision variable count check
console.log('\n> L2 Decision variable reduction');
const blocks = [1, 2, 4];
const E = buildBlockExpansion(blocks);
assertTrue('N=7 cols=3 for blocks=[1,2,4]',
  E.length === 7 && E[0].length === 3,
  `${E.length}x${E[0].length}`);

// L3 - simulation works for various block patterns
console.log('\n> L3 Simulation works for various patterns');
const patterns = [
  { blocks: [1,1,1,1], label: '[1,1,1,1]' },
  { blocks: [4], label: '[4]' },
  { blocks: [1, 3], label: '[1,3]' },
  { blocks: [2, 2], label: '[2,2]' },
];
for (const { blocks: pat, label } of patterns) {
  const t = movedBlockingMpcSimulate(Ad, Bd, Q, R, 4, pat, x0);
  assertTrue(`blocks=${label} runs without error`, !!t && t.controls.length === 4);
}

// L4 - validation
console.log('\n> L4 Boundary');
// buildBlockExpansion infers N from sum, but blockedFiniteHorizonLqr validates sum == N
assertThrows('blockedFiniteHorizonLqr sum != N throws',
  () => blockedFiniteHorizonLqr(Ad, Bd, Q, R, 5, [2, 2]));  // sum=4 but N=5
assertThrows('negative block length throws',
  () => buildBlockExpansion([1, -2, 3]));
assertThrows('zero block length throws',
  () => buildBlockExpansion([1, 0, 2]));
assertThrows('empty blocks throws',
  () => buildBlockExpansion([]));

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All G2 Move Blocking checks passed');
  process.exit(0);
} else {
  console.log(`${failed} G2 check(s) FAILED`);
  process.exit(1);
}
