#!/usr/bin/env node
/**
 * verify_loop15_modules.mjs — Zero-Flaw Loop 15 verification:
 *   - Lindblad master equation (open quantum system)
 *   - Levant arbitrary-order sliding-mode differentiator + HOSM controller
 *   - Kokotović singular perturbation two-time-scale decomposition
 */

import { simulateLindblad, PAULI } from '../js/control/quantum_lindblad.js';
import {
  levantDifferentiator, homogeneousQuasiContinuousControl,
} from '../js/control/higher_order_sliding_mode.js';
import {
  singularPerturbationDecomposition, simulateBothScales,
} from '../js/control/singular_perturbation.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── Lindblad: unitary evolution (no jump ops) preserves trace and purity ─
{
  // H = (ω/2) σ_z, drives Larmor precession; no jump ops → pure unitary.
  const omega = 2 * Math.PI;
  const H = PAULI.Z.map((row) => row.map((c) => ({ re: c.re * omega / 2, im: c.im * omega / 2 })));
  // Initial state |+⟩⟨+|
  const rho0 = [
    [{ re: 0.5, im: 0 }, { re: 0.5, im: 0 }],
    [{ re: 0.5, im: 0 }, { re: 0.5, im: 0 }],
  ];
  const sim = simulateLindblad({ H, jumpOps: [] }, rho0, {
    T: 1, dt: 1e-3, observables: [PAULI.X],
  });
  ok('Lindblad: trace preserved to 1e-6',
     Math.abs(sim.trace[sim.trace.length - 1] - 1) < 1e-6,
     `tr_T=${sim.trace[sim.trace.length - 1].toFixed(8)}`);
  // ⟨σ_x⟩(t) = cos(ω t) for Larmor precession. At t=1: cos(2π) = 1.
  const xFinal = sim.observables[0][sim.observables[0].length - 1];
  ok('Lindblad: ⟨σ_x⟩(1) ≈ cos(2π) = 1', Math.abs(xFinal - 1) < 5e-3,
     `⟨σ_x⟩_T=${xFinal.toFixed(4)}`);
}

// ── Lindblad: amplitude damping drives ⟨σ_z⟩ → 1 (ground state |0⟩) ──────
{
  const zero = [
    [{ re: 0, im: 0 }, { re: 0, im: 0 }],
    [{ re: 0, im: 0 }, { re: 0, im: 0 }],
  ];
  const H = zero;
  const gamma = 2.0;
  const L = PAULI.minus.map((row) => row.map((c) => ({
    re: c.re * Math.sqrt(gamma), im: c.im * Math.sqrt(gamma),
  })));
  // Initial state |1⟩⟨1| (excited)
  const rho0 = [
    [{ re: 0, im: 0 }, { re: 0, im: 0 }],
    [{ re: 0, im: 0 }, { re: 1, im: 0 }],
  ];
  const sim = simulateLindblad({ H, jumpOps: [L] }, rho0, {
    T: 5, dt: 1e-3, observables: [PAULI.Z],
  });
  const zFinal = sim.observables[0][sim.observables[0].length - 1];
  // ⟨σ_z⟩ → +1 as population decays to |0⟩
  ok('Lindblad: amplitude damping drives ⟨σ_z⟩ → +1',
     zFinal > 0.95, `⟨σ_z⟩_T=${zFinal.toFixed(4)}`);
  ok('Lindblad: trace still preserved under dissipation',
     Math.abs(sim.trace[sim.trace.length - 1] - 1) < 1e-5);
}

// ── Levant differentiator: estimate derivative of f(t) = sin(t) ──────────
{
  const diff = levantDifferentiator(2, 5);
  const Ts = 1e-3;
  const T = 2.0;
  const N = Math.round(T / Ts);
  for (let k = 0; k < N; k++) {
    const t = k * Ts;
    diff.step(Math.sin(t), Ts);
  }
  // After transient, z_0 ≈ sin, z_1 ≈ cos, z_2 ≈ −sin at t=2.
  const z = diff.z;
  const sinT = Math.sin(N * Ts);
  const cosT = Math.cos(N * Ts);
  ok('Levant: z_0 tracks sin(t) within 0.05',
     Math.abs(z[0] - sinT) < 0.05, `z_0=${z[0].toFixed(4)} sin=${sinT.toFixed(4)}`);
  ok('Levant: z_1 tracks cos(t) within 0.1',
     Math.abs(z[1] - cosT) < 0.1, `z_1=${z[1].toFixed(4)} cos=${cosT.toFixed(4)}`);
}

// ── HOSM controller closed-loop on a double integrator ───────────────────
{
  // Plant ẍ = u; sliding surface σ = x + ẋ (relative degree 2 from u to σ).
  // Use Levant order-2 controller homogeneousQuasiContinuousControl.
  const Ts = 1e-3;
  const T = 3.0;
  const N = Math.round(T / Ts);
  let x = 1, v = 0;
  let initialNorm = Math.hypot(x, v);
  for (let k = 0; k < N; k++) {
    const sigma = x + v;
    const sigmaDot = v;       // since σ = x + v ⇒ σ̇ = v + a = v + u (treat as σ̇ ≈ v for relative deg 2)
    const u = homogeneousQuasiContinuousControl([sigma, sigmaDot], { alpha: 5 });
    v += Ts * u;
    x += Ts * v;
  }
  const finalNorm = Math.hypot(x, v);
  ok('HOSM: state norm drops at least 3×', finalNorm < initialNorm / 3,
     `init=${initialNorm.toFixed(4)} final=${finalNorm.toExponential(2)}`);
}

// ── Singular perturbation decomposition + Tikhonov O(ε) approximation ────
{
  // Slow x, fast z. Choose A_22 stable (eigenvalue -10) so boundary layer
  // converges quickly.
  const sys = {
    A11: [[-1]],
    A12: [[1]],
    A21: [[2]],
    A22: [[-10]],
  };
  const dec = singularPerturbationDecomposition(sys);
  // A_r = -1 - 1·(-1/10)·2 = -1 - (-0.2) = -0.8
  ok('SP: reduced A = -0.8', Math.abs(dec.reduced.A[0][0] - (-0.8)) < 1e-9,
     `A_r=${dec.reduced.A[0][0].toFixed(4)}`);
  // Simulate both scales: ε small enough → worst slow deviation small.
  const sim = simulateBothScales(sys, [1], [0], { T: 1.0, Ts: 1e-4, epsilon: 0.005 });
  ok('SP: O(ε) Tikhonov approximation (worst deviation < 0.05)',
     sim.worstDeviation < 0.05, `worst=${sim.worstDeviation.toExponential(2)}`);
}

console.log('');
console.log(`Loop 15 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
