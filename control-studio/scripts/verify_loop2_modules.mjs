#!/usr/bin/env node
/**
 * verify_loop2_modules.mjs — Zero-Flaw Loop 2 verification covering:
 *  - ν-gap (Vinnicombe) metric
 *  - DeePC + persistent-excitation Hankel check
 *  - Clarke / Park / dq inverse round-trip
 *  - Event-triggered control inter-event lower bound
 */

import { TransferFunction } from '../js/control/transfer-function.js';
import { nuGap, robustBallFromNuGap } from '../js/control/nu_gap.js';
import { buildHankel, checkPersistentExcitation, deepcPredict } from '../js/control/deepc.js';
import {
  clarke, inverseClarke, park, inversePark, abcToDq, dqToAbc,
} from '../js/control/dq_transforms.js';
import { eventTriggeredSimulation } from '../js/control/event_triggered.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── ν-gap ─────────────────────────────────────────────────────────────────
{
  const G1 = new TransferFunction([1], [1, 1]);
  const G2 = new TransferFunction([1], [1, 1]);
  const r = nuGap(G1, G2);
  ok('ν-gap: identical plants → δ_ν = 0', r.nuGap < 1e-9, `δ_ν=${r.nuGap.toExponential(2)}`);
}
{
  const G1 = new TransferFunction([1], [1, 1]);
  const G2 = new TransferFunction([1], [1, 2]);
  const r = nuGap(G1, G2);
  ok('ν-gap: 1/(s+1) vs 1/(s+2) δ_ν ∈ (0, 0.5)', r.nuGap > 0 && r.nuGap < 0.5,
     `δ_ν=${r.nuGap.toFixed(4)}`);
}
{
  const G1 = new TransferFunction([1], [1, 1]);
  const G2 = new TransferFunction([10], [1, 1]);
  const r = nuGap(G1, G2);
  ok('ν-gap: gain change tightly bounded by 1', r.nuGap <= 1 + 1e-9);
}
{
  ok('ν-gap: robust ball derived (ε=0.2 ⇒ 0.8)',
     Math.abs(robustBallFromNuGap(0.2) - 0.8) < 1e-12);
}

// ── DeePC / Willems' lemma ────────────────────────────────────────────────
{
  // Persistent excitation on PRBS-like signal.
  const T = 60;
  const u = new Array(T);
  for (let i = 0; i < T; i++) u[i] = Math.sin(i) + Math.sin(0.27 * i) + Math.cos(0.61 * i);
  const pe = checkPersistentExcitation(u, 5);
  ok('Hankel: PE rank meets requirement', pe.persistent, `rank=${pe.rank}/${pe.requiredRank}`);

  // Synthetic LTI data: y_{k+1} = 0.6 y_k + 0.4 u_k. Generate, then DeePC.
  const y = new Array(T).fill(0);
  for (let k = 1; k < T; k++) y[k] = 0.6 * y[k - 1] + 0.4 * u[k - 1];

  const Tini = 4, N = 6;
  const uIni = u.slice(T - N - Tini, T - N);
  const yIni = y.slice(T - N - Tini, T - N);
  const ref = new Array(N).fill(1.0);
  const pred = deepcPredict(u.slice(0, T - N), y.slice(0, T - N), Tini, N, uIni, yIni, ref,
                            { Q: 100, R: 0.01, lambdaG: 1e-2, lambdaS: 1e6 });
  ok('DeePC: u_future has length N', pred.uFuture.length === N);
  ok('DeePC: y_future has length N', pred.yFuture.length === N);
  const yEnd = pred.yFuture[N - 1];
  ok('DeePC: prediction approaches reference at horizon end',
     Math.abs(yEnd - 1.0) < 0.5, `y_N=${yEnd.toFixed(3)}`);
}

// ── Clarke / Park round trips ─────────────────────────────────────────────
{
  const abc = [1.0, -0.5, -0.5];
  const ab = clarke(abc);
  ok('Clarke amplitude variant: α ≈ 1', Math.abs(ab.alpha - 1) < 1e-12);
  ok('Clarke amplitude variant: β ≈ 0', Math.abs(ab.beta - 0) < 1e-12);
  const back = inverseClarke(ab);
  ok('Inverse Clarke round-trip', back.every((v, i) => Math.abs(v - abc[i]) < 1e-12));
}
{
  // Synthesise a balanced cosine three-phase signal at θ = π/3.
  const theta = Math.PI / 3;
  const abc = [Math.cos(theta), Math.cos(theta - 2 * Math.PI / 3), Math.cos(theta + 2 * Math.PI / 3)];
  const dq = abcToDq(abc, theta);
  ok('Park: balanced cosine ⇒ d ≈ 1', Math.abs(dq.d - 1) < 1e-10);
  ok('Park: balanced cosine ⇒ q ≈ 0', Math.abs(dq.q) < 1e-10);
  const back = dqToAbc(dq, theta);
  ok('Park round-trip exact', back.every((v, i) => Math.abs(v - abc[i]) < 1e-10));
}

// ── Event-triggered control inter-event bound ─────────────────────────────
{
  const A = [[0, 1], [-1, -1]];
  const B = [[0], [1]];
  const K = [[1, 1]]; // arbitrary stabilising gain
  const sim = eventTriggeredSimulation(A, B, K, {
    sigma: 0.05, T: 2, dt: 1e-3, x0: [1, 0],
  });
  ok('event-trig: at least 1 trigger event', sim.events.length >= 1);
  ok('event-trig: τ_min theoretical is finite and > 0', sim.tauMinTheory > 0 && Number.isFinite(sim.tauMinTheory));
  ok('event-trig: observed τ_min ≥ theoretical lower bound (Zeno-free)',
     sim.tauMinObserved >= sim.tauMinTheory - 1e-6,
     `obs=${sim.tauMinObserved.toExponential(2)} theory=${sim.tauMinTheory.toExponential(2)}`);
}

console.log('');
console.log(`Loop 2 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
