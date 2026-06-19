#!/usr/bin/env node
/**
 * verify_loop4_modules.mjs — Zero-Flaw Loop 4 verification:
 *   - DOB (Disturbance Observer)
 *   - Repetitive Control
 *   - Generic anti-windup (back-calculation) + bumpless transfer
 *   - VRFT (Virtual Reference Feedback Tuning)
 *   - Funnel / Prescribed Performance Control
 */

import { TransferFunction } from '../js/control/transfer-function.js';
import { buildDOB } from '../js/control/disturbance_observer.js';
import { buildRepetitiveController, repetitiveStabilityMargin, simulateRC } from '../js/control/repetitive_control.js';
import { simulateBackCalculationAW, bumplessTransfer } from '../js/control/anti_windup_general.js';
import { vrft, virtualReference } from '../js/control/vrft.js';
import { defaultFunnel, funnelControlStep, simulateFunnelControl } from '../js/control/funnel_control.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── DOB ───────────────────────────────────────────────────────────────────
{
  const Pn = new TransferFunction([1], [1, 1]);    // 1/(s+1)
  const dob = buildDOB(Pn, { cutoff: 20, filterOrder: 2 });
  ok('DOB: low-pass Q TF built', !!dob.Q && Array.isArray(dob.Q.num));
  ok('DOB: Q·Pn^{-1} proper (deg num ≤ deg den)',
     dob.QinvPn.num.length <= dob.QinvPn.den.length);

  // Synthesize signals: ideal plant Pn output to step input plus constant disturbance.
  const Ts = 1e-3, T = 2.0;
  const N = Math.round(T / Ts);
  const u = new Array(N).fill(1.0);
  const y = new Array(N);
  let yV = 0;
  const dStep = 0.4;
  for (let k = 0; k < N; k++) {
    yV += Ts * (-yV + u[k] + dStep);   // ẏ = -y + u + d
    y[k] = yV;
  }
  const dHat = dob.estimate(u, y, Ts);
  const final = dHat[dHat.length - 1];
  ok('DOB: steady-state disturbance estimate close to true 0.4', Math.abs(final - dStep) < 0.05,
     `d̂=${final.toFixed(4)} truth=${dStep}`);
}

// ── Repetitive Control ───────────────────────────────────────────────────
{
  const N = 20;
  const rc = buildRepetitiveController(N, { kr: 0.5, Q: 0.95 });
  ok('RC: controller object built', !!rc && rc.N === 20);
  const Ts = 1e-3;
  const c = rc.evalAt(Math.PI / (N * Ts), Ts);
  ok('RC: frequency response finite at periodic frequency',
     Number.isFinite(c.re) && Number.isFinite(c.im));

  // Stability margin check
  const Gcl = new TransferFunction([1], [1, 1]); // 1/(s+1) closed-loop proxy
  const omegas = [];
  for (let i = 0; i < 100; i++) omegas.push(0.1 * Math.pow(10, 3 * i / 99));
  const margin = repetitiveStabilityMargin(Gcl, omegas, { kr: 0.5, Q: 0.95 });
  ok('RC: stability margin < 1 ⇒ stable plug-in', margin.stable,
     `worst=${margin.worst.toFixed(4)} at ω=${margin.worstOmega.toFixed(2)}`);

  const sim = simulateRC(Gcl, 0.5, Ts, { trials: 10, kr: 0.5, Q: 0.95 });
  ok('RC: contraction factor < 1', sim.contractionFactor < 1, `q=${sim.contractionFactor.toFixed(4)}`);
  ok('RC: error decreases monotonically across trials',
     sim.errors.every((e, i) => i === 0 || e <= sim.errors[i - 1] + 1e-12));
}

// ── Back-calculation anti-windup ─────────────────────────────────────────
{
  // SISO PI controller as state-space: x_c integrator, u = Kp e + Ki x_c.
  const ctrl = {
    Ac: [[0]], Bc: [[1]], Cc: [[2.0]], Dc: [[5.0]],
  };
  const Ts = 1e-3, T = 2.0;
  const N = Math.round(T / Ts);
  const ref = new Array(N).fill(1.0);
  const fb  = new Array(N).fill(0.0);
  const noAW = simulateBackCalculationAW(ctrl, ref, fb, Ts, { uHi: 1.0, uLo: -1.0, Kaw: [[0]] });
  const withAW = simulateBackCalculationAW(ctrl, ref, fb, Ts, { uHi: 1.0, uLo: -1.0, Kaw: [[20]] });
  // Anti-windup should keep integrator state bounded.
  const xNoAWFinal = Math.abs(noAW.xc[noAW.xc.length - 1][0]);
  const xWithAWFinal = Math.abs(withAW.xc[withAW.xc.length - 1][0]);
  ok('AW: back-calculation bounds integrator state',
     xWithAWFinal < xNoAWFinal, `noAW=${xNoAWFinal.toFixed(3)} withAW=${xWithAWFinal.toFixed(3)}`);
  ok('AW: u saturates between [-1, 1]',
     withAW.uSat.every((v) => v <= 1 + 1e-12 && v >= -1 - 1e-12));
}

// ── Bumpless transfer between two PIs ────────────────────────────────────
{
  const ctrlA = { Ac: [[0]], Bc: [[1]], Cc: [[1.0]], Dc: [[2.0]] };
  const ctrlB = { Ac: [[0]], Bc: [[1]], Cc: [[5.0]], Dc: [[8.0]] };
  const Ts = 1e-3, T = 1.0;
  const N = Math.round(T / Ts);
  const ref = new Array(N).fill(1.0);
  const fb  = new Array(N).fill(0.0);
  const out = bumplessTransfer(ctrlA, ctrlB, ref, fb, Ts);
  ok('bumpless: u finite', out.u.every((v) => Number.isFinite(v)));
  // The first sample should be close to A's output, the last close to B's.
  ok('bumpless: u monotonically transitions',
     out.u[0] < out.u[Math.round(N/2)] && out.u[Math.round(N/2)] < out.u[N - 1]);
}

// ── VRFT ─────────────────────────────────────────────────────────────────
{
  // Generate data from a true plant G(z) = 0.3 z^{-1} / (1 - 0.7 z^{-1})
  // Excite with PRBS-like input, fit a PI in discrete (basis: [1, 1/(1-z^{-1})]).
  const Tdata = 600;
  const u = new Array(Tdata), y = new Array(Tdata).fill(0);
  for (let k = 0; k < Tdata; k++) u[k] = Math.sin(0.13 * k) + 0.5 * Math.sin(0.41 * k);
  for (let k = 1; k < Tdata; k++) y[k] = 0.7 * y[k - 1] + 0.3 * u[k - 1];

  // Reference model M(z) = 0.2 z^{-1} / (1 - 0.8 z^{-1})
  const M = { num: [0, 0.2], den: [1, -0.8] };
  // basis: P term [1] and I term [1, 0]/[1, -1]
  const basis = [
    { num: [1],    den: [1] },
    { num: [1, 0], den: [1, -1] },
  ];
  const fit = vrft(M, u, y, basis, { filterDisabled: true });
  ok('VRFT: theta vector length = basis length', fit.theta.length === 2);
  ok('VRFT: theta entries finite', fit.theta.every((v) => Number.isFinite(v)));
  // virtualReference round-trip: M r̃ ≈ y_d
  const rt = virtualReference(M, y);
  let mismatchOk = true;
  // re-applying M to r̃ should reproduce y up to initial transient
  // M r̃[k] = 0.8 (M r̃)[k-1] + 0.2 r̃[k-1]
  const mRt = new Array(Tdata).fill(0);
  for (let k = 1; k < Tdata; k++) mRt[k] = 0.8 * mRt[k - 1] + 0.2 * rt[k - 1];
  let sumAbs = 0;
  for (let k = 50; k < Tdata; k++) sumAbs += Math.abs(mRt[k] - y[k]);
  ok('VRFT: M(z) · r̃ ≈ y_d after transient', sumAbs / (Tdata - 50) < 1e-3,
     `mean abs diff = ${(sumAbs / (Tdata - 50)).toExponential(2)}`);
}

// ── Funnel control ──────────────────────────────────────────────────────
{
  const funnel = defaultFunnel(2.0, 0.05, 3.0);
  const step = funnelControlStep(0.0, 0, funnel);
  ok('funnel: slack > 0 at origin', step.slack > 0);

  // Simulate ẏ = -y + b u on 5 seconds with constant ref = 1.
  const ref = new Array(5000).fill(1.0);
  const sim = simulateFunnelControl({ a: -1, b: 1 }, ref, funnel, { Ts: 1e-3, y0: 0 });
  ok('funnel: funnel not breached during 5 s', !sim.funnelBreached);
  ok('funnel: steady-state error within asymptotic φ_∞',
     Math.abs(sim.e[sim.e.length - 1]) < 0.05 + 1e-9,
     `|e_∞|=${Math.abs(sim.e[sim.e.length - 1]).toFixed(4)}`);
}

console.log('');
console.log(`Loop 4 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
