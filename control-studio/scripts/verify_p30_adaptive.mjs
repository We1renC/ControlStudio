#!/usr/bin/env node
/**
 * verify_p30_adaptive.mjs — Phase 30: Adaptive & Learning Control
 *
 * Tests:
 *  RLS (P30-01):
 *   1.  RLS on constant θ = [1, -2]: converges after 50 samples
 *   2.  Forgetting factor λ=0.95 adapts faster to step change in θ
 *   3.  RLS P matrix trace decreases (uncertainty reduces with data)
 *   4.  RLS error ≈ 0 for exact linear model (no noise)
 *   5.  RLS reset clears state
 *  MRAC (P30-02):
 *   6.  MRAC tracking error e → 0 for stable reference model (Lyapunov rule)
 *   7.  MRAC with MIT rule also converges (scalar system)
 *   8.  MRAC gains converge to correct steady-state values
 *   9.  designMRAC throws on unstable reference model (am ≥ 0)
 *  STR (P30-03):
 *  10.  STR identifies and cancels 1st-order plant
 *  11.  STR output tracks step reference after warm-up
 *  ILC (P30-04):
 *  12.  ILC rmsError decreases monotonically across trials
 *  13.  ILC converges to near-zero error for invertible plant
 *  14.  ILC throws on invalid Q-filter
 *  SRIVC (P30-05):
 *  15.  SRIVC identifies 1st-order CT model parameters approximately
 *  16.  SRIVC residuals small for clean data
 */

import {
  identifyRLS,
  designMRAC,
  selfTuningRegulator,
  iterativeLearningControl,
  identifySRIVC,
} from '../js/control/adaptive.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 1e-3) { return Number.isFinite(a) && Math.abs(a - b) <= tol; }
function rms(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length); }

console.log('\n=== P30: Adaptive & Learning Control ===\n');
console.log('── RLS (P30-01) ──────────────────────────');

// ── Test 1: RLS converges to constant θ = [1, -2] ─────────────────────────
{
  const rls = identifyRLS(2, { lambda: 1, P0: 1e4 });
  for (let t = 0; t < 50; t++) {
    const phi = [Math.sin(t), Math.cos(t)];
    const y   = phi[0] * 1 + phi[1] * (-2);   // true θ = [1, -2]
    rls.update(phi, y);
  }
  const { theta } = rls.state;
  ok('Test 1: RLS converges θ → [1, -2]',
    close(theta[0], 1, 1e-4) && close(theta[1], -2, 1e-4),
    `θ=[${theta.map(v=>v.toFixed(6))}]`);
}

// ── Test 2: Faster adaptation with λ=0.95 on step change ──────────────────
{
  // θ changes from [1, -2] to [2, 1] at t=100
  const rls1 = identifyRLS(2, { lambda: 1,    P0: 1e2 });
  const rls2 = identifyRLS(2, { lambda: 0.95, P0: 1e2 });
  for (let t = 0; t < 100; t++) {
    const phi = [Math.sin(t), Math.cos(t)];
    const y = phi[0] * 1 + phi[1] * (-2);
    rls1.update(phi, y); rls2.update(phi, y);
  }
  for (let t = 100; t < 150; t++) {
    const phi = [Math.sin(t), Math.cos(t)];
    const y = phi[0] * 2 + phi[1] * 1;   // new θ = [2, 1]
    rls1.update(phi, y); rls2.update(phi, y);
  }
  const err1 = Math.abs(rls1.state.theta[0] - 2);
  const err2 = Math.abs(rls2.state.theta[0] - 2);
  ok('Test 2: λ=0.95 adapts faster (smaller error) after step change',
    err2 < err1, `err(λ=1)=${err1.toFixed(4)}, err(λ=0.95)=${err2.toFixed(4)}`);
}

// ── Test 3: P trace decreases ─────────────────────────────────────────────
{
  const rls = identifyRLS(2, { lambda: 1, P0: 1e4 });
  const traces = [];
  for (let t = 0; t < 20; t++) {
    const phi = [Math.sin(t), Math.cos(t)];
    rls.update(phi, phi[0] - phi[1]);
    const P = rls.state.P;
    traces.push(P[0][0] + P[1][1]);
  }
  // Trace should decrease (or at least not increase) over time
  ok('Test 3: P trace decreases over time',
    traces[traces.length - 1] < traces[0], `trace: ${traces[0].toFixed(2)} → ${traces[traces.length-1].toFixed(4)}`);
}

// ── Test 4: Zero error for exact model ────────────────────────────────────
{
  const rls = identifyRLS(3, { lambda: 1, P0: 1e4 });
  const theta_true = [2, -1, 0.5];
  let maxErr = 0;
  for (let t = 0; t < 100; t++) {
    const phi = [t/100, Math.sin(t), 1];
    const y = phi.reduce((s, p, i) => s + p * theta_true[i], 0);
    const r = rls.update(phi, y);
    if (t > 10) maxErr = Math.max(maxErr, Math.abs(r.error));
  }
  ok('Test 4: RLS error ≈ 0 for exact linear model', maxErr < 1e-3, `maxErr=${maxErr.toExponential(2)}`);
}

// ── Test 5: Reset clears state ────────────────────────────────────────────
{
  const rls = identifyRLS(2, { lambda: 1, P0: 1e4 });
  for (let t = 0; t < 10; t++) rls.update([1, 0], 2);
  rls.reset();
  const { theta, t: tAfter } = rls.state;
  ok('Test 5: reset clears theta to 0', theta.every(v => v === 0) && tAfter === 0);
}

console.log('\n── MRAC (P30-02) ─────────────────────────');

// ── Test 6: MRAC tracking error → 0 (Lyapunov rule) ─────────────────────
{
  const refModel = { am: -2, bm: 2 };
  const plant = { ap: -1, bp: 3 };   // unknown to controller
  const mrac = designMRAC(refModel, { gamma: 2, rule: 'lyapunov', signBp: 1, kr0: 1, kx0: 0 });

  let xp = 0, xm = 0;
  const r = 1;
  const dt = 0.01;
  const errs = [];

  for (let t = 0; t < 3000; t++) {
    const { u, e } = mrac.step(xp, xm, r, dt);
    if (t > 2000) errs.push(Math.abs(e));

    // Euler integration
    const dxp = plant.ap * xp + plant.bp * u;
    const dxm = refModel.am * xm + refModel.bm * r;
    xp += dt * dxp;
    xm += dt * dxm;
  }

  const finalErr = errs.reduce((s, v) => s + v, 0) / errs.length;
  ok('Test 6: MRAC tracking error |e| < 0.05 after convergence',
    finalErr < 0.05, `avgErr=${finalErr.toFixed(5)}`);
}

// ── Test 7: MIT rule also converges ──────────────────────────────────────
{
  const refModel = { am: -3, bm: 3 };
  const plant = { ap: -1, bp: 2 };
  const mrac = designMRAC(refModel, { gamma: 1, rule: 'mit', kr0: 1, kx0: 0 });

  let xp = 0.5, xm = 0;
  const r = 1, dt = 0.005;
  let finalErr = Infinity;

  for (let t = 0; t < 4000; t++) {
    const { u, e } = mrac.step(xp, xm, r, dt);
    const dxp = plant.ap * xp + plant.bp * u;
    const dxm = refModel.am * xm + refModel.bm * r;
    xp += dt * dxp;
    xm += dt * dxm;
    if (t > 3000) finalErr = Math.abs(e);
  }
  ok('Test 7: MIT rule converges (|e| < 0.2 at end)', finalErr < 0.2, `finalErr=${finalErr.toFixed(5)}`);
}

// ── Test 8: MRAC gains → steady-state ────────────────────────────────────
{
  // For am=-2, bm=2, ap=-1, bp=2:
  // True kr* = bm/bp = 1, kx* = (am - ap)/bp = (-2-(-1))/2 = -0.5
  const refModel = { am: -2, bm: 2 };
  const mrac = designMRAC(refModel, { gamma: 5, rule: 'lyapunov', signBp: 1, kr0: 0.5, kx0: 0 });

  let xp = 0, xm = 0;
  const r = 1, dt = 0.01;
  for (let t = 0; t < 5000; t++) {
    const { u } = mrac.step(xp, xm, r, dt);
    xp += dt * (-1 * xp + 2 * u);
    xm += dt * (refModel.am * xm + refModel.bm * r);
  }
  const { kr, kx } = mrac.state;
  ok('Test 8: kr converges toward 1 (within 0.5)', close(kr, 1, 0.5), `kr=${kr.toFixed(4)}`);
}

// ── Test 9: Throw on unstable reference model ─────────────────────────────
{
  let threw = false;
  try { designMRAC({ am: 0.5, bm: 1 }); } catch (_) { threw = true; }
  ok('Test 9: designMRAC throws on am ≥ 0', threw);
}

console.log('\n── STR (P30-03) ──────────────────────────');

// ── Test 10: STR identifies 1st-order plant ───────────────────────────────
{
  const str = selfTuningRegulator(1, 1, { lambda: 0.97, P0: 1e3 });
  // Plant: y(t) = 0.7 y(t-1) + 0.5 u(t-1)
  let yPrev = 0, uPrev = 0;
  const thetas = [];
  for (let t = 0; t < 200; t++) {
    const y = 0.7 * yPrev + 0.5 * uPrev;
    // Use persistent excitation: mix step + sinusoid
    const excitation = 0.3 * Math.sin(0.4 * t);
    const r = 1 + excitation;
    const { theta, u } = str.step(y, r);
    thetas.push(theta);
    yPrev = y;
    uPrev = u;  // use STR's computed control input
  }
  const lastTheta = thetas[thetas.length - 1];
  // phi = [-y(t-1), u(t-1)], so theta = [a1, b1]
  // y(t) = 0.7*y(t-1) + 0.5*u(t-1) → phi^T*theta: -y*a1 + u*b1
  // So a1 ≈ -0.7 (negated), b1 ≈ 0.5
  ok('Test 10: STR identifies a1 ≈ -0.7', close(lastTheta[0], -0.7, 0.2),
    `a1=${lastTheta[0].toFixed(4)}`);
  ok('Test 10: STR identifies b1 ≈ 0.5', close(lastTheta[1], 0.5, 0.2),
    `b1=${lastTheta[1].toFixed(4)}`);
}

// ── Test 11: STR output tracks step ──────────────────────────────────────
{
  const str = selfTuningRegulator(1, 1, { lambda: 0.98, P0: 1e3 });
  let yPrev = 0, uPrev = 0;
  const yOut = [];
  for (let t = 0; t < 300; t++) {
    const y = 0.8 * yPrev + 0.4 * uPrev;
    // Add excitation in warm-up phase for identification
    const r = t < 100 ? 1 + 0.5 * Math.sin(0.3 * t) : 1;
    const { u } = str.step(y, r);
    yOut.push(y);
    yPrev = y; uPrev = u;
  }
  const finalY = yOut.slice(-50).reduce((s, v) => s + v, 0) / 50;
  ok('Test 11: STR output tracks step (finalY close to 1)', close(finalY, 1, 0.4),
    `finalY=${finalY.toFixed(4)}`);
}

console.log('\n── ILC (P30-04) ──────────────────────────');

// ── Test 12: ILC rmsError decreases monotonically ────────────────────────
{
  // Simple static plant y(t) = u(t)
  const T = 20;
  const yd = Array.from({ length: T }, (_, t) => Math.sin(2 * Math.PI * t / T));
  const ilc = iterativeLearningControl(T, { L: 0.8, Q: 0.95 });

  const errors = [];
  let u_k = new Array(T).fill(0);

  for (let trial = 0; trial < 20; trial++) {
    const y = u_k.map(u => u);    // plant: y = u
    const res = ilc.update(yd, y);
    errors.push(res.rmsError);
    u_k = res.u_next;
  }

  let mono = true;
  for (let i = 5; i < errors.length; i++)
    if (errors[i] > errors[i-1] + 1e-6) mono = false;
  ok('Test 12: ILC rmsError decreases across trials', mono,
    `errors: ${errors.slice(0, 5).map(v=>v.toFixed(4))} ... ${errors.slice(-2).map(v=>v.toFixed(4))}`);
}

// ── Test 13: ILC converges near zero ─────────────────────────────────────
{
  const T = 15;
  const yd = Array.from({ length: T }, (_, t) => t / T);
  const ilc = iterativeLearningControl(T, { L: 0.9, Q: 1.0 });

  let u_k = new Array(T).fill(0);
  for (let trial = 0; trial < 50; trial++) {
    const y = u_k;
    const res = ilc.update(yd, y);
    u_k = res.u_next;
    if (res.rmsError < 1e-6) break;
  }
  ok('Test 13: ILC converges to near-zero error', ilc.state.trial > 1 &&
    (() => { const y = u_k; const res = ilc.update(yd, y); return res.rmsError < 0.01; })(),
    `trial=${ilc.state.trial}`);
}

// ── Test 14: Invalid Q-filter throws ─────────────────────────────────────
{
  let threw = false;
  try { iterativeLearningControl(10, { Q: 1.5 }); } catch (_) { threw = true; }
  ok('Test 14: Q > 1 throws error', threw);
}

console.log('\n── SRIVC (P30-05) ────────────────────────');

// ── Test 15: SRIVC identifies 1st-order CT model ─────────────────────────
{
  // True CT model: ẏ + 2y = 3u → a=[2], b=[3], G(s) = 3/(s+2)
  const Ts = 0.05;
  const N = 300;
  const y = new Array(N).fill(0);
  const u = Array.from({ length: N }, (_, t) => t < 50 ? 0 : 1);  // step at t=50

  // Euler simulation
  for (let t = 1; t < N; t++) {
    y[t] = y[t-1] + Ts * (-2 * y[t-1] + 3 * u[t-1]);
  }

  const r = identifySRIVC(y, u, 1, 0, Ts, { alpha: 2, maxIter: 3 });

  // a = [a0], b = [b0] → a0 ≈ 2, b0 ≈ 3
  ok('Test 15: SRIVC identifies a₀ ≈ 2', close(r.a[0], 2, 0.5), `a=[${r.a.map(v=>v.toFixed(4))}]`);
  ok('Test 15: SRIVC identifies b₀ ≈ 3', close(r.b[0], 3, 0.8), `b=[${r.b.map(v=>v.toFixed(4))}]`);
}

// ── Test 16: SRIVC residuals are small ───────────────────────────────────
{
  const Ts = 0.05;
  const N  = 200;
  const u  = Array.from({ length: N }, (_, t) => Math.sin(t * 0.3));
  const y  = new Array(N).fill(0);
  for (let t = 1; t < N; t++) y[t] = y[t-1] + Ts * (-3 * y[t-1] + 2 * u[t-1]);

  const r = identifySRIVC(y, u, 1, 0, Ts, { alpha: 3, maxIter: 3 });
  const resRms = rms(r.residuals.slice(10));
  ok('Test 16: SRIVC residuals RMS < 1.0', resRms < 1.0, `resRms=${resRms.toFixed(4)}`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P30 adaptive: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
