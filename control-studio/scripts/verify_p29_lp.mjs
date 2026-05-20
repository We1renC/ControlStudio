#!/usr/bin/env node
/**
 * verify_p29_lp.mjs — Phase 29-02: Linear Program solver
 *
 * Validates solveLP against known LP vertex solutions and feasibility.
 *
 * Tests:
 *   1.  Simple 2-var inequality LP → optimal vertex
 *   2.  ≥-constraint LP (negated to ≤) → optimal vertex
 *   3.  Classic 2-constraint LP → vertex (4, 0), fval = -12
 *   4.  Equality-constrained LP → vertex on simplex
 *   5.  Box-only LP → per-coordinate bound by sign of c
 *   6.  Primal feasibility: Ax ≤ b (within tol)
 *   7.  Box feasibility: lb ≤ x ≤ ub
 *   8.  fval matches cᵀx
 *   9.  Diet-like LP (min cost s.t. nutrient ≥ requirements)
 *  10.  Degenerate LP (multiple optima) → minimum-norm tie-break, optimal fval
 *  11.  Equality + inequality + box combined
 *  12.  Converged flag true on well-posed LP
 */

import { solveLP } from '../js/math/optimization.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 1e-3) { return Math.abs(a - b) <= tol; }
function vClose(a, b, tol = 1e-3) { return a.length === b.length && a.every((v, i) => close(v, b[i], tol)); }
function matVec(A, x) { return A.map(row => row.reduce((s, a, j) => s + a * x[j], 0)); }
function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

console.log('\n=== P29-02: Linear Program Solver ===\n');

// ── Test 1: min -x-2y s.t. x+y≤1, x,y≥0 → (0,1), fval=-2 ─────────────────
{
  const r = solveLP([-1, -2], { A: [[1, 1]], b: [1], lb: [0, 0], ub: [1e6, 1e6] });
  ok('Test 1: optimal vertex (0, 1)', vClose(r.x, [0, 1], 1e-2), `x=[${r.x.map(v=>v.toFixed(4))}]`);
  ok('Test 1: fval = -2', close(r.fval, -2, 1e-2), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 2: min 2x+y s.t. x+y≥1 (-x-y≤-1), x,y≥0 → (0,1), fval=1 ─────────
{
  const r = solveLP([2, 1], { A: [[-1, -1]], b: [-1], lb: [0, 0], ub: [1e6, 1e6] });
  ok('Test 2: ≥-constraint optimal (0, 1)', vClose(r.x, [0, 1], 1e-2), `x=[${r.x.map(v=>v.toFixed(4))}]`);
  ok('Test 2: fval = 1', close(r.fval, 1, 1e-2), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 3: classic LP min -3x-2y s.t. x+y≤4, x+3y≤6 → (4,0), fval=-12 ───
{
  const r = solveLP([-3, -2], { A: [[1, 1], [1, 3]], b: [4, 6], lb: [0, 0], ub: [1e6, 1e6] });
  ok('Test 3: optimal vertex (4, 0)', vClose(r.x, [4, 0], 1e-2), `x=[${r.x.map(v=>v.toFixed(4))}]`);
  ok('Test 3: fval = -12', close(r.fval, -12, 2e-2), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 4: equality LP min x+2y+3z s.t. x+y+z=3, x,y,z≥0 → (3,0,0) ──────
{
  const r = solveLP([1, 2, 3], { Aeq: [[1, 1, 1]], beq: [3], lb: [0, 0, 0], ub: [1e6,1e6,1e6] });
  ok('Test 4: equality LP optimal (3, 0, 0)', vClose(r.x, [3, 0, 0], 1e-2), `x=[${r.x.map(v=>v.toFixed(4))}]`);
  ok('Test 4: fval = 3', close(r.fval, 3, 1e-2), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 5: box-only LP min -x-y s.t. 0≤x≤2, 0≤y≤3 → (2,3), fval=-5 ──────
{
  const r = solveLP([-1, -1], { lb: [0, 0], ub: [2, 3] });
  ok('Test 5: box-only optimal (2, 3)', vClose(r.x, [2, 3], 1e-3), `x=[${r.x.map(v=>v.toFixed(4))}]`);
  ok('Test 5: fval = -5', close(r.fval, -5, 1e-3), `fval=${r.fval.toFixed(4)}`);
}

// ── Tests 6-8: feasibility & fval on classic LP ──────────────────────────
{
  const c = [-3, -2];
  const A = [[1, 1], [1, 3]];
  const b = [4, 6];
  const lb = [0, 0], ub = [1e6, 1e6];
  const r = solveLP(c, { A, b, lb, ub });
  const Ax = matVec(A, r.x);
  ok('Test 6: primal feasibility Ax ≤ b', A.every((_, i) => Ax[i] <= b[i] + 1e-4),
    `Ax=[${Ax.map(v=>v.toFixed(4))}]`);
  ok('Test 7: box feasibility lb ≤ x ≤ ub',
    r.x.every((xi, i) => xi >= lb[i] - 1e-6 && xi <= ub[i] + 1e-6));
  ok('Test 8: fval = cᵀx', close(r.fval, dot(c, r.x), 1e-9),
    `fval=${r.fval.toFixed(6)}, cᵀx=${dot(c, r.x).toFixed(6)}`);
}

// ── Test 9: diet-like LP ─────────────────────────────────────────────────
// min 2·xA + 3·xB  s.t.  nutrient1: xA + 2xB ≥ 4,  nutrient2: 3xA + xB ≥ 6
// negate ≥ to ≤: -xA-2xB ≤ -4 ; -3xA-xB ≤ -6 ; xA,xB ≥ 0
// Vertices: intersection of the two constraints: xA+2xB=4, 3xA+xB=6
//   → 3xA+xB=6, xA=4-2xB → 3(4-2xB)+xB=6 → 12-5xB=6 → xB=1.2, xA=1.6 → cost=2(1.6)+3(1.2)=6.8
//   Check axis vertices: (xA=2,xB=0):cost4? feasibility: -2≤-... 3·2=6≥6 ✓, 2≥4? no → infeasible
//   (xB=2,xA=0): xA+2xB=4 ✓, 3·0+2=2≥6? no → infeasible. So interior vertex (1.6,1.2) cost 6.8
{
  const r = solveLP([2, 3], {
    A: [[-1, -2], [-3, -1]], b: [-4, -6], lb: [0, 0], ub: [1e6, 1e6]
  });
  ok('Test 9: diet LP optimal (1.6, 1.2)', vClose(r.x, [1.6, 1.2], 2e-2), `x=[${r.x.map(v=>v.toFixed(4))}]`);
  ok('Test 9: diet cost ≈ 6.8', close(r.fval, 6.8, 5e-2), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 10: degenerate LP (multiple optima) ─────────────────────────────
// min -x-y s.t. x+y≤2, 0≤x,y≤2 → entire edge x+y=2 optimal (fval=-2).
// Regularized solver picks min-norm point on the edge: (1,1).
{
  const r = solveLP([-1, -1], { A: [[1, 1]], b: [2], lb: [0, 0], ub: [2, 2] });
  ok('Test 10: degenerate LP optimal fval = -2', close(r.fval, -2, 1e-2), `fval=${r.fval.toFixed(4)}`);
  ok('Test 10: min-norm tie-break ≈ (1, 1)', vClose(r.x, [1, 1], 5e-2), `x=[${r.x.map(v=>v.toFixed(4))}]`);
}

// ── Test 11: equality + inequality + box ─────────────────────────────────
// min -x-y-z s.t. x+y+z=3 (eq), x≤1 (ineq), 0≤x,y,z≤2 (box)
// maximize x+y+z=3 fixed by equality → any feasible point gives fval=-3.
// min-norm on the feasible set; just check fval and feasibility.
{
  const r = solveLP([-1, -1, -1], {
    Aeq: [[1, 1, 1]], beq: [3], A: [[1, 0, 0]], b: [1], lb: [0, 0, 0], ub: [2, 2, 2]
  });
  const sum = r.x[0] + r.x[1] + r.x[2];
  ok('Test 11: eq+ineq+box — equality satisfied (sum=3)', close(sum, 3, 1e-3), `sum=${sum.toFixed(4)}`);
  ok('Test 11: x ≤ 1 inequality respected', r.x[0] <= 1 + 1e-4, `x0=${r.x[0].toFixed(4)}`);
  ok('Test 11: box respected', r.x.every(v => v >= -1e-6 && v <= 2 + 1e-6));
}

// ── Test 12: converged flag ──────────────────────────────────────────────
{
  const r = solveLP([1, -1], { A: [[1, 0], [0, 1]], b: [5, 5], lb: [-5, -5], ub: [5, 5] });
  ok('Test 12: converged on well-posed LP', r.converged, `conv=${r.converged}, iters=${r.iterations}`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P29-02 LP solver: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
