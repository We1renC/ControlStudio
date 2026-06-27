#!/usr/bin/env node
/**
 * verify_p25_model_reduction.mjs — Phase 25: minrealSS + balancedTruncation
 *
 * Tests (minrealSS):
 *   1. Minimal system passes through unchanged (no states removed)
 *   2. Uncontrollable state removed — controllableRank < n
 *   3. Unobservable state removed — observableRank < controllableRank
 *   4. Completely uncontrollable system → order=0
 *   5. DC gain preserved after minrealSS
 *
 * Tests (balancedTruncation):
 *   6. HSVD has length n and is sorted descending
 *   7. Reduced system has correct dimensions
 *   8. Error bound = 2·Σ(σᵢ, i>order) — formula verified
 *   9. DC gain of reduced system close to original (within error bound)
 *  10. Higher order → smaller error bound (monotone)
 *  11. 3rd-order → 1st-order: DC error respects the BT H∞ bound
 *  12. Invalid requested order throws
 *  13. Unstable minreal uses structural Kalman matrices
 *  14. Gramian diagnostics preserve exact rank deficiency and zero HSVs
 *  15. BT rejects orders above the Hankel numerical rank
 */

import {
  minrealSS,
  balancedTruncation,
  gramianDiagnostics,
} from '../js/control/model_reduction.js';
import { stateSpaceToTransferFunction }   from '../js/control/state-space.js';

let passed = 0, failed = 0;

function ok(msg, cond, detail = '') {
  if (cond) {
    console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`);
    failed++;
  }
}
function close(a, b, tol) { return Math.abs(a - b) <= tol; }

/** DC gain of (A,B,C,D): C·(-A)⁻¹·B + D  (continuous-time) */
function dcGain(A, B, C, D) {
  const n = A.length;
  if (n === 0) return D[0][0];
  // Solve -A·x = B[:,0]
  const neg_A = A.map(row => row.map(v => -v));
  // Gauss elimination for neg_A · x = B_col
  const B_col = A.map((_, i) => B[i][0]);
  const aug = neg_A.map((row, i) => [...row, B_col[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-14) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col] / piv;
      for (let c = col; c <= n; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  const x = aug.map((row, i) => Math.abs(row[i]) > 1e-14 ? row[n] / row[i] : 0);
  let dc = D[0][0];
  for (let j = 0; j < n; j++) dc += C[0][j] * x[j];
  return dc;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== P25-03: minrealSS — Kalman Structural Decomposition ===\n');

// Test 1: minimal system (all states controllable + observable) → unchanged
{
  // G(s) = 1/(s+1): minimal, n=1
  const A = [[-1]], B = [[1]], C = [[1]], D = [[0]];
  const r = minrealSS(A, B, C, D);
  ok('Test 1: minimal SISO 1st-order — order unchanged',
    r.order === 1, `order=${r.order}`);
  ok('Test 1: isControllable=true, isObservable=true',
    r.isControllable && r.isObservable);
  ok('Test 1: removedStates=0', r.removedStates === 0);
}

// Test 2: uncontrollable state (2nd state driven by zero input)
{
  // A = [-1  0; 0 -2], B = [1; 0]  →  state 2 uncontrollable
  const A = [[-1, 0], [0, -2]];
  const B = [[1], [0]];
  const C = [[1, 0]];
  const D = [[0]];
  const r = minrealSS(A, B, C, D);
  ok('Test 2: uncontrollable state removed — order=1',
    r.order === 1, `order=${r.order}, controllableRank=${r.controllableRank}`);
  ok('Test 2: isControllable=false', !r.isControllable);
}

// Test 3: unobservable state (output only observes state 1)
{
  // A = [-1  0; 0 -3], B = [1;1], C = [1, 0]
  // Both states controllable, but state 2 unobservable from output
  const A = [[-1, 0], [0, -3]];
  const B = [[1], [1]];
  const C = [[1, 0]];
  const D = [[0]];
  const r = minrealSS(A, B, C, D);
  ok('Test 3: unobservable state removed — order=1',
    r.order === 1, `order=${r.order}, observableRank=${r.observableRank}`);
  ok('Test 3: isObservable=false', !r.isObservable);
}

// Test 4: DC gain preserved after minrealSS
{
  // G(s) = 1/(s+2) minimal; DC gain = 0.5
  const A = [[-2]], B = [[1]], C = [[1]], D = [[0]];
  const r = minrealSS(A, B, C, D);
  const dc = dcGain(r.A, r.B, r.C, r.D);
  ok('Test 4: DC gain preserved after minrealSS',
    close(dc, 0.5, 1e-6), `dc=${dc.toFixed(6)}, expected=0.5`);
}

// Test 5: 3rd-order system with 1 uncontrollable + 1 unobservable → order=1
{
  // G(s) = 1/(s+1) embedded in 3-state system:
  // A = diag(-1, -2, -3), B = [1;0;0], C = [1,0,0]
  // State 2,3 uncontrollable (or unobservable)
  const A = [[-1,0,0],[0,-2,0],[0,0,-3]];
  const B = [[1],[0],[0]];
  const C = [[1,0,0]];
  const D = [[0]];
  const r = minrealSS(A, B, C, D);
  ok('Test 5: 3-state → 1-state minimal realisation',
    r.order === 1, `order=${r.order}`);
  ok('Test 5: DC gain preserved',
    close(dcGain(r.A, r.B, r.C, r.D), 1.0, 1e-4),
    `dc=${dcGain(r.A, r.B, r.C, r.D).toFixed(4)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== P25-01: balancedTruncation ===\n');

// Helper: 3rd-order stable system G(s) = 1/((s+1)(s+2)(s+3))
// Controllable canonical form
function make3rdOrder() {
  // G(s) = 1/(s³+6s²+11s+6)
  const A = [[0,1,0],[0,0,1],[-6,-11,-6]];
  const B = [[0],[0],[1]];
  const C = [[1,0,0]];
  const D = [[0]];
  return { A, B, C, D };
}

// Test 6: HSVD length = n, sorted descending
{
  const { A, B, C, D } = make3rdOrder();
  const r = balancedTruncation(A, B, C, D, 2);
  ok('Test 6: hsvd.length = n',
    r.hsvd.length === 3, `hsvd.length=${r.hsvd.length}`);
  let sorted = true;
  for (let i = 1; i < r.hsvd.length; i++)
    if (r.hsvd[i] > r.hsvd[i-1] + 1e-10) { sorted = false; break; }
  ok('Test 6: hsvd sorted descending', sorted,
    `hsvd=[${r.hsvd.map(s=>s.toFixed(4)).join(', ')}]`);
  ok('Test 6: all hsvd > 0', r.hsvd.every(s => s > 0));
}

// Test 7: reduced system has correct dimensions
{
  const { A, B, C, D } = make3rdOrder();
  const r = balancedTruncation(A, B, C, D, 1);
  ok('Test 7: Ar is 1×1', r.A.length === 1 && r.A[0].length === 1);
  ok('Test 7: Br is 1×1', r.B.length === 1 && r.B[0].length === 1);
  ok('Test 7: Cr is 1×1', r.C.length === 1 && r.C[0].length === 1);
  ok('Test 7: order=1',   r.order === 1);
}

// Test 8: error bound = 2·sum(hsvd[order..n-1])
{
  const { A, B, C, D } = make3rdOrder();
  const r = balancedTruncation(A, B, C, D, 2);
  const expectedBound = 2 * r.hsvd.slice(2).reduce((s,v) => s+v, 0);
  ok('Test 8: errorBound = 2·Σσᵢ (i>order)',
    close(r.errorBound, expectedBound, 1e-10),
    `bound=${r.errorBound.toExponential(4)}, expected=${expectedBound.toExponential(4)}`);
}

// Test 9: DC gain of reduced system within error bound of original
{
  const { A, B, C, D } = make3rdOrder();
  // Original DC gain = 1/6
  const dcOrig = dcGain(A, B, C, D);
  const r2 = balancedTruncation(A, B, C, D, 2);
  const dcReduced = dcGain(r2.A, r2.B, r2.C, r2.D);
  ok('Test 9: DC gain difference ≤ error bound (order=2)',
    Math.abs(dcReduced - dcOrig) <= r2.errorBound + 1e-6,
    `|Δdc|=${Math.abs(dcReduced-dcOrig).toExponential(3)}, bound=${r2.errorBound.toExponential(3)}`);
}

// Test 10: higher order → smaller (or equal) error bound (monotone)
{
  const { A, B, C, D } = make3rdOrder();
  const r1 = balancedTruncation(A, B, C, D, 1);
  const r2 = balancedTruncation(A, B, C, D, 2);
  ok('Test 10: errorBound(order=1) ≥ errorBound(order=2)',
    r1.errorBound >= r2.errorBound - 1e-10,
    `bound1=${r1.errorBound.toExponential(3)}, bound2=${r2.errorBound.toExponential(3)}`);
}

// Test 11: DC is one frequency sample, so its error must respect the H∞ bound.
{
  const { A, B, C, D } = make3rdOrder();
  const dcOrig = dcGain(A, B, C, D);
  const r1 = balancedTruncation(A, B, C, D, 1);
  const dcRed = dcGain(r1.A, r1.B, r1.C, r1.D);
  const dcError = Math.abs(dcRed - dcOrig);
  ok('Test 11: 3rd→1st order DC error ≤ BT H∞ bound',
    dcError <= r1.errorBound + 1e-10,
    `|Δdc|=${dcError.toExponential(4)}, bound=${r1.errorBound.toExponential(4)}`);
}

// Test 12: invalid order throws
{
  const { A, B, C, D } = make3rdOrder();
  let threw = false;
  try { balancedTruncation(A, B, C, D, 0); } catch { threw = true; }
  ok('Test 12: order=0 throws', threw);
  threw = false;
  try { balancedTruncation(A, B, C, D, 3); } catch { threw = true; }
  ok('Test 12: order=n throws', threw);
}

// Test 13: unstable systems must use structural Kalman matrices in minrealSS.
{
  const A = [[1, 0], [0, -2]];
  const B = [[1], [0]];
  const C = [[1, 0]];
  const D = [[0]];
  const r = minrealSS(A, B, C, D);
  ok('Test 13: unstable minreal removes uncontrollable stable state',
    r.order === 1 && r.controllableRank === 1 && r.observableRank === 1);
  ok('Test 13: unstable controllable mode is preserved',
    close(r.A[0][0], 1, 1e-10), `A_r=${r.A[0][0]}`);
}

// Test 14: exact zero-energy modes remain zero, not tolerance-sized pseudo-modes.
{
  const A = [[-1,0,0],[0,-2,0],[0,0,-3]];
  const B = [[1],[0],[0]];
  const C = [[1,0,0]];
  const D = [[0]];
  const diagnostics = gramianDiagnostics(A, B, C, D);
  ok('Test 14: controllability/observability rank = 1',
    diagnostics.controllabilityRank === 1 && diagnostics.observabilityRank === 1);
  ok('Test 14: nonminimal realization is reported',
    diagnostics.minimal === false);
  ok('Test 14: unreachable/unobservable HSVs remain exactly zero',
    close(diagnostics.hsv[0], 0.5, 1e-12)
      && diagnostics.hsv[1] === 0
      && diagnostics.hsv[2] === 0,
    `hsv=[${diagnostics.hsv.map((value) => value.toExponential(3)).join(', ')}]`);
}

// Test 15: BT may retain the energetic subspace but not artificial zero modes.
{
  const A = [[-1,0,0],[0,-2,0],[0,0,-3]];
  const B = [[1],[0],[0]];
  const C = [[1,0,0]];
  const D = [[0]];
  const r = balancedTruncation(A, B, C, D, 1);
  ok('Test 15: BT reports effective Hankel rank 1',
    r.effectiveRank === 1 && r.minimal === false);
  ok('Test 15: order-1 BT preserves exact active mode',
    close(r.A[0][0], -1, 1e-10)
      && close(r.B[0][0], 1, 1e-10)
      && close(r.C[0][0], 1, 1e-10));
  let threw = false;
  try { balancedTruncation(A, B, C, D, 2); } catch (error) {
    threw = /exceeds Hankel numerical rank 1/.test(error.message);
  }
  ok('Test 15: BT rejects order above Hankel numerical rank', threw);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`P25 model reduction: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
