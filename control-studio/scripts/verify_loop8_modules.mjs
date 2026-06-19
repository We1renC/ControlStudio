#!/usr/bin/env node
/**
 * verify_loop8_modules.mjs — Zero-Flaw Loop 8 verification:
 *   - Multiple Lyapunov Functions (Branicky) for switched systems
 *   - 1-D heat equation boundary control (Krstic-Smyshlyaev)
 *   - Slotine-Li adaptive sliding-mode control with online parameter estimation
 */

import { certifyMLF } from '../js/verification/multiple_lyapunov.js';
import { simulateHeatBoundaryControl } from '../js/control/pde_boundary.js';
import { simulateAdaptiveSMC } from '../js/control/adaptive_smc.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── MLF: synthetic 2-mode switching trajectory with V monotone re-entry ──
{
  const modes = [
    { P: [[1, 0], [0, 1]] },
    { P: [[1, 0], [0, 1]] },
  ];
  // Trajectory: mode 0 from (1, 0), switches at t=1 (state (0.5, 0)) to mode 1,
  // back to mode 0 at t=2 (state (0.3, 0)), back to mode 1 at t=3 (state (0.2, 0)).
  const trajectory = [
    { t: 0,   mode: 0, x: [1.0, 0] },
    { t: 0.5, mode: 0, x: [0.7, 0] },
    { t: 1.0, mode: 1, x: [0.5, 0] },
    { t: 1.5, mode: 1, x: [0.4, 0] },
    { t: 2.0, mode: 0, x: [0.3, 0] },
    { t: 2.5, mode: 0, x: [0.25, 0] },
    { t: 3.0, mode: 1, x: [0.2, 0] },
  ];
  const r = certifyMLF(modes, trajectory);
  ok('MLF: condition 1 (V_i > 0)', r.condition1);
  ok('MLF: condition 2 (no V_j > V_i at switches)', r.condition2,
     `maxJump=${r.maxSwitchJump.toExponential(2)}`);
  ok('MLF: condition 3 (per-mode entry sequence non-increasing)', r.condition3);
}

// ── MLF: trajectory that violates monotone re-entry ──────────────────────
{
  const modes = [
    { P: [[1, 0], [0, 1]] },
    { P: [[1, 0], [0, 1]] },
  ];
  const trajectory = [
    { t: 0, mode: 0, x: [1.0, 0] },
    { t: 1, mode: 1, x: [0.5, 0] },
    { t: 2, mode: 0, x: [0.4, 0] },
    { t: 3, mode: 1, x: [0.6, 0] }, // re-entry of mode 1 with V=0.36 > previous 0.25 — violates cond 3
  ];
  const r = certifyMLF(modes, trajectory);
  ok('MLF: violation detection (cond 3 false)', r.condition3 === false);
}

// ── Heat equation boundary control: energy strictly decreases ────────────
{
  const sim = simulateHeatBoundaryControl({ L: 1, alpha: 0.1, N: 40, T: 5, kb: 1.0 });
  const e0 = sim.energy[0];
  const ef = sim.energy[sim.energy.length - 1];
  ok('PDE: initial energy > 0', e0 > 0);
  ok('PDE: final energy < initial', ef < e0, `e_0=${e0.toFixed(4)} e_f=${ef.toExponential(2)}`);
  // monotone non-increase along the trajectory.
  let monotone = true;
  for (let i = 1; i < sim.energy.length; i++) {
    if (sim.energy[i] > sim.energy[i - 1] + 1e-6) { monotone = false; break; }
  }
  ok('PDE: energy monotonically non-increasing', monotone);
  ok('PDE: decay ratio > 50× over 5 s', e0 / ef > 50);
}

// ── Adaptive SMC: track desired trajectory and identify unknown drift ─────
{
  // Plant: ẋ = θ_a * x + u, with unknown θ_a = -2. Identify θ_a and drive x → x_d = sin(t).
  const N = 6000;
  const Ts = 1e-3;
  const xd = new Array(N), xdDot = new Array(N), xdDDot = new Array(N);
  for (let k = 0; k < N; k++) {
    const ti = k * Ts;
    xd[k] = Math.sin(ti);
    xdDot[k] = Math.cos(ti);
    xdDDot[k] = -Math.sin(ti);
  }
  const plant = {
    a: () => 0,                     // unused
    b: 1,
    phi: (x) => [x],
  };
  const sim = simulateAdaptiveSMC(plant, [-2.0], [xd, xdDot, xdDDot], {
    Ts, K: 2.0, lambda: 5.0, gamma: 80.0, phiBl: 0.05,
    x0: 0, xDot0: 0, thetaHat0: [0],
  });
  const sFinal = Math.abs(sim.s[sim.s.length - 1]);
  ok('adaptive SMC: sliding variable |s| → small (< 0.1)', sFinal < 0.1, `|s|_T=${sFinal.toExponential(2)}`);
  const thetaFinal = sim.theta[sim.theta.length - 1][0];
  ok('adaptive SMC: θ̂_a converges to near true value -2 (within 0.5)',
     Math.abs(thetaFinal - (-2)) < 0.5, `θ̂_a=${thetaFinal.toFixed(3)} (true -2)`);
}

console.log('');
console.log(`Loop 8 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
