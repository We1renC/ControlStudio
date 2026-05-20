#!/usr/bin/env node
/**
 * verify_p29_qp.mjs — Phase 29-01: Quadratic Program solver
 *
 * Validates solveQP / solveEqualityQP / solveBoxQP against closed-form
 * solutions and KKT optimality conditions.
 *
 * Tests:
 *   1.  Unconstrained QP → x* = −H⁻¹f
 *   2.  Equality-constrained QP → analytic KKT solution
 *   3.  Box QP with active bounds → clamped solution
 *   4.  Single active inequality → boundary solution
 *   5.  Inactive inequality → interior (unconstrained) solution
 *   6.  Equality + inequality combined
 *   7.  KKT stationarity residual < 1e-6
 *   8.  Dual feasibility: λ ≥ 0 for all inequalities
 *   9.  Complementary slackness: λ_i·(b−Ax)_i ≈ 0
 *  10.  Primal feasibility: Ax ≤ b (within tol)
 *  11.  PSD (non-PD) Hessian handled via regularization
 *  12.  Random 6-var QP — KKT residual small
 *  13.  solveEqualityQP direct API matches solveQP
 *  14.  solveBoxQP wrapper matches solveQP with lb/ub
 *  15.  fval matches recomputed objective
 *  16.  MPC-like double-integrator condensed QP converges, respects uMax
 */

import { solveQP, solveEqualityQP, solveBoxQP } from '../js/math/optimization.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 1e-5) { return Math.abs(a - b) <= tol; }
function vClose(a, b, tol = 1e-5) { return a.length === b.length && a.every((v, i) => close(v, b[i], tol)); }

function matVec(A, x) { return A.map(row => row.reduce((s, a, j) => s + a * x[j], 0)); }
function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

console.log('\n=== P29-01: Quadratic Program Solver ===\n');

// ── Test 1: unconstrained ─────────────────────────────────────────────────
{
  // min x²-2x + y²-4y → x*=1, y*=2
  const H = [[2, 0], [0, 2]];
  const f = [-2, -4];
  const r = solveQP(H, f);
  ok('Test 1: unconstrained x* = [1, 2]', vClose(r.x, [1, 2]),
    `x=[${r.x.map(v => v.toFixed(4))}]`);
  ok('Test 1: fval = -5', close(r.fval, -5), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 2: equality-constrained ──────────────────────────────────────────
{
  // min x²+y² s.t. x+y=2 → x*=y*=1
  const H = [[2, 0], [0, 2]];
  const f = [0, 0];
  const r = solveQP(H, f, { Aeq: [[1, 1]], beq: [2] });
  ok('Test 2: equality x* = [1, 1]', vClose(r.x, [1, 1]),
    `x=[${r.x.map(v => v.toFixed(4))}]`);
  ok('Test 2: method = kkt-direct', r.method === 'kkt-direct', r.method);
}

// ── Test 3: box QP, active bounds ─────────────────────────────────────────
{
  // min 0.5((x-5)²+(y-5)²) s.t. 0≤x,y≤1 → x*=y*=1
  const H = [[1, 0], [0, 1]];
  const f = [-5, -5];
  const r = solveQP(H, f, { lb: [0, 0], ub: [1, 1] });
  ok('Test 3: box-active x* = [1, 1]', vClose(r.x, [1, 1], 1e-4),
    `x=[${r.x.map(v => v.toFixed(4))}]`);
}

// ── Test 4: single active inequality ──────────────────────────────────────
{
  // min 0.5(x²+y²) s.t. x+y ≥ 2  (-x-y ≤ -2) → x*=y*=1
  const H = [[1, 0], [0, 1]];
  const f = [0, 0];
  const r = solveQP(H, f, { A: [[-1, -1]], b: [-2] });
  ok('Test 4: single-active x* = [1, 1]', vClose(r.x, [1, 1], 1e-4),
    `x=[${r.x.map(v => v.toFixed(4))}]`);
  ok('Test 4: fval = 1', close(r.fval, 1, 1e-4), `fval=${r.fval.toFixed(4)}`);
}

// ── Test 5: inactive inequality ───────────────────────────────────────────
{
  // min 0.5((x-0.5)²+(y-0.5)²) s.t. x+y ≤ 10 → interior x*=[0.5,0.5]
  const H = [[1, 0], [0, 1]];
  const f = [-0.5, -0.5];
  const r = solveQP(H, f, { A: [[1, 1]], b: [10] });
  ok('Test 5: inactive ineq x* = [0.5, 0.5]', vClose(r.x, [0.5, 0.5], 1e-4),
    `x=[${r.x.map(v => v.toFixed(4))}]`);
}

// ── Test 6: equality + inequality ─────────────────────────────────────────
{
  // min x²+y²+z² s.t. x+y+z=3 (eq), z ≤ 0.5 (ineq)
  // Without ineq: x=y=z=1. With z≤0.5: z*=0.5, x=y=1.25
  const H = [[2,0,0],[0,2,0],[0,0,2]];
  const f = [0,0,0];
  const r = solveQP(H, f, { Aeq: [[1,1,1]], beq: [3], A: [[0,0,1]], b: [0.5] });
  ok('Test 6: eq+ineq x* = [1.25, 1.25, 0.5]', vClose(r.x, [1.25, 1.25, 0.5], 1e-3),
    `x=[${r.x.map(v => v.toFixed(4))}]`);
}

// ── Tests 7-10: KKT conditions on a representative problem ─────────────────
{
  // min 0.5 xᵀHx + fᵀx s.t. A x ≤ b
  const H = [[4, 1], [1, 2]];
  const f = [1, -1];
  const A = [[1, 1], [-1, 2], [0, -1]];
  const b = [2, 2, 0];
  const r = solveQP(H, f, { A, b });

  // stationarity: Hx + f + Aᵀλ ≈ 0
  const Hx = matVec(H, r.x);
  const Atl = [0, 0];
  for (let i = 0; i < A.length; i++) { Atl[0] += A[i][0] * r.lambda[i]; Atl[1] += A[i][1] * r.lambda[i]; }
  const stat = [Hx[0] + f[0] + Atl[0], Hx[1] + f[1] + Atl[1]];
  ok('Test 7: KKT stationarity residual < 1e-6',
    Math.hypot(stat[0], stat[1]) < 1e-6, `||r_d||=${Math.hypot(stat[0], stat[1]).toExponential(2)}`);

  ok('Test 8: dual feasibility λ ≥ 0',
    r.lambda.every(l => l >= -1e-8), `λ=[${r.lambda.map(l => l.toFixed(4))}]`);

  const Ax = matVec(A, r.x);
  const compl = A.map((_, i) => Math.abs(r.lambda[i] * (b[i] - Ax[i])));
  ok('Test 9: complementary slackness max|λ(b-Ax)| < 1e-5',
    Math.max(...compl) < 1e-5, `max=${Math.max(...compl).toExponential(2)}`);

  ok('Test 10: primal feasibility Ax ≤ b',
    A.every((_, i) => Ax[i] <= b[i] + 1e-7), `Ax=[${Ax.map(v => v.toFixed(4))}]`);
}

// ── Test 11: PSD (non-PD) Hessian ─────────────────────────────────────────
{
  // H singular (rank 1): min 0.5(x+y)² + f'x  s.t. box
  const H = [[1, 1], [1, 1]];
  const f = [-1, 0];
  const r = solveQP(H, f, { lb: [-5, -5], ub: [5, 5] });
  ok('Test 11: PSD Hessian — converged & finite',
    r.converged && r.x.every(Number.isFinite), `x=[${r.x.map(v => v.toFixed(3))}], conv=${r.converged}`);
}

// ── Test 12: random 6-var QP, KKT residual ────────────────────────────────
{
  // Construct H = LLᵀ + I (PD), random f, box bounds
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s*1664525+1013904223)>>>0; return s/4294967296; }; }
  const rng = seeded(2026);
  const nn = 6;
  const L = Array.from({length: nn}, () => Array.from({length: nn}, () => rng()*2-1));
  const H = Array.from({length: nn}, (_, i) => Array.from({length: nn}, (_, j) => {
    let s = (i === j ? 1 : 0);
    for (let k = 0; k < nn; k++) s += L[i][k]*L[j][k];
    return s;
  }));
  const f = Array.from({length: nn}, () => rng()*2-1);
  const lb = new Array(nn).fill(-0.5);
  const ub = new Array(nn).fill(0.5);
  const r = solveQP(H, f, { lb, ub, maxIter: 200 });

  // stationarity with box: Hx+f should be balanced by active-bound multipliers;
  // verify via projected gradient ≈ 0 at solution
  const Hx = matVec(H, r.x);
  const grad = Hx.map((v, i) => v + f[i]);
  let projResidual = 0;
  for (let i = 0; i < nn; i++) {
    const atUb = close(r.x[i], ub[i], 1e-6), atLb = close(r.x[i], lb[i], 1e-6);
    if (atUb)      projResidual = Math.max(projResidual, Math.max(0, grad[i]));  // grad should be ≤0
    else if (atLb) projResidual = Math.max(projResidual, Math.max(0, -grad[i])); // grad should be ≥0
    else           projResidual = Math.max(projResidual, Math.abs(grad[i]));     // interior: grad≈0
  }
  ok('Test 12: random 6-var QP — projected gradient < 1e-4',
    projResidual < 1e-4, `projRes=${projResidual.toExponential(2)}, conv=${r.converged}`);
}

// ── Test 13: solveEqualityQP direct API ───────────────────────────────────
{
  const H = [[2, 0], [0, 2]];
  const f = [0, 0];
  const eq = solveEqualityQP(H, f, [[1, 1]], [2]);
  const qp = solveQP(H, f, { Aeq: [[1, 1]], beq: [2] });
  ok('Test 13: solveEqualityQP == solveQP (equality only)',
    vClose(eq.x, qp.x, 1e-8), `eq=[${eq.x.map(v=>v.toFixed(4))}], qp=[${qp.x.map(v=>v.toFixed(4))}]`);
}

// ── Test 14: solveBoxQP wrapper ───────────────────────────────────────────
{
  const H = [[1, 0], [0, 1]];
  const f = [-5, 3];
  const a = solveBoxQP(H, f, [0, 0], [1, 1]);
  const b = solveQP(H, f, { lb: [0, 0], ub: [1, 1] });
  ok('Test 14: solveBoxQP == solveQP(lb,ub)', vClose(a.x, b.x, 1e-6),
    `box=[${a.x.map(v=>v.toFixed(4))}]`);
}

// ── Test 15: fval consistency ─────────────────────────────────────────────
{
  const H = [[3, 1], [1, 2]];
  const f = [1, 1];
  const r = solveQP(H, f, { lb: [-2, -2], ub: [2, 2] });
  const recomputed = 0.5 * dot(r.x, matVec(H, r.x)) + dot(f, r.x);
  ok('Test 15: fval matches recomputed objective',
    close(r.fval, recomputed, 1e-8), `fval=${r.fval.toFixed(6)}, recomp=${recomputed.toFixed(6)}`);
}

// ── Test 16: MPC-like condensed QP ────────────────────────────────────────
{
  // Minimal condensed MPC: penalize control effort + tracking, |u| ≤ uMax.
  // H = 2*(Phi'Phi + R), f from initial-state mismatch. Use a simple PD H.
  const uMax = 1.0;
  const H = [[2, 0.5, 0], [0.5, 2, 0.5], [0, 0.5, 2]];
  const f = [-3, -2, -1];   // pushes u positive, will hit uMax
  const r = solveQP(H, f, { lb: [-uMax,-uMax,-uMax], ub: [uMax,uMax,uMax], maxIter: 200 });
  ok('Test 16: MPC-like QP converged', r.converged, `iters=${r.iterations}`);
  ok('Test 16: MPC-like QP respects |u| ≤ uMax',
    r.x.every(u => Math.abs(u) <= uMax + 1e-6), `u=[${r.x.map(v=>v.toFixed(4))}]`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P29-01 QP solver: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
