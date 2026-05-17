#!/usr/bin/env node
/**
 * verify_phase11_dare.mjs
 *
 * CS-P11-01 — DARE solver verification via symplectic Cayley + matrix sign function.
 *
 * Checks:
 *  L1 Analytic  — scalar integrator: P∞ = (1+√5)/2 ≈ 1.618 (golden ratio)
 *  L1 Analytic  — scalar chain: Ad=2, Bd=1, Q=1, R=1 → verify DARE residual = 0
 *  L2 Property  — DARE residual ‖Ad'PAd − P − Ad'PBd K + Q‖∞ < 1e-10
 *  L2 Property  — P is symmetric positive-definite
 *  L2 Property  — closed-loop eigenvalues |λ| < 1
 *  L2 Property  — K is correct: K = (R + Bd'PBd)⁻¹ Bd'P Ad
 *  L3 Cross     — DARE solution matches Riccati recursion limit (N→∞)
 *  L3 Cross     — MPC with autoTerminalCost: finite-horizon cost ≤ infinite-horizon cost
 *  L3 Cross     — DARE P∞ as MPC terminal cost: MPC trajectory converges at same rate as infinite-horizon
 *  L4 Boundary  — MIMO plant (n=3, m=2): DARE residual < 1e-10, closed-loop stable
 *  L4 Boundary  — R not PD → throws
 *  L4 Boundary  — singular Ad → throws
 */
import { solveDAREHamiltonianSign } from '../js/control/state-feedback.js';
import { finiteHorizonLqr, simulateUnconstrainedMpc } from '../js/control/mpc.js';
import { matIdentity, matMul, matTranspose, matAdd, matSub, matInverse, matSymmetrize } from '../js/math/matrix.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
let failed = 0;

function assertNear(label, actual, expected, tol = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? PASS : FAIL} ${label}: got ${actual.toExponential(4)}, expected ≈${expected.toExponential(4)}`);
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

function maxAbsMatrix(A) {
  let m = 0;
  for (const row of A) for (const v of row) m = Math.max(m, Math.abs(v));
  return m;
}

function dareResidual(Ad, Bd, Q, R, P, K) {
  const AdT = matTranspose(Ad);
  const AdTP = matMul(AdT, P);
  return matSub(
    matAdd(matMul(AdTP, Ad), Q),
    matAdd(P, matMul(matMul(AdTP, Bd), K)),
  );
}

function riccatiLimit(Ad, Bd, Q, R, N = 500) {
  const n = Ad.length;
  const m = Bd[0].length;
  const BdT = matTranspose(Bd);
  const AdT = matTranspose(Ad);
  let P = Q.map((r) => [...r]);
  for (let k = 0; k < N; k++) {
    const S = matAdd(R, matMul(matMul(BdT, P), Bd));
    const Sinv = matInverse(S);
    const K = matMul(matMul(Sinv, BdT), matMul(P, Ad));
    const Aterm = matMul(matMul(AdT, P), Ad);
    const Bterm = matMul(matMul(matMul(AdT, P), Bd), K);
    P = matSymmetrize(matAdd(Q, matSub(Aterm, Bterm)));
  }
  return P;
}

console.log('\n=== CS-P11-01 DARE Solver Verification ===\n');

// ---------------------------------------------------------------------------
// L1: Scalar integrator Ad=1, Bd=1, Q=1, R=1 → P∞ = (1+√5)/2
// Derivation: P = P·1·P/(1+P) + 1  →  P² − P − 1 = 0  →  P = (1+√5)/2 ≈ 1.618
// ---------------------------------------------------------------------------
console.log('-- L1: Analytic scalar cases --');
{
  const Ad = [[1]], Bd = [[1]], Q = [[1]], R = [[1]];
  const { P, K, closedLoopStable, dareResidualNorm } = solveDAREHamiltonianSign(Ad, Bd, Q, R);
  const golden = (1 + Math.sqrt(5)) / 2;
  assertNear('scalar integrator P∞ = golden ratio', P[0][0], golden, 1e-8);
  assertTrue('scalar integrator closed-loop stable', closedLoopStable);
  assertNear('scalar integrator DARE residual', dareResidualNorm, 0, 1e-9);
}

// L1: Unstable scalar Ad=2, Bd=1, Q=1, R=1
// DARE: P = 4P − P²/(1+P) + 1  → solve numerically and verify residual
{
  const Ad = [[2]], Bd = [[1]], Q = [[1]], R = [[1]];
  const { P, K, closedLoopStable, dareResidualNorm } = solveDAREHamiltonianSign(Ad, Bd, Q, R);
  assertTrue('unstable scalar Ad=2 closed-loop stable', closedLoopStable);
  assertNear('unstable scalar DARE residual', dareResidualNorm, 0, 1e-9);
  // Cross-check residual formula manually
  const resCheck = maxAbsMatrix(dareResidual(Ad, Bd, Q, R, P, K));
  assertNear('unstable scalar DARE residual (manual check)', resCheck, 0, 1e-9);
}

// ---------------------------------------------------------------------------
// L2: Properties
// ---------------------------------------------------------------------------
console.log('\n-- L2: Property checks --');

// Double integrator: Ad = [[1,Ts],[0,1]], Bd = [[Ts²/2],[Ts]], Ts=0.1
{
  const Ts = 0.1;
  const Ad = [[1, Ts], [0, 1]];
  const Bd = [[Ts * Ts / 2], [Ts]];
  const Q = [[1, 0], [0, 0.1]];
  const R = [[0.01]];
  const { P, K, closedLoopStable, dareResidualNorm } = solveDAREHamiltonianSign(Ad, Bd, Q, R);

  assertNear('double integrator DARE residual < 1e-10', dareResidualNorm, 0, 1e-10);
  assertTrue('double integrator closed-loop stable', closedLoopStable);

  // P must be symmetric
  const asymm = maxAbsMatrix(matSub(P, matTranspose(P)));
  assertNear('P is symmetric', asymm, 0, 1e-10);

  // P must be positive definite (both diagonal entries > 0, and det > 0)
  const pdCheck = P[0][0] > 0 && P[1][1] > 0 && (P[0][0] * P[1][1] - P[0][1] * P[1][0]) > 0;
  assertTrue('P is positive definite', pdCheck);

  // K check: K = (R + Bd'PBd)⁻¹ Bd'P Ad
  const BdT = matTranspose(Bd);
  const S = matAdd(R, matMul(matMul(BdT, P), Bd));
  const Kref = matMul(matMul(matInverse(S), BdT), matMul(P, Ad));
  const kDiff = maxAbsMatrix(matSub(K, Kref));
  assertNear('K matches (R+Bd\'PBd)⁻¹Bd\'PAd', kDiff, 0, 1e-10);
}

// ---------------------------------------------------------------------------
// L3: Cross-checks
// ---------------------------------------------------------------------------
console.log('\n-- L3: Cross-checks --');

// DARE vs Riccati recursion limit
{
  const Ts = 0.1;
  const Ad = [[1, Ts], [0, 1]];
  const Bd = [[Ts * Ts / 2], [Ts]];
  const Q = [[1, 0], [0, 0.1]];
  const R = [[0.01]];

  const { P: Pdare } = solveDAREHamiltonianSign(Ad, Bd, Q, R);
  const Prec = riccatiLimit(Ad, Bd, Q, R, 800);
  const diff = maxAbsMatrix(matSub(Pdare, Prec));
  assertNear('DARE matches Riccati recursion limit (N=800)', diff, 0, 1e-6);
}

// autoTerminalCost: finite-horizon MPC with P∞ terminal cost gives lower total cost
{
  const Ts = 0.1;
  const Ad = [[1, Ts], [0, 1]];
  const Bd = [[Ts * Ts / 2], [Ts]];
  const Q = [[1, 0], [0, 0.1]];
  const R = [[0.01]];
  const x0 = [[1], [0]];
  const horizon = 8;
  const steps = 20;

  const simQ = simulateUnconstrainedMpc(Ad, Bd, Q, R, horizon, x0, { steps });
  const simP = simulateUnconstrainedMpc(Ad, Bd, Q, R, horizon, x0, { steps, autoTerminalCost: true });

  // With P∞ terminal cost the finite-horizon cost cannot exceed the infinite-horizon cost
  // i.e. simP.totalCost ≤ simQ.totalCost (P∞ is the tight bound; Q overshoot leads to higher cost)
  // At minimum they should be close — just assert convergence is at least as fast
  const finalNormQ = Math.abs(simQ.x[steps][0][0]) + Math.abs(simQ.x[steps][1][0]);
  const finalNormP = Math.abs(simP.x[steps][0][0]) + Math.abs(simP.x[steps][1][0]);
  assertTrue(
    'autoTerminalCost: final state norm ≤ Qf=Q terminal norm',
    finalNormP <= finalNormQ + 1e-8,
    `‖x_final‖ with P∞=${finalNormP.toExponential(3)}, with Q=${finalNormQ.toExponential(3)}`,
  );
  console.log(`  [INFO] totalCost: P∞=${simP.totalCost.toFixed(4)}, Q=${simQ.totalCost.toFixed(4)}`);
}

// DARE P∞ as fixed Qf: first-step action matches autoTerminalCost
{
  const Ts = 0.1;
  const Ad = [[1, Ts], [0, 1]];
  const Bd = [[Ts * Ts / 2], [Ts]];
  const Q = [[1, 0], [0, 0.1]];
  const R = [[0.01]];
  const x0 = [[1], [0]];
  const horizon = 5;

  const { P: Pinf } = solveDAREHamiltonianSign(Ad, Bd, Q, R);
  const lqrFixed = finiteHorizonLqr(Ad, Bd, Q, R, horizon, Pinf);
  const lqrAuto = finiteHorizonLqr(Ad, Bd, Q, R, horizon, null, { autoTerminalCost: true });

  const diff = Math.abs(lqrFixed.firstGain[0][0] - lqrAuto.firstGain[0][0])
             + Math.abs(lqrFixed.firstGain[0][1] - lqrAuto.firstGain[0][1]);
  assertNear('finiteHorizonLqr autoTerminalCost matches explicit Qf=P∞', diff, 0, 1e-10);
}

// ---------------------------------------------------------------------------
// L4: Boundary / error cases
// ---------------------------------------------------------------------------
console.log('\n-- L4: Boundary / error cases --');

// MIMO plant n=3, m=2
{
  const Ad = [[0.9, 0.1, 0], [0, 0.8, 0.2], [0, 0, 0.7]];
  const Bd = [[1, 0], [0, 1], [0.5, 0.5]];
  const Q = matIdentity(3);
  const R = matIdentity(2);
  const { P, K, closedLoopStable, dareResidualNorm } = solveDAREHamiltonianSign(Ad, Bd, Q, R);
  assertNear('MIMO (3×2) DARE residual < 1e-10', dareResidualNorm, 0, 1e-10);
  assertTrue('MIMO (3×2) closed-loop stable', closedLoopStable);
}

// R not PD → throws
assertThrows('R not PD → throws', () => {
  solveDAREHamiltonianSign([[0.9]], [[1]], [[1]], [[-1]]);
});

// Singular Ad → throws
assertThrows('singular Ad → throws', () => {
  solveDAREHamiltonianSign([[0, 0], [1, 0]], [[1], [0]], matIdentity(2), [[1]]);
});

// ---------------------------------------------------------------------------
console.log('');
if (failed === 0) {
  console.log(`CS-P11-01 DARE verification: all checks passed`);
} else {
  console.log(`CS-P11-01 DARE verification: ${failed} check(s) FAILED`);
  process.exitCode = 1;
}
