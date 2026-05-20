#!/usr/bin/env node
/**
 * verify_p29_sdp.mjs — Phase 29-03: SDP / LMI solver (ADMM)
 *
 * Tests:
 *   1.  symmetricEig reconstructs A = V·diag(λ)·Vᵀ
 *   2.  symmetricEig eigenvalues match known (2×2)
 *   3.  projectPSD clamps negative eigenvalues to 0 (via solveSDP path)
 *   4.  min t s.t. tI − M ⪰ 0  →  t* = λ_max(M)   (M = [[3,1],[1,3]], λmax=4)
 *   5.  min λ_max for diagonal M = diag(1,5,2) → 5
 *   6.  LMI feasibility (feasible problem) → eigmin ≥ −tol, feasible=true
 *   7.  Infeasible LMI detected → feasible=false
 *   8.  Lyapunov LMI: stable A admits P ⪰ εI with AᵀP+PA ⪯ 0 → feasible
 *   9.  Lyapunov LMI: solution P actually satisfies both blocks
 *  10.  eigmin consistent with feasible flag
 *  11.  solveLMIFeasibility wrapper works (objective = 0)
 *  12.  min λ_max returns F(x) with eigmin ≈ 0 (constraint active)
 */

import { solveSDP, solveLMIFeasibility, symmetricEig } from '../js/math/optimization.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 1e-3) { return Math.abs(a - b) <= tol; }

function blkdiag(A, B) {
  const na = A.length, nb = B.length, n = na + nb;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) M[i][j] = A[i][j];
  for (let i = 0; i < nb; i++) for (let j = 0; j < nb; j++) M[na+i][na+j] = B[i][j];
  return M;
}
function matMul(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) for (let j = 0; j < m; j++) C[i][j] += A[i][k]*B[k][j];
  return C;
}
function matT(A) { return A[0].map((_, j) => A.map(r => r[j])); }
function minEigLocal(A) { return Math.min(...symmetricEig(A).values); }

console.log('\n=== P29-03: SDP / LMI Solver (ADMM) ===\n');

// ── Test 1-2: symmetricEig ────────────────────────────────────────────────
{
  const A = [[2, 1], [1, 2]];   // eigenvalues 1, 3
  const { values, vectors } = symmetricEig(A);
  const sorted = [...values].sort((a, b) => a - b);
  ok('Test 2: eigenvalues ≈ {1, 3}', close(sorted[0], 1, 1e-6) && close(sorted[1], 3, 1e-6),
    `λ=[${sorted.map(v => v.toFixed(4))}]`);

  // reconstruct A = V Λ Vᵀ
  const n = 2;
  const recon = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    recon[i][j] += values[k] * vectors[i][k] * vectors[j][k];
  let maxErr = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) maxErr = Math.max(maxErr, Math.abs(recon[i][j] - A[i][j]));
  ok('Test 1: A = V·diag(λ)·Vᵀ reconstruction err < 1e-9', maxErr < 1e-9, `err=${maxErr.toExponential(2)}`);
}

// ── Test 3: PSD projection via solveSDP feasibility on indefinite F0 ───────
{
  // F0 = diag(1,-2); no variables → F(x)=F0 fixed, infeasible (eigmin=-2)
  const r = solveSDP([[1,0],[0,-2]], []);
  ok('Test 3: indefinite constant LMI → infeasible (eigmin≈-2)',
    close(r.eigmin, -2, 1e-3) && !r.feasible, `eigmin=${r.eigmin.toFixed(4)}`);
}

// ── Test 4: min t s.t. tI − M ⪰ 0 → t* = λ_max(M) ────────────────────────
{
  const M = [[3, 1], [1, 3]];   // λ_max = 4
  const F0 = M.map(row => row.map(v => -v));   // −M
  const F1 = [[1, 0], [0, 1]];                  // I (coeff of t)
  const r = solveSDP(F0, [F1], [1], { maxIter: 2000, rho: 1, tol: 1e-8 });
  ok('Test 4: min λ_max = 4', close(r.x[0], 4, 5e-3), `t*=${r.x[0].toFixed(4)}`);
}

// ── Test 5: min λ_max diagonal M = diag(1,5,2) → 5 ───────────────────────
{
  const M = [[1,0,0],[0,5,0],[0,0,2]];
  const F0 = M.map(row => row.map(v => -v));
  const I3 = [[1,0,0],[0,1,0],[0,0,1]];
  const r = solveSDP(F0, [I3], [1], { maxIter: 2000, rho: 1, tol: 1e-8 });
  ok('Test 5: min λ_max(diag(1,5,2)) = 5', close(r.x[0], 5, 5e-3), `t*=${r.x[0].toFixed(4)}`);
}

// ── Test 6: feasible LMI ─────────────────────────────────────────────────
{
  // F(x) = [[1+x,0],[0,1]] ⪰ 0 needs x ≥ -1; x=0 feasible
  const r = solveLMIFeasibility([[1,0],[0,1]], [[[1,0],[0,0]]]);
  ok('Test 6: feasible LMI → eigmin ≥ -tol, feasible=true',
    r.feasible && r.eigmin > -1e-4, `eigmin=${r.eigmin.toFixed(4)}, feasible=${r.feasible}`);
}

// ── Test 7: infeasible LMI ───────────────────────────────────────────────
{
  // F(x) = [[-1,x],[x,-1]]; eigenvalues -1±x → never PSD
  const r = solveLMIFeasibility([[-1,0],[0,-1]], [[[0,1],[1,0]]]);
  ok('Test 7: infeasible LMI detected (feasible=false)',
    !r.feasible, `eigmin=${r.eigmin.toFixed(4)}, feasible=${r.feasible}`);
}

// ── Test 8-9: Lyapunov LMI feasibility ───────────────────────────────────
{
  // Stable A; find P=[[p1,p2],[p2,p3]] s.t. P ⪰ εI and -(AᵀP+PA) ⪰ 0
  const A = [[-1, 1], [0, -2]];
  const eps = 0.1;
  // Block 1 basis (P - εI):
  const b1_0  = [[-eps,0],[0,-eps]];
  const b1_p1 = [[1,0],[0,0]];
  const b1_p2 = [[0,1],[1,0]];
  const b1_p3 = [[0,0],[0,1]];
  // Block 2 basis (-(AᵀP+PA)): from AᵀP+PA = [[-2p1, p1-3p2],[p1-3p2, 2p2-4p3]]
  const b2_0  = [[0,0],[0,0]];
  const b2_p1 = [[2,-1],[-1,0]];
  const b2_p2 = [[0,3],[3,-2]];
  const b2_p3 = [[0,0],[0,4]];

  const F0  = blkdiag(b1_0,  b2_0);
  const Fp1 = blkdiag(b1_p1, b2_p1);
  const Fp2 = blkdiag(b1_p2, b2_p2);
  const Fp3 = blkdiag(b1_p3, b2_p3);

  const r = solveSDP(F0, [Fp1, Fp2, Fp3], null, { maxIter: 3000, rho: 1, tol: 1e-7 });
  ok('Test 8: Lyapunov LMI feasible for stable A',
    r.feasible, `eigmin=${r.eigmin.toFixed(4)}, feasible=${r.feasible}`);

  // Verify the recovered P satisfies both physical conditions
  const [p1, p2, p3] = r.x;
  const P = [[p1, p2], [p2, p3]];
  const AtP_PA = matMul(matT(A), P).map((row, i) => row.map((v, j) => v + matMul(P, A)[i][j]));
  const Pmin = minEigLocal(P);
  const negAtPPA_min = minEigLocal(AtP_PA.map(row => row.map(v => -v)));
  ok('Test 9: recovered P ≻ 0 and -(AᵀP+PA) ⪰ 0',
    Pmin > -1e-3 && negAtPPA_min > -1e-3,
    `λmin(P)=${Pmin.toFixed(4)}, λmin(-(AᵀP+PA))=${negAtPPA_min.toFixed(4)}`);
}

// ── Test 10: eigmin consistent with feasible flag ────────────────────────
{
  const r = solveLMIFeasibility([[2,0],[0,2]], [[[1,0],[0,1]]]);  // already PD
  ok('Test 10: PD constant → feasible, eigmin > 0',
    r.feasible && r.eigmin > 0, `eigmin=${r.eigmin.toFixed(4)}`);
}

// ── Test 11: solveLMIFeasibility objective = 0 ───────────────────────────
{
  const r = solveLMIFeasibility([[1,0],[0,1]], [[[1,0],[0,0]]]);
  ok('Test 11: feasibility objective = 0', close(r.objective, 0, 1e-9), `obj=${r.objective}`);
}

// ── Test 12: min λ_max constraint active (eigmin ≈ 0) ────────────────────
{
  const M = [[2,0.5],[0.5,2]];   // λ_max = 2.5
  const F0 = M.map(row => row.map(v => -v));
  const r = solveSDP(F0, [[[1,0],[0,1]]], [1], { maxIter: 2000, tol: 1e-8 });
  ok('Test 12: min λ_max → F(x*) eigmin ≈ 0 (active)',
    Math.abs(r.eigmin) < 5e-3, `eigmin=${r.eigmin.toFixed(5)}, t*=${r.x[0].toFixed(4)}`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P29-03 SDP/LMI solver: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
