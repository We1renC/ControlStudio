#!/usr/bin/env node
/**
 * verify_loop14_modules.mjs — Zero-Flaw Loop 14 verification:
 *   - Pontryagin set arithmetic (Minkowski sum + Pontryagin difference)
 *   - Polynomial Chaos Expansion (Wiener-Hermite)
 *   - Pontryagin Maximum Principle / shooting (scalar LQR)
 */

import {
  convexHull2D, minkowskiSum2D, pontryaginDifference, supportFunction,
  boxH, boxV,
} from '../js/verification/pontryagin_sets.js';
import {
  hermitePolynomials, gaussHermiteRule, pceCoefficients, pceMeanVariance,
} from '../js/identification/polynomial_chaos.js';
import { pmpScalarShooting } from '../js/control/pontryagin_max_principle.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── Minkowski sum: box [-1,1]² ⊕ box [-0.5,0.5]² = box [-1.5,1.5]² ────────
{
  const A = boxV(1, 1);
  const B = boxV(0.5, 0.5);
  const sum = minkowskiSum2D(A, B);
  ok('Minkowski: 4-vertex result', sum.length === 4);
  // Check max coordinate magnitudes
  const xs = sum.map((p) => p[0]);
  const ys = sum.map((p) => p[1]);
  ok('Minkowski: max x = 1.5', Math.abs(Math.max(...xs) - 1.5) < 1e-12);
  ok('Minkowski: min x = -1.5', Math.abs(Math.min(...xs) + 1.5) < 1e-12);
  ok('Minkowski: max y = 1.5', Math.abs(Math.max(...ys) - 1.5) < 1e-12);
}

// ── Pontryagin difference: box [-1,1]² ⊖ box [-0.3,0.3]² ⇒ box [-0.7,0.7]² ─
{
  const A_H = boxH(1, 1);
  const B_V = boxV(0.3, 0.3);
  const diff = pontryaginDifference(A_H, B_V);
  ok('Pontryagin diff: 4 faces',
     diff.length === 4);
  // Each face should now have b = 1 - 0.3 = 0.7
  ok('Pontryagin diff: faces tightened to b = 0.7',
     diff.every((f) => Math.abs(f.b - 0.7) < 1e-12),
     `b values=${diff.map((f) => f.b.toFixed(3)).join(',')}`);
}

// ── Support function consistency ──────────────────────────────────────────
{
  const B = boxV(2, 3);
  ok('support: in direction (1, 0) = 2', Math.abs(supportFunction(B, [1, 0]) - 2) < 1e-12);
  ok('support: in direction (0, 1) = 3', Math.abs(supportFunction(B, [0, 1]) - 3) < 1e-12);
  ok('support: in direction (1, 1) = 5', Math.abs(supportFunction(B, [1, 1]) - 5) < 1e-12);
}

// ── Convex hull degenerate handling ───────────────────────────────────────
{
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]];
  const hull = convexHull2D(pts);
  ok('convex hull: includes corners only', hull.length === 4);
}

// ── PCE on linear function g(ξ) = 2 + 3ξ: mean = 2, variance = 9 ─────────
{
  const g = (xi) => 2 + 3 * xi;
  const alpha = pceCoefficients(g, 3, { quadratureOrder: 7 });
  ok('PCE: α_0 ≈ 2 (within 1e-6)', Math.abs(alpha[0] - 2) < 1e-6, `α_0=${alpha[0].toFixed(8)}`);
  ok('PCE: α_1 ≈ 3 (within 1e-6)', Math.abs(alpha[1] - 3) < 1e-6, `α_1=${alpha[1].toFixed(8)}`);
  ok('PCE: higher α_n ≈ 0 (linear function exactly represented)',
     Math.abs(alpha[2]) < 1e-6 && Math.abs(alpha[3]) < 1e-6);
  const stats = pceMeanVariance(alpha);
  ok('PCE: mean ≈ 2', Math.abs(stats.mean - 2) < 1e-6);
  ok('PCE: variance ≈ 9', Math.abs(stats.variance - 9) < 1e-5,
     `var=${stats.variance.toFixed(6)}`);
}

// ── PCE on quadratic g(ξ) = ξ²: mean = 1, variance = 2 ────────────────────
{
  const g = (xi) => xi * xi;
  const alpha = pceCoefficients(g, 4, { quadratureOrder: 7 });
  const stats = pceMeanVariance(alpha);
  ok('PCE: ξ² mean = E[ξ²] = 1', Math.abs(stats.mean - 1) < 1e-8);
  ok('PCE: ξ² variance = Var(ξ²) = 2', Math.abs(stats.variance - 2) < 1e-6);
}

// ── PMP scalar LQR: ẋ = -x + u, q = r = s = 1, T = 1, x_0 = 1 ────────────
{
  const result = pmpScalarShooting(
    { a: -1, b: 1, q: 1, r: 1, s: 1, T: 1, x0: 1 },
    { dt: 1e-3, tol: 1e-10 },
  );
  ok('PMP: transversality residual ≤ 1e-8',
     Math.abs(result.transversalityResidual) < 1e-8,
     `g(λ₀)=${result.transversalityResidual.toExponential(2)}`);
  ok('PMP: converged in < 30 iterations', result.iterations < 30);
  ok('PMP: cost > 0 (positive-definite quadratic)', result.trajectory.cost > 0);
  // Sanity: final x should be smaller than x_0 (decay)
  const xf = result.trajectory.x[result.trajectory.x.length - 1];
  ok('PMP: final state |x(T)| < |x_0|', Math.abs(xf) < 1, `x(T)=${xf.toFixed(4)}`);
}

console.log('');
console.log(`Loop 14 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
