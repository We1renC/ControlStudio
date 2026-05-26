#!/usr/bin/env node
/**
 * verify_f1_reachability.mjs
 *
 * Tier F1 — Reachability via zonotopes
 *
 * Zonotope:  Z = { c + Σ α_i g_i : |α_i| ≤ 1 }
 *   c = center (n-vector)
 *   G = generator list; each entry is one n-vector g_i
 *
 * Operations:
 *   - linear map:        A · Z  = { A·c + Σ α_i A·g_i : |α_i|≤1 }
 *   - Minkowski sum:     Z1 ⊕ Z2 = ( c1+c2, [...G1, ...G2] )
 *   - reachable set:     R_{k+1} = A R_k ⊕ B·U
 *
 * Checks:
 *  L1 Property — box -> zonotope construction: 4 vertices for 2D box
 *  L1 Property — linear map preserves zonotope structure
 *  L1 Property — Minkowski sum: generator count = k1 + k2
 *  L2 Cross   — 1-step reach contains Monte Carlo samples
 *  L2 Cross   — N-step reach contains all sampled trajectories
 *  L3 Cross   — stable A with bounded U: reach sets are bounded
 *  L4 Boundary — empty input set works
 */
import {
  zonotopeFromBox,
  linearMapZonotope,
  minkowskiSum,
  reachZonotope,
  containsPoint,
} from '../js/analysis/reachability.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
let failed = 0;

function assertTrue(label, cond, detail = '') {
  console.log(`${cond ? PASS : FAIL} ${label}${detail ? ': ' + detail : ''}`);
  if (!cond) failed++;
}
function assertNear(label, actual, expected, tol = 1e-9) {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(`${ok ? PASS : FAIL} ${label}: got ${actual}, expected ~${expected}`);
  if (!ok) failed++;
}

console.log('===============================================================');
console.log('  F1 Reachability via zonotopes');
console.log('===============================================================\n');

// L1 Box construction
console.log('> L1 Box -> zonotope');
const Z1 = zonotopeFromBox([0, 0], [1, 1]);  // unit box around origin
assertTrue('center is 0,0',
  Z1.c[0] === 0 && Z1.c[1] === 0);
assertTrue('2 generators for 2D box',
  Z1.G.length === 2 && Z1.G[0].length === 2);
// Box [-1,1] x [-1,1] should be Z = {c=0, G = diag(1,1)}
assertTrue('generators are diagonal',
  Z1.G[0][0] === 1 && Z1.G[1][1] === 1 && Z1.G[0][1] === 0 && Z1.G[1][0] === 0);

// L1 Linear map
console.log('\n> L1 Linear map');
const A = [[2, 0], [0, 3]];
const Z2 = linearMapZonotope(A, Z1);
assertTrue('mapped center', Z2.c[0] === 0 && Z2.c[1] === 0);
assertTrue('mapped generators: diag(2, 3)',
  Z2.G[0][0] === 2 && Z2.G[1][1] === 3,
  `G=${JSON.stringify(Z2.G)}`);

// L1 Minkowski sum
console.log('\n> L1 Minkowski sum');
const Z3 = zonotopeFromBox([1, 1], [0.5, 0.5]);
const Zsum = minkowskiSum(Z1, Z3);
assertTrue('sum center = c1 + c2',
  Zsum.c[0] === 1 && Zsum.c[1] === 1);
assertTrue('sum has 4 generators',
  Zsum.G.length === 4, `got ${Zsum.G.length}`);

// L2 Reach contains Monte Carlo
console.log('\n> L2 Reach set contains MC samples');
// Stable 2D system: x_{k+1} = 0.9 x_k + B u_k, u in [-1,1]
const Ad = [[0.9, 0], [0, 0.8]];
const Bd = [[0.1], [0.1]];
const X0 = zonotopeFromBox([0, 0], [0.1, 0.1]);
const U  = zonotopeFromBox([0], [1]);  // u in [-1, 1]
const horizon = 5;
const reach = reachZonotope(Ad, Bd, X0, U, horizon);
assertTrue('reach[0] = X0',
  reach[0].c[0] === X0.c[0] && reach[0].c[1] === X0.c[1]);
assertTrue('reach has horizon+1 sets',
  reach.length === horizon + 1);

// Monte Carlo check: random IC in X0, random inputs in U
let mcSafe = true;
const N_mc = 50;
for (let s = 0; s < N_mc; s++) {
  let x = [
    (Math.random() * 2 - 1) * 0.1,
    (Math.random() * 2 - 1) * 0.1,
  ];
  for (let k = 0; k <= horizon; k++) {
    if (!containsPoint(reach[k], x, 1e-6)) {
      mcSafe = false;
      break;
    }
    if (k === horizon) break;
    const u = Math.random() * 2 - 1;
    const xNext = [
      Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0][0] * u,
      Ad[1][0] * x[0] + Ad[1][1] * x[1] + Bd[1][0] * u,
    ];
    x = xNext;
  }
}
assertTrue('all MC samples contained in reach sets', mcSafe);

// L3 Boundedness for stable system
console.log('\n> L3 Stable system: reach sets bounded');
let maxRadius = 0;
for (const Z of reach) {
  // upper bound on |x|: |c| + sum |g_i|
  for (let dim = 0; dim < Z.c.length; dim++) {
    let r = Math.abs(Z.c[dim]);
    for (const g of Z.G) r += Math.abs(g[dim]);
    maxRadius = Math.max(maxRadius, r);
  }
}
assertTrue('max reach radius < 2.0 (stable plant)', maxRadius < 2.0,
  `max radius = ${maxRadius.toFixed(3)}`);

// L4 Empty input set
console.log('\n> L4 Empty input');
const reach2 = reachZonotope(Ad, Bd, X0, null, 3);
assertTrue('reach with no input set runs (autonomous)', reach2.length === 4);

// containsPoint sanity
const inside = containsPoint(Z1, [0.5, 0.5], 1e-6);
assertTrue('Z1 (unit box) contains [0.5, 0.5]', inside);
const outside = containsPoint(Z1, [2, 2], 1e-6);
assertTrue('Z1 (unit box) not contains [2, 2]', !outside);

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All F1 Reachability checks passed');
  process.exit(0);
} else {
  console.log(`${failed} F1 check(s) FAILED`);
  process.exit(1);
}
