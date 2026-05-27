#!/usr/bin/env node
/**
 * verify_realschur_symmetric.mjs — Real Schur symmetric fast-path regression.
 *
 * The Francis QR fallback can be rough on small symmetric matrices with tightly
 * clustered real spectra. Symmetric real matrices have a stronger theorem:
 * A = QΛQᵀ with orthogonal Q and real diagonal Λ. This script locks the
 * Jacobi-based symmetric path used by realSchur().
 */

import { realSchur } from '../js/math/realschur.js';

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

function transpose(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

function mul(A, B) {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}

function maxAbsDiff(A, B) {
  let worst = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[0].length; j++) {
      worst = Math.max(worst, Math.abs(A[i][j] - B[i][j]));
    }
  }
  return worst;
}

function offDiagMax(T) {
  let worst = 0;
  for (let i = 0; i < T.length; i++) {
    for (let j = 0; j < T.length; j++) {
      if (i !== j) worst = Math.max(worst, Math.abs(T[i][j]));
    }
  }
  return worst;
}

console.log('\n=== Real Schur symmetric fast path ===\n');

{
  const A = [
    [-1, 0.3, 0.2],
    [0.3, -2, 0.1],
    [0.2, 0.1, -3],
  ];
  const { T, Q, eigenvalues } = realSchur(A);
  const recon = mul(mul(Q, T), transpose(Q));
  const qtq = mul(transpose(Q), Q);
  const I = Q.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));

  ok('Test 1: symmetric 3x3 reconstruction error < 1e-12',
    maxAbsDiff(A, recon) < 1e-12,
    `err=${maxAbsDiff(A, recon).toExponential(2)}`);
  ok('Test 1: Q is orthogonal',
    maxAbsDiff(qtq, I) < 1e-12,
    `err=${maxAbsDiff(qtq, I).toExponential(2)}`);
  ok('Test 1: T is diagonal for symmetric Schur path',
    offDiagMax(T) < 1e-12,
    `offDiag=${offDiagMax(T).toExponential(2)}`);
  ok('Test 1: stable eigenvalues are all first',
    eigenvalues.every((e) => e.re < 0),
    eigenvalues.map((e) => e.re.toFixed(4)).join(', '));
}

{
  const A = [
    [2, 0.2, 0],
    [0.2, -3, 0.4],
    [0, 0.4, -1],
  ];
  const { T, Q, eigenvalues } = realSchur(A);
  const recon = mul(mul(Q, T), transpose(Q));
  ok('Test 2: mixed stable/unstable symmetric reconstruction error < 1e-12',
    maxAbsDiff(A, recon) < 1e-12,
    `err=${maxAbsDiff(A, recon).toExponential(2)}`);
  ok('Test 2: stable eigenvalues ordered before unstable eigenvalues',
    eigenvalues[0].re < 0 && eigenvalues[1].re < 0 && eigenvalues[2].re > 0,
    eigenvalues.map((e) => e.re.toFixed(4)).join(', '));
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`Real Schur symmetric: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
