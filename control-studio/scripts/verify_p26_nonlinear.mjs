#!/usr/bin/env node
/**
 * verify_p26_nonlinear.mjs — Phase 26: gainScheduledPID + SMC verification
 *
 * gainScheduledPID tests:
 *   1. getGains clamps to first breakpoint below range
 *   2. getGains clamps to last breakpoint above range
 *   3. getGains interpolates linearly at midpoint
 *   4. Invalid breakpoints (non-increasing) throw
 *   5. Mismatch breakpoints/pidParams throws
 *   6. Simulated closed-loop tracks step reference (error < 5% at end)
 *   7. Gain schedule smoothly transitions — no discontinuity at breakpoint
 *
 * SMC tests:
 *   8. sigma → 0 from non-zero initial condition (reaching phase)
 *   9. Tracking error → 0 from non-zero x1 initial condition
 *  10. Boundary layer limits |u| < uMax (saturation check)
 *  11. With sinusoidal disturbance (d < eta), system still converges
 *  12. c=0 throws; eta=0 throws; eps=0 throws; gVal=0 throws
 */

import {
  gainScheduledPID,
  simulateGainScheduledPID,
  designSMC,
  simulateSMC,
} from '../js/control/nonlinear.js';

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

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== P26-01: Gain-Scheduled PID ===\n');

const BP  = [0, 50, 100];
const PID = [
  { Kp: 1.0, Ki: 0.1, Kd: 0.05 },
  { Kp: 1.5, Ki: 0.2, Kd: 0.08 },
  { Kp: 2.0, Ki: 0.4, Kd: 0.12 },
];

const gs = gainScheduledPID(BP, PID);

// Test 1: clamp below range
{
  const g = gs.getGains(-10);
  ok('Test 1: getGains clamps below first breakpoint',
    close(g.Kp, 1.0, 1e-12) && close(g.Ki, 0.1, 1e-12));
}

// Test 2: clamp above range
{
  const g = gs.getGains(200);
  ok('Test 2: getGains clamps above last breakpoint',
    close(g.Kp, 2.0, 1e-12) && close(g.Ki, 0.4, 1e-12));
}

// Test 3: linear interpolation at midpoint ρ=25 (midpoint of [0,50])
{
  const g = gs.getGains(25);
  const expKp = 1.0 + 0.5 * (1.5 - 1.0);  // = 1.25
  const expKi = 0.1 + 0.5 * (0.2 - 0.1);  // = 0.15
  ok('Test 3: linear interpolation Kp at ρ=25',
    close(g.Kp, expKp, 1e-10), `Kp=${g.Kp}, expected=${expKp}`);
  ok('Test 3: linear interpolation Ki at ρ=25',
    close(g.Ki, expKi, 1e-10), `Ki=${g.Ki}, expected=${expKi}`);
}

// Test 4: non-increasing breakpoints throw
{
  let threw = false;
  try { gainScheduledPID([0, 100, 50], PID); } catch { threw = true; }
  ok('Test 4: non-increasing breakpoints throw', threw);
}

// Test 5: mismatch length throws
{
  let threw = false;
  try { gainScheduledPID([0, 50], PID); } catch { threw = true; }
  ok('Test 5: length mismatch throws', threw);
}

// Test 6: closed-loop step tracking
{
  // 1st-order discrete plant: y[k+1] = 0.8·y[k] + 0.2·u[k]
  // Static scheduling: rho = 25 (fixed midpoint)
  // N=600 @ Ts=0.1 → 60s — sufficient for integral action to settle
  const N  = 600;
  const Ts = 0.1;
  const { y, e } = simulateGainScheduledPID(
    gs, 0.8, 0.2, Ts, N, 1.0,
    (_k, _y, _u) => 25,   // fixed schedule at midpoint
  );
  const finalError = Math.abs(e[N - 1]);
  ok('Test 6: step tracking error < 5% at end (60s simulation)',
    finalError < 0.05, `e[end]=${finalError.toFixed(4)}`);
  ok('Test 6: final output > 0.92',
    y[N - 1] > 0.92, `y[end]=${y[N - 1].toFixed(4)}`);
}

// Test 7: gain continuity at exact breakpoint (rho=50)
{
  const gBelow = gs.getGains(49.999);
  const gAt    = gs.getGains(50);
  const gAbove = gs.getGains(50.001);
  const jump = Math.max(
    Math.abs(gAt.Kp - gBelow.Kp),
    Math.abs(gAbove.Kp - gAt.Kp)
  );
  ok('Test 7: gain continuous at breakpoint (no discontinuous jump > 0.01)',
    jump < 0.01, `maxJump=${jump.toExponential(3)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== P26-03: Sliding Mode Control ===\n');

// Plant: ẋ₁=x₂, ẋ₂ = -x₂ + u  (a=-1, b=1, fCoeff=-1)
const SMC = designSMC(5, 2.0, 0.5, -1, 1);

// Test 8: sigma → 0 (reaching phase)
// SMC: c=5, eta=2, eps=0.5. Initial: x1=2→sigma(0)=10.
// Reaching: sigma_dot ≈ -eta (outside boundary layer) → decreases ≈ 2/s
// Steady state: |sigma| ≤ eps = 0.5 (boundary layer)
{
  const N = 500; const Ts = 0.01;
  const { sigma } = simulateSMC(SMC, -1, 1, Ts, N, 0,
    null, { x1_0: 2.0, x2_0: 0.0 });
  // At t=3s (step 300), sigma should have decreased by ≥50% from initial
  ok('Test 8: |sigma| decreasing — sigma[300] < 0.5·sigma[0]',
    Math.abs(sigma[300]) < Math.abs(sigma[0]) * 0.5,
    `sigma[0]=${sigma[0].toFixed(2)}, sigma[300]=${sigma[300].toFixed(4)}`);
  // Steady state: within boundary layer eps=0.5
  ok('Test 8: |sigma[end]| ≤ eps=0.5 (within boundary layer)',
    Math.abs(sigma[N - 1]) <= 0.5 + 1e-6,
    `sigma[end]=${sigma[N - 1].toFixed(4)}, eps=0.5`);
}

// Test 9: tracking error → 0
{
  const N = 600; const Ts = 0.01;
  const { x1 } = simulateSMC(SMC, -1, 1, Ts, N, 1.0,
    null, { x1_0: 0.0, x2_0: 0.0 });
  const finalErr = Math.abs(x1[N - 1] - 1.0);
  ok('Test 9: tracking error → 0 (step to r=1)',
    finalErr < 0.05, `|x1[end]-1|=${finalErr.toFixed(4)}`);
}

// Test 10: uMax saturation
{
  const smcSat = designSMC(5, 2.0, 0.5, -1, 1, { uMax: 3.0, uMin: -3.0 });
  const N = 200; const Ts = 0.01;
  const { u } = simulateSMC(smcSat, -1, 1, Ts, N, 5.0,
    null, { x1_0: 0.0, x2_0: 0.0 });
  const allSat = u.every(v => v <= 3.0 + 1e-10 && v >= -3.0 - 1e-10);
  ok('Test 10: u always within [uMin, uMax] saturation bounds',
    allSat, `max|u|=${Math.max(...u.map(Math.abs)).toFixed(4)}`);
}

// Test 11: converges under bounded sinusoidal disturbance (|d| < eta=2)
{
  const N = 800; const Ts = 0.01;
  const { x1 } = simulateSMC(SMC, -1, 1, Ts, N, 0.0,
    (k) => 1.5 * Math.sin(2 * Math.PI * k * Ts * 2), // |d| ≤ 1.5 < eta=2
    { x1_0: 1.0, x2_0: 0.0 });
  const finalErr = Math.abs(x1[N - 1]);
  ok('Test 11: converges under bounded disturbance (|d|<eta)',
    finalErr < 0.2, `|x1[end]|=${finalErr.toFixed(4)}`);
}

// Test 12: invalid arguments throw
{
  let t1 = false, t2 = false, t3 = false, t4 = false;
  try { designSMC(0, 1, 0.1, -1, 1); } catch { t1 = true; }
  try { designSMC(1, 0, 0.1, -1, 1); } catch { t2 = true; }
  try { designSMC(1, 1, 0,   -1, 1); } catch { t3 = true; }
  try { designSMC(1, 1, 0.1, -1, 0); } catch { t4 = true; }
  ok('Test 12: c=0 throws',    t1);
  ok('Test 12: eta=0 throws',  t2);
  ok('Test 12: eps=0 throws',  t3);
  ok('Test 12: gVal=0 throws', t4);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`P26 nonlinear control: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
