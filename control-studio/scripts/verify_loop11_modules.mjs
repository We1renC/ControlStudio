#!/usr/bin/env node
/**
 * verify_loop11_modules.mjs — Zero-Flaw Loop 11 verification:
 *   - LMI feasibility mini-solver (Boyd-Vandenberghe logdet barrier)
 *   - Discrete Wavelet Transform (Haar, Daubechies-4) round-trip
 *   - Bode sensitivity integral / waterbed effect (Freudenberg-Looze)
 */

import { lmiFeasibility, lyapunovLMI } from '../js/optimization/lmi_solver.js';
import { dwtDecompose, dwtReconstruct } from '../js/identification/wavelet.js';
import {
  bodeSensitivityIntegralAnalytic, bodeSensitivityIntegralNumeric, waterbedTradeoff,
} from '../js/analysis/bode_integral.js';
import { TransferFunction } from '../js/control/transfer-function.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── LMI feasibility on a simple identity test ─────────────────────────────
// Find x ∈ ℝ such that x · I + diag(-1, -2) ⪰ 0 — feasible for x ≥ 2.
{
  const F0 = [[-1, 0], [0, -2]];
  const F1 = [[1, 0], [0, 1]];
  const result = lmiFeasibility(F0, [F1], { maxIter: 50 });
  ok('LMI: simple identity feasibility solved', result.feasible);
  ok('LMI: x ≥ 2 lower-bounded', result.x[0] >= 1.9, `x=${result.x[0].toFixed(3)}`);
}

// ── Lyapunov LMI on a stable A ────────────────────────────────────────────
{
  const A = [[-1, 0], [0, -2]];
  const res = lyapunovLMI(A);
  ok('Lyapunov LMI: feasibility for stable A', res.feasible);
  ok('Lyapunov LMI: P is symmetric',
     Math.abs(res.P[0][1] - res.P[1][0]) < 1e-6);
  ok('Lyapunov LMI: P > 0 (positive diagonal)',
     res.P[0][0] > 0 && res.P[1][1] > 0,
     `P_diag=[${res.P[0][0].toFixed(3)}, ${res.P[1][1].toFixed(3)}]`);
}

// ── Haar DWT round-trip ────────────────────────────────────────────────────
{
  const signal = [4, 6, 10, 12, 8, 6, 5, 5];
  const dec = dwtDecompose(signal, { wavelet: 'haar', levels: 3 });
  ok('Haar DWT: approximation collapses to 1 sample at 3 levels',
     dec.approximation.length === 1);
  const back = dwtReconstruct(dec);
  ok('Haar DWT: round-trip reconstruction within 1e-10',
     back.every((v, i) => Math.abs(v - signal[i]) < 1e-10),
     `max err = ${Math.max(...back.map((v, i) => Math.abs(v - signal[i]))).toExponential(2)}`);
}

// ── Daubechies-4 DWT round-trip ───────────────────────────────────────────
{
  const N = 64;
  const signal = Array.from({ length: N }, (_, i) => Math.sin(0.3 * i) + 0.2 * Math.cos(1.7 * i));
  const dec = dwtDecompose(signal, { wavelet: 'db2', levels: 3 });
  const back = dwtReconstruct(dec);
  const maxErr = Math.max(...back.map((v, i) => Math.abs(v - signal[i])));
  ok('db2 DWT: round-trip reconstruction within 1e-10',
     maxErr < 1e-10, `max err = ${maxErr.toExponential(2)}`);
}

// ── Bode sensitivity integral on a stable loop (no RHP poles) ──────────────
// L(s) = 1/(s² + 2s + 1) ⇒ analytic integral = 0.
{
  const L = new TransferFunction([1], [1, 2, 1]);
  const analytic = bodeSensitivityIntegralAnalytic(L);
  ok('Bode integral: analytic value = 0 for stable L', Math.abs(analytic.analyticValue) < 1e-12);
  const numeric = bodeSensitivityIntegralNumeric(L, { decadesBelow: -3, decadesAbove: 3, samples: 4001 });
  ok('Bode integral: numeric matches analytic within 0.01 (stable L)',
     Math.abs(numeric) < 0.01, `numeric=${numeric.toExponential(2)}`);
}

// ── Bode sensitivity integral with an RHP pole ────────────────────────────
// L(s) = 2/((s − 1)(s + 5)) — unstable pole at s = 1, so analytic = π · 1.
{
  const L = new TransferFunction([2], [1, 4, -5]);   // s² + 4s − 5 = (s-1)(s+5)
  const analytic = bodeSensitivityIntegralAnalytic(L);
  ok('Bode integral: RHP pole identified at s = 1',
     analytic.rhpPoles.length === 1 && Math.abs(analytic.rhpPoles[0].re - 1) < 1e-6);
  ok('Bode integral: analytic = π · Re(p) ≈ 3.1416',
     Math.abs(analytic.analyticValue - Math.PI) < 1e-9,
     `value=${analytic.analyticValue.toFixed(4)}`);
}

// ── Waterbed trade-off: low-band reduction implies high-band increase ─────
{
  const L = new TransferFunction([1], [1, 2, 1]);   // stable; conservation says total = 0
  const wb = waterbedTradeoff(L, [0.01, 1], [1, 100]);
  ok('Waterbed: low + high integral ≈ analytic total within 0.05',
     Math.abs((wb.lowIntegral + wb.highIntegral) - wb.analyticTotal) < 0.05,
     `low+high=${(wb.lowIntegral + wb.highIntegral).toFixed(3)} analytic=${wb.analyticTotal.toFixed(3)}`);
  ok('Waterbed: sign trade-off (one negative, one positive)',
     wb.lowIntegral * wb.highIntegral <= 0 || Math.abs(wb.lowIntegral) + Math.abs(wb.highIntegral) < 1e-3,
     `low=${wb.lowIntegral.toFixed(3)} high=${wb.highIntegral.toFixed(3)}`);
}

console.log('');
console.log(`Loop 11 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
