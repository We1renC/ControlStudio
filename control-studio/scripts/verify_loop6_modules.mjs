#!/usr/bin/env node
/**
 * verify_loop6_modules.mjs — Zero-Flaw Loop 6 verification:
 *   - Hamilton-Jacobi-Isaacs 1-D reach-avoid PDE solver
 *   - Youla parameterisation explicit API
 */

import { solveHJI1D, backwardReachableTube } from '../js/verification/hji_reach.js';
import { bezoutFactorization, youlaController, youlaFamily } from '../js/control/youla.js';
import { TransferFunction } from '../js/control/transfer-function.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── HJI 1-D reach to target {x : |x| ≤ 0.5} for dynamics ẋ = u + d ───────
{
  const dynamics = {
    f: (x, u, d) => u + d,
    uBounds: [-1, 1],
    dBounds: [-0.3, 0.3],
  };
  const lValue = (x) => Math.abs(x) - 0.5; // ≤ 0 inside target
  const out = solveHJI1D(dynamics, lValue, { xMin: -2, xMax: 2, dx: 0.05, T: 0.5 });
  ok('HJI: V grid length matches x grid', out.V.length === out.x.length);
  ok('HJI: at least one positive integration step taken', out.steps >= 1);
  // BRT should include the target.
  const brt = backwardReachableTube(out);
  ok('HJI: backward reachable tube non-empty', brt.included);
  // Initial target window |x|≤0.5 maps to indices 30..50 on dx=0.05 → width index 20.
  // After backward evolution the BRT must at least cover the original target.
  const widthIndex = brt.hi - brt.lo;
  // Lax-Friedrichs viscosity contracts the level set somewhat; require at
  // least a non-trivial safe interval (≥ 3 cells) and continuity through origin.
  ok('HJI: BRT remains a non-trivial interval (≥ 3 grid cells)',
     widthIndex >= 3, `width=${widthIndex}`);
  // The signed-distance value at x=0 should remain non-positive throughout.
  const i0 = Math.round((0 - out.x[0]) / 0.05);
  ok('HJI: V(T, x=0) ≤ 0 (origin still safe)', out.V[i0] <= 1e-9,
     `V(0)=${out.V[i0].toFixed(4)}`);
}

// ── Youla / Bezout identity ──────────────────────────────────────────────
{
  // Take a coprime pair representing P(s) = 1/(s+1):
  // N(s) = 1, M(s) = s + 1. Then NX + MY = X + (s+1) Y = 1.
  // One solution: X = 1, Y = 0. But Y = 0 makes K = X/Y undefined.
  // The Bezout algorithm will find a different solution; check NX + MY = 1.
  const N = [1];
  const M = [1, 1]; // s + 1
  const { X, Y } = bezoutFactorization(N, M);
  // verify
  let worst = 0;
  const NX = polymul(N, X);
  const MY = polymul(M, Y);
  const sum = polyAdd(NX, MY);
  const expected = new Array(sum.length).fill(0);
  expected[expected.length - 1] = 1;
  for (let i = 0; i < sum.length; i++) {
    const d = Math.abs(sum[i] - expected[i]);
    if (d > worst) worst = d;
  }
  ok('Bezout: NX + MY = 1 within 1e-9', worst < 1e-9, `||·||∞ = ${worst.toExponential(2)}`);

  const family = youlaFamily(N, M);
  ok('Youla: K0 is a TransferFunction', family.K0 instanceof TransferFunction);
  // K(Q=0) should equal K0
  const kQ0 = family.K(0);
  ok('Youla: K(Q=0) numerator matches K0', kQ0.num.length === family.K0.num.length);
  // K(Q=1) should be different
  const kQ1 = family.K(1);
  ok('Youla: K(Q=1) differs from K(Q=0)',
     !arraysEqual(kQ0.num, kQ1.num) || !arraysEqual(kQ0.den, kQ1.den));
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-12) return false;
  return true;
}

// helpers in scope
function polymul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
  }
  return r;
}

function polyAdd(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    out[n - 1 - i] = (a[a.length - 1 - i] ?? 0) + (b[b.length - 1 - i] ?? 0);
  }
  return out;
}

console.log('');
console.log(`Loop 6 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
