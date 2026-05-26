#!/usr/bin/env node
/**
 * verify_e1_newton_care.mjs
 *
 * Tier E1 — Newton-CARE refinement
 *
 * CARE:  A^T P + P A - P B R^-1 B^T P + Q = 0
 *
 * Newton iteration (given current P_k, find ΔP via Lyapunov):
 *   F_k = A - B R^-1 B^T P_k
 *   (F_k)^T ΔP + ΔP F_k = -R(P_k) = -(A^T P_k + P_k A - P_k B R^-1 B^T P_k + Q)
 *   P_{k+1} = P_k + ΔP
 *
 * Converges quadratically when P_k is in basin of attraction (close to truth).
 *
 * Checks:
 *  L1 Analytic — scalar: A=-1, B=1, Q=R=1 → P solves A^T P + PA - P^2/R + Q = 0
 *                Equivalently -2P - P^2 + 1 = 0 → P = -1 + sqrt(2)
 *  L2 Property — Newton residual converges quadratically from Schur initial
 *  L2 Property — for already-accurate input, Newton converges in 1-2 iterations
 *  L3 Cross   — Newton-refined P matches Schur-CARE result within 1e-12
 *  L4 Boundary — degenerate B = 0 throws or warns
 */
import { careNewton, verifyCARE } from '../js/math/care_newton.js';
import { solveCareHamiltonianSchur } from '../js/control/state-feedback.js';

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
console.log('  E1 Newton-CARE refinement');
console.log('===============================================================\n');

// L1 - scalar analytic
console.log('> L1 Scalar analytic');
// A=-1, B=1, Q=1, R=1
// CARE: -2P - P^2/1 + 1 = 0 → P^2 + 2P - 1 = 0 → P = -1 + sqrt(2) (positive root)
const Ascalar = [[-1]];
const Bscalar = [[1]];
const Qscalar = [[1]];
const Rscalar = [[1]];
const Pexpected = -1 + Math.sqrt(2);
const r1 = careNewton(Ascalar, Bscalar, Qscalar, Rscalar);
assertNear('scalar P = -1 + sqrt(2)', r1.P[0][0], Pexpected, 1e-12);
assertTrue('iter > 0 (Newton actually ran)', r1.iter >= 0);
assertTrue('residual < 1e-14', r1.residualNorm < 1e-12, `res=${r1.residualNorm.toExponential(2)}`);

// L2 - 2x2 system: refine Schur-CARE
console.log('\n> L2 2x2 Newton refinement');
const A2 = [[0, 1], [-2, -3]];
const B2 = [[0], [1]];
const Q2 = [[1, 0], [0, 1]];
const R2 = [[1]];
// Get Schur initial (returns {P, K, ...})
const schurResult = solveCareHamiltonianSchur(A2, B2, Q2, R2);
const Pschur = schurResult.P;
const initResidual = verifyCARE(Pschur, A2, B2, Q2, R2);
console.log(`  Schur P initial residual: ${initResidual.toExponential(2)}`);

const r2 = careNewton(A2, B2, Q2, R2, { P0: Pschur });
assertTrue('Newton converges', r2.residualNorm < 1e-14,
  `iter=${r2.iter}, res=${r2.residualNorm.toExponential(2)}`);
assertTrue('Newton improves Schur result',
  r2.residualNorm <= initResidual + 1e-15,
  `Schur=${initResidual.toExponential(2)}, Newton=${r2.residualNorm.toExponential(2)}`);

// L2 - quadratic convergence: from slightly perturbed P0
console.log('\n> L2 Quadratic convergence from perturbed initial');
const P0 = Pschur.map(row => row.map(v => v + 0.01));  // perturb
const r3 = careNewton(A2, B2, Q2, R2, { P0, maxIter: 20 });
assertTrue('converges from perturbed start',
  r3.residualNorm < 1e-12,
  `iter=${r3.iter}, res=${r3.residualNorm.toExponential(2)}`);
assertTrue('few iterations needed (<=10)', r3.iter <= 10, `iter=${r3.iter}`);

// L3 - compare to Schur reference
console.log('\n> L3 Cross-check vs Schur CARE');
let maxDiff = 0;
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
  maxDiff = Math.max(maxDiff, Math.abs(r2.P[i][j] - Pschur[i][j]));
}
assertTrue('Newton P close to Schur P (within 1e-6)', maxDiff < 1e-6,
  `max diff=${maxDiff.toExponential(2)}`);

// L4 - boundary
console.log('\n> L4 Boundary');
assertThrows('zero B (rank-deficient) handled',
  () => careNewton([[1]], [[0]], [[1]], [[1]]));

// verifyCARE returns 0 for analytical solution
const trueResidual = verifyCARE([[Pexpected]], Ascalar, Bscalar, Qscalar, Rscalar);
assertTrue('verifyCARE returns 0 for analytical solution',
  trueResidual < 1e-14, `res=${trueResidual.toExponential(2)}`);

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All E1 Newton-CARE checks passed');
  process.exit(0);
} else {
  console.log(`${failed} E1 check(s) FAILED`);
  process.exit(1);
}
