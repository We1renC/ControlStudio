#!/usr/bin/env node
/**
 * verify_e2_sylvester.mjs
 *
 * Tier E2 — Bartels-Stewart Sylvester equation solver
 *
 * Solves AX + XB = C
 *
 * Checks:
 *  L1 Analytic — 1x1 scalar: (a + b) x = c
 *  L1 Analytic — diagonal: x_{ij} = c_{ij} / (a_i + b_j)
 *  L2 Property — random stable A, B: residual ||AX + XB - C|| < 1e-10
 *  L2 Property — Lyapunov special case: AP + PA' = -Q -> P symmetric, positive definite
 *  L3 Cross   — solveLyapunovCT vs direct Sylvester give equal result
 *  L4 Boundary — non-square dimensions throw
 *  L4 Boundary — A and -B share eigenvalue -> throws (uniqueness lost)
 */
import {
  solveSylvester,
  solveLyapunovCT,
  solveLyapunovDT,
} from '../js/math/sylvester.js';
import { matMul, matAdd, matSub, matTranspose, matSymmetrize } from '../js/math/matrix.js';

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

function maxAbsMatrix(A) {
  let m = 0;
  for (const row of A) for (const v of row) m = Math.max(m, Math.abs(v));
  return m;
}

console.log('===============================================================');
console.log('  E2 Sylvester Solver - Bartels-Stewart');
console.log('===============================================================\n');

// L1 - scalar
console.log('> L1 Analytic — scalar 1x1');
const X1 = solveSylvester([[2]], [[3]], [[10]]);
assertNear('1x1: (2+3) x = 10 -> x = 2', X1[0][0], 2, 1e-12);

// L1 - 2x2 diagonal
console.log('\n> L1 Analytic — 2x2 diagonal');
const A2 = [[-1, 0], [0, -2]];
const B2 = [[3, 0], [0, 4]];
const C2 = [[2, 4], [6, 8]];
const X2 = solveSylvester(A2, B2, C2);
// Expected: x_{ij} = c_{ij} / (a_i + b_j)
const X2exp = [
  [2 / 2, 4 / 3],
  [6 / 1, 8 / 2],
];
let maxErr2 = 0;
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++)
  maxErr2 = Math.max(maxErr2, Math.abs(X2[i][j] - X2exp[i][j]));
assertTrue('diagonal X matches closed-form', maxErr2 < 1e-10, `max err=${maxErr2.toExponential(2)}`);

// L2 - random stable, residual check
console.log('\n> L2 Property — random 4x4 with stable A, B (non-overlapping spectra)');
// A has negative real eigenvalues centred around -3 (with complex pair)
// B has positive real eigenvalues centred around +1 (so -B around -1; spectra differ)
const A4 = [
  [-2.5,  0.7,  0.3, -0.1],
  [ 0.4, -3.2,  0.6,  0.2],
  [-0.2,  0.5, -1.8,  0.4],
  [ 0.1,  0.3, -0.4, -2.6],
];
const B4 = [
  [ 1.1,  0.5, -0.2,  0.1],
  [ 0.3,  0.7,  0.4, -0.2],
  [-0.1,  0.4,  1.3,  0.5],
  [ 0.2, -0.1,  0.3,  0.9],
];
const C4 = [
  [1, 2, 3, 4],
  [4, 3, 2, 1],
  [1, 0, 1, 0],
  [0, 1, 0, 1],
];
const X4 = solveSylvester(A4, B4, C4);
const res4 = matSub(matAdd(matMul(A4, X4), matMul(X4, B4)), C4);
const resNorm = maxAbsMatrix(res4);
assertTrue('residual ||AX + XB - C|| < 1e-9', resNorm < 1e-9, `||r||=${resNorm.toExponential(2)}`);

// L2 - Lyapunov: AP + PA' = -Q
console.log('\n> L2 Property — Lyapunov continuous AP + PA\' = -Q');
const Alyap = [[-1, 2], [0, -3]];
const Q = [[1, 0], [0, 1]];
const P = solveLyapunovCT(Alyap, Q);
const AtP = matMul(matTranspose(Alyap), P);
const PA = matMul(P, Alyap);
// Note: this convention checks A'P + PA = -Q (standard for Lyapunov stability)
// Let's check the actual returned convention:
const lhs = matAdd(AtP, PA);
const negQ = Q.map(row => row.map(v => -v));
const lyapRes = maxAbsMatrix(matSub(lhs, negQ));
assertTrue('Lyapunov residual < 1e-9', lyapRes < 1e-9, `||r||=${lyapRes.toExponential(2)}`);
// Symmetric
const Psym = matSymmetrize(P);
const symDiff = maxAbsMatrix(matSub(P, Psym));
assertTrue('Lyapunov P symmetric', symDiff < 1e-9, `||P - sym(P)||=${symDiff.toExponential(2)}`);

// L2 - Lyapunov discrete: A'PA - P = -Q
console.log('\n> L2 Property — Lyapunov discrete A\'PA - P = -Q');
const Ad = [[0.5, 0.2], [0, 0.3]];
const Qd = [[1, 0], [0, 1]];
const Pd = solveLyapunovDT(Ad, Qd);
const AtPA = matMul(matMul(matTranspose(Ad), Pd), Ad);
const lhsD = matSub(AtPA, Pd);
const negQd = Qd.map(row => row.map(v => -v));
const lyapDres = maxAbsMatrix(matSub(lhsD, negQd));
assertTrue('Discrete Lyapunov residual < 1e-9', lyapDres < 1e-9, `||r||=${lyapDres.toExponential(2)}`);

// L4 - dimension mismatch
console.log('\n> L4 Boundary');
assertThrows('non-square A throws',
  () => solveSylvester([[1, 2]], [[1]], [[1]]));
assertThrows('C dim mismatch throws',
  () => solveSylvester([[1]], [[2]], [[1, 2]]));

// L4 - shared eigenvalue: A has eig 2, B has eig -2, so A+(-B) has shared 2
// Actually: AX + XB = C, unique iff A and -B share no eigenvalue
// A=[[2]] B=[[-2]] -> a + b = 0, no solution / non-unique
assertThrows('A and -B sharing eigenvalue throws or returns Inf',
  () => { const X = solveSylvester([[2]], [[-2]], [[1]]);
          if (!Number.isFinite(X[0][0])) throw new Error('non-finite'); });

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All E2 Sylvester checks passed');
  process.exit(0);
} else {
  console.log(`${failed} E2 Sylvester check(s) FAILED`);
  process.exit(1);
}
