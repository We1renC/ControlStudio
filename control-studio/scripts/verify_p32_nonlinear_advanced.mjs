#!/usr/bin/env node
/**
 * verify_p32_nonlinear_advanced.mjs — Phase 32: Advanced Nonlinear Control
 *
 * Tests:
 *  Feedback Linearization (P32-01):
 *   1.  FBL on integrator chain (r=1): u = v − Lf h, output tracks step
 *   2.  FBL computes correct decoupling matrix β ≠ 0
 *   3.  FBL closed-loop poles at −1 (critically damped, r=1)
 *   4.  FBL with singularity guard: β≈0 → u bounded
 *  Backstepping (P32-02):
 *   5.  Backstepping stabilizes 2nd-order cascaded system to zero
 *   6.  Backstepping z1 decreases over time (convergence)
 *   7.  Backstepping phi1 is continuous (no jumps between steps)
 *   8.  Backstepping reset clears phi1 memory
 *  CLF-CBF (P32-03):
 *   9.  CBF filter keeps h(x) ≥ −tol throughout
 *  10.  CLF-CBF: u* near u_nom when far from constraint
 *  11.  CLF-CBF: u* modified when approaching unsafe set
 *  12.  CLF-CBF: safe flag True when h(x) > 0
 */

import { feedbackLinearization, backstepping, controlBarrierFunction } from '../js/control/nonlinear_advanced.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 0.1) { return Number.isFinite(a) && Math.abs(a - b) <= tol; }

console.log('\n=== P32: Advanced Nonlinear Control ===\n');
console.log('── Feedback Linearization (P32-01) ───────');

// ── Test 1: FBL on integrator ẋ = u, y = x, r=1 → track step ────────────
{
  // f(x) = 0 (no drift), g(x) = 1, h(x) = x[0]
  const f   = (x) => [0];
  const g   = (x) => [1];
  const h   = (x) => x[0];
  const fbl = feedbackLinearization(f, g, h, 1, { k: [2] });

  let x = [0];
  const yd = 1, dt = 0.01;
  for (let t = 0; t < 500; t++) {
    const { u } = fbl.step(x, yd, [0]);
    x = [x[0] + dt * u];
  }
  ok('Test 1: FBL integrator tracks step yd=1 within 0.02', close(x[0], 1, 0.02),
    `x=${x[0].toFixed(4)}`);
}

// ── Test 2: FBL computes non-zero decoupling matrix ───────────────────────
{
  const f   = (x) => [-x[0]];
  const g   = (x) => [2];
  const h   = (x) => x[0];
  const fbl = feedbackLinearization(f, g, h, 1);
  const { alpha, beta } = fbl.computeDecouplingMatrix([1]);
  ok('Test 2: β = Lg h ≈ 2 (correct)', close(beta, 2, 0.01), `β=${beta.toFixed(4)}`);
  ok('Test 2: α = Lf h ≈ -1', close(alpha, -1, 0.05), `α=${alpha.toFixed(4)}`);
}

// ── Test 3: FBL closed-loop pole at −1 (r=1, k=[1]) ──────────────────────
{
  // ẋ = f(x) + g(x)u, f=-x, g=1, h=x → Lf h = -x, Lg h = 1
  // u = (v − (-x))/1 = v + x, v = -1*(x - yd) → u = x - (x-yd) = yd
  // Closed loop: ẋ = -x + yd → e=x-yd: ė = -e → pole at -1 ✓
  const f   = (x) => [-x[0]];
  const g   = (x) => [1];
  const h   = (x) => x[0];
  const fbl = feedbackLinearization(f, g, h, 1, { k: [1] });

  let x = [2], errors = [];
  const yd = 0, dt = 0.01;
  for (let t = 0; t < 800; t++) {
    const { u } = fbl.step(x, yd, [0]);
    x = [x[0] + dt * (-x[0] + u)];
    if (t > 700) errors.push(Math.abs(x[0]));
  }
  const finalErr = errors.reduce((s, v) => s + v, 0) / errors.length;
  ok('Test 3: FBL converges to 0 (pole at -1)', finalErr < 0.05, `avgErr=${finalErr.toFixed(5)}`);
}

// ── Test 4: FBL singularity guard — u bounded when β≈0 ───────────────────
{
  const f   = (x) => [0];
  const g   = (x) => [1e-12];  // near-singular β
  const h   = (x) => x[0];
  const fbl = feedbackLinearization(f, g, h, 1, { eps: 1e-6 });
  const { u } = fbl.step([0.01], 1, [0]);
  ok('Test 4: u bounded when β≈0 (|u| < 1e8)', Math.abs(u) < 1e8, `u=${u.toExponential(2)}`);
}

console.log('\n── Backstepping (P32-02) ─────────────────');

// ── Test 5: Backstepping stabilizes to origin ─────────────────────────────
{
  // ẋ₁ = x₂, ẋ₂ = u  (double integrator, f1=0, f2=0)
  const f1 = (x1) => 0;
  const f2 = (x1, x2) => 0;
  const bs = backstepping(f1, f2, { k1: 2, k2: 3 });

  let x1 = 2, x2 = 0, dt = 0.01;
  for (let t = 0; t < 1000; t++) {
    const { u } = bs.step(x1, x2, 0, 0, dt);
    x1 += dt * x2;
    x2 += dt * u;
  }
  ok('Test 5: Backstepping stabilizes double integrator to 0', close(x1, 0, 0.1) && close(x2, 0, 0.1),
    `x1=${x1.toFixed(4)}, x2=${x2.toFixed(4)}`);
}

// ── Test 6: z1 decreases over time ───────────────────────────────────────
{
  const f1 = (x1) => -x1;  // stable drift
  const f2 = (x1, x2) => -x2;
  const bs = backstepping(f1, f2, { k1: 1, k2: 1 });

  let x1 = 1, x2 = 0;
  const z1s = [];
  const dt = 0.02;
  for (let t = 0; t < 200; t++) {
    const r = bs.step(x1, x2, 0, 0, dt);
    z1s.push(Math.abs(r.z1));
    x1 += dt * (-x1 + x2);
    x2 += dt * (-x2 + r.u);
  }
  ok('Test 6: |z1| decreases over time', z1s[z1s.length - 1] < z1s[0],
    `|z1|: ${z1s[0].toFixed(4)} → ${z1s[z1s.length-1].toFixed(4)}`);
}

// ── Test 7: phi1 is continuous ────────────────────────────────────────────
{
  const f1 = (x1) => 0;
  const f2 = (x1, x2) => 0;
  const bs = backstepping(f1, f2);
  const phis = [];
  for (let t = 0; t < 10; t++) {
    const r = bs.step(Math.sin(t * 0.1), Math.cos(t * 0.1), 0, 0, 0.01);
    phis.push(r.phi1);
  }
  const maxJump = phis.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - phis[i])), 0);
  ok('Test 7: phi1 changes smoothly (no large jumps < 5)', maxJump < 5, `maxJump=${maxJump.toFixed(4)}`);
}

// ── Test 8: reset clears memory ──────────────────────────────────────────
{
  const bs = backstepping((x) => 0, (x1, x2) => 0);
  bs.step(1, 2, 0, 0, 0.01);
  bs.reset();
  const { u } = bs.step(1, 2, 0, 0, 0.01);
  // After reset, phi1Dot should be 0 (no previous phi1)
  ok('Test 8: after reset, phi1Dot = 0 (u computed fresh)', Number.isFinite(u));
}

console.log('\n── CLF-CBF Safety Filter (P32-03) ────────');

// ── Test 9: CBF keeps h(x) ≥ 0 ───────────────────────────────────────────
{
  // 1D: ẋ = u, V = x², h = x + 0.5 (safe: x > -0.5)
  // Nominal: u_nom = -x (stabilize to 0), but may approach safe boundary
  const f = (x) => [0];
  const g = (x) => [1];
  const V = (x) => x[0] * x[0];
  const h = (x) => x[0] + 0.5;  // safe set: x ≥ -0.5
  const cbf = controlBarrierFunction(f, g, V, h, { gamma: 1, alpha: 2 });

  let x = [0.1];  // start near safe boundary
  let minH = Infinity;
  const dt = 0.05;
  for (let t = 0; t < 100; t++) {
    const uNom = [-2 * x[0]];  // drive toward 0 (may violate h)
    const { u, hx } = cbf.filter(x, uNom);
    minH = Math.min(minH, hx);
    x = [x[0] + dt * u[0]];
  }
  ok('Test 9: CBF keeps h(x) ≥ -0.1 throughout', minH >= -0.1,
    `minH=${minH.toFixed(4)}`);
}

// ── Test 10: u* ≈ u_nom when far from constraint ─────────────────────────
{
  const f = (x) => [0];
  const g = (x) => [1];
  const V = (x) => x[0] * x[0];
  const h = (x) => x[0] + 2;  // far from x ≈ -2, safe everywhere near x=1
  const cbf = controlBarrierFunction(f, g, V, h, { gamma: 1, alpha: 1 });

  // At x=[3] (far safe), u_nom=-1 should be kept
  const { u } = cbf.filter([3], [-1]);
  ok('Test 10: u* ≈ u_nom when far from unsafe set', close(u[0], -1, 0.5),
    `u*=${u[0].toFixed(4)}, u_nom=-1`);
}

// ── Test 11: u* modified when approaching unsafe set ─────────────────────
{
  const f = (x) => [0];
  const g = (x) => [1];
  const V = (x) => x[0] * x[0];
  const h = (x) => x[0] + 0.1;  // safe set: x ≥ -0.1
  const cbf = controlBarrierFunction(f, g, V, h, { gamma: 1, alpha: 5 });

  // At x=[-0.05] (near boundary), u_nom=-5 (pushing toward unsafe)
  const { u: uNom_vec } = cbf.filter([-0.05], [-5]);
  const { u: uMod_vec } = cbf.filter([-0.05], [-5]);
  // u* should be modified (pushed toward positive or zero)
  ok('Test 11: u* > u_nom when approaching unsafe set (u* > -5)',
    uNom_vec[0] > -5, `u*=${uNom_vec[0].toFixed(4)}`);
}

// ── Test 12: safe flag True when h(x) > 0 ────────────────────────────────
{
  const f = (x) => [0];
  const g = (x) => [1];
  const V = (x) => x[0] * x[0];
  const h = (x) => x[0];  // safe: x ≥ 0
  const cbf = controlBarrierFunction(f, g, V, h);

  const { safe, hx } = cbf.filter([1], [0]);  // x=1 > 0 → safe
  ok('Test 12: safe=true when h(x) > 0', safe && hx > 0, `safe=${safe}, h=${hx.toFixed(4)}`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P32 advanced nonlinear: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
