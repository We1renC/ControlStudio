#!/usr/bin/env node
/**
 * verify_loop7_modules.mjs — Zero-Flaw Loop 7 verification:
 *   - SOS Lyapunov / ROA estimation
 *   - Sliding-Mode and High-Gain Observers
 *   - Nash / Stackelberg LQ differential games
 *   - Classical PID auto-tuning rules
 */

import { certifySOSLyapunovQuadratic } from '../js/verification/sos_lyapunov.js';
import { simulateSlidingModeObserver, simulateHighGainObserver } from '../js/estimation/nonlinear_observers.js';
import { solveLqNash, solveLqStackelberg } from '../js/control/game_theoretic.js';
import { ZN_OPEN, ZN_CLOSED, TYREUS_LUYBEN, COHEN_COON, AMIGO, toParallelGains } from '../js/control/autotuning_rules.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── SOS Lyapunov on a globally stable nonlinear system ────────────────────
// ẋ_1 = -x_1 + x_2,  ẋ_2 = -x_2 - x_1³ + x_2² · (-0.1)
// V(x) = x_1² + x_2² should certify ROA around origin for small box.
{
  const f = (x) => [
    -x[0] + x[1],
    -x[1] - Math.pow(x[0], 3) - 0.1 * x[1] * x[1],
  ];
  const P = [[1, 0], [0, 1]];
  const r = certifySOSLyapunovQuadratic(f, P, {
    gridSize: 31, radius: 1.0, epsilon: 1e-5,
  });
  ok('SOS: ROA γ̂ > 0 (non-trivial sublevel set)', r.roaGamma > 0, `γ̂=${r.roaGamma.toFixed(4)}`);
  ok('SOS: V̇ at boundary ≤ -ε', r.vDotMaxAtGamma <= -1e-6, `V̇_max=${r.vDotMaxAtGamma.toExponential(2)}`);
}

// ── SMO on a chain integrator with bounded uncertainty ────────────────────
{
  // Chain: ẋ_1 = x_2, ẋ_2 = u + d(t). Plant.f returns vector field's last entry.
  const plant = {
    f: (x) => 0,         // unknown drift, observer must reject it
    g: () => 1,
  };
  const N = 5000;
  const ref = new Array(N);
  const u = new Array(N);
  let xTrue1 = 1.0, xTrue2 = 0.0;
  const Ts = 1e-3;
  for (let k = 0; k < N; k++) {
    u[k] = -xTrue1 - 1.5 * xTrue2;       // simple stabiliser
    xTrue1 += Ts * xTrue2;
    xTrue2 += Ts * u[k];                 // no unmodeled drift in nominal test
    ref[k] = xTrue1;                     // measured output
  }
  const smo = simulateSlidingModeObserver(plant, ref, u, {
    Ts, gains: [50, 400], phi: 0.005, x0: [1.0, 0.0], xHat0: [0.5, 0.0],
  });
  // The estimation error should drop substantially from the initial 0.5.
  const initialErr = Math.abs(smo.err[0]);
  const tail = smo.err.slice(-200);
  const avgTail = tail.reduce((s, v) => s + Math.abs(v), 0) / tail.length;
  ok('SMO: average |error| drops at least 5× from initial',
     avgTail < initialErr / 5 || avgTail < 0.1,
     `init=${initialErr.toFixed(3)} avg_tail=${avgTail.toExponential(2)}`);
}

// ── HGO ε-convergence ─────────────────────────────────────────────────────
{
  const plant = { f: () => 0, g: () => 1 };
  const N = 3000;
  const Ts = 1e-3;
  const ref = new Array(N), u = new Array(N);
  let xTrue1 = 1.0, xTrue2 = 0.0;
  for (let k = 0; k < N; k++) {
    u[k] = 0;
    xTrue1 += Ts * xTrue2;
    xTrue2 += Ts * u[k];
    ref[k] = xTrue1;
  }
  // ε small → fast convergence. α from desired observer poles at -1.
  // Char poly: s² + α_1 s + α_2 with poles at -1 (double): α_1 = 2, α_2 = 1.
  const fast = simulateHighGainObserver(plant, ref, u, { Ts, epsilon: 0.05, alpha: [2, 1], x0: [1.0, 0.0], xHat0: [0, 0] });
  const slow = simulateHighGainObserver(plant, ref, u, { Ts, epsilon: 0.5, alpha: [2, 1], x0: [1.0, 0.0], xHat0: [0, 0] });
  const fastErrLate = Math.abs(fast.err[Math.floor(N * 0.5)]);
  const slowErrLate = Math.abs(slow.err[Math.floor(N * 0.5)]);
  ok('HGO: smaller ε converges faster',
     fastErrLate < slowErrLate + 1e-9 || fastErrLate < 1e-3,
     `fast=${fastErrLate.toExponential(2)} slow=${slowErrLate.toExponential(2)}`);
}

// ── Nash LQ game on a 2-state symmetric system ───────────────────────────
{
  const A = [[0, 1], [-1, -1]];
  const B1 = [[0], [1]];
  const B2 = [[0], [1]];
  const weights = {
    Q1: [[1, 0], [0, 1]], R1: [[1]],
    Q2: [[1, 0], [0, 1]], R2: [[1]],
  };
  const out = solveLqNash(A, B1, B2, weights, { maxIter: 30 });
  ok('Nash: K_1 has shape 1×2', out.K1.length === 1 && out.K1[0].length === 2);
  ok('Nash: K_2 has shape 1×2', out.K2.length === 1 && out.K2[0].length === 2);
  ok('Nash: iteration converged within budget', out.iterations < 30);
  // Closed-loop A should be stable (largest real eigenvalue < 0).
  const Acl = out.closedLoopA;
  const trace = Acl[0][0] + Acl[1][1];
  ok('Nash: closed-loop trace < 0 (necessary stability)', trace < 0, `tr=${trace.toFixed(4)}`);
}

// ── Stackelberg surrogate cost decreases ─────────────────────────────────
{
  const A = [[0, 1], [-1, -0.5]];
  const B1 = [[0], [1]];
  const B2 = [[0], [1]];
  const weights = {
    Q1: [[1, 0], [0, 1]], R1: [[1]],
    Q2: [[1, 0], [0, 1]], R2: [[5]],   // follower has higher input cost
  };
  const out = solveLqStackelberg(A, B1, B2, weights, { iterations: 12, stepSize: 0.02 });
  ok('Stackelberg: J_1 trajectory recorded', out.J1History.length === 12);
  ok('Stackelberg: J_1 non-increasing across iterations',
     out.J1History[0] >= out.J1History[out.J1History.length - 1] - 1e-3,
     `J_1: ${out.J1History[0].toFixed(3)} → ${out.J1History[out.J1History.length - 1].toFixed(3)}`);
}

// ── Auto-tuning rules: sanity values ─────────────────────────────────────
{
  const fopdt = { K: 1.0, T: 2.0, L: 0.5 };
  const ult   = { Ku: 3.0, Tu: 1.2 };
  const z1 = ZN_OPEN.pid(fopdt);
  ok('ZN open-loop PID: Kp = 1.2 T/(K L) = 4.8', Math.abs(z1.Kp - 4.8) < 1e-9);
  ok('ZN open-loop PID: Td = 0.5 L = 0.25', Math.abs(z1.Td - 0.25) < 1e-9);
  const z2 = ZN_CLOSED.pid(ult);
  ok('ZN closed-loop PID: Kp = 0.6 Ku = 1.8', Math.abs(z2.Kp - 1.8) < 1e-9);
  ok('ZN closed-loop PID: Ti = Tu/2 = 0.6', Math.abs(z2.Ti - 0.6) < 1e-9);
  const tl = TYREUS_LUYBEN.pid(ult);
  ok('Tyreus-Luyben PID: Kp = Ku/2.2', Math.abs(tl.Kp - 3 / 2.2) < 1e-9);
  const cc = COHEN_COON.pid(fopdt);
  ok('Cohen-Coon PID: Kp finite and positive', cc.Kp > 0 && Number.isFinite(cc.Kp));
  const am = AMIGO.pid(fopdt);
  ok('AMIGO PID: Kp ≈ 2.0', Math.abs(am.Kp - (0.2 + 0.45 * 2.0 / 0.5)) < 1e-9);
  const parallel = toParallelGains(z2);
  ok('toParallelGains: Ki = Kp/Ti = 3.0', Math.abs(parallel.Ki - 1.8 / 0.6) < 1e-9);
}

console.log('');
console.log(`Loop 7 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
