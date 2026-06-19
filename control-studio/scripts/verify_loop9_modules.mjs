#!/usr/bin/env node
/**
 * verify_loop9_modules.mjs — Zero-Flaw Loop 9 verification:
 *   - LaSalle's invariance principle certificate
 *   - MUSIC / ESPRIT high-resolution spectral estimation
 *   - Carleman linearization for polynomial nonlinear systems
 */

import { certifyLaSalle } from '../js/verification/lasalle.js';
import { musicSpectrum, espritFrequencies } from '../js/identification/spectral_subspace.js';
import { buildCarlemanScalar, simulateCarlemanScalar } from '../js/control/carleman.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── LaSalle on damped pendulum-like system ẋ_1 = x_2, ẋ_2 = -x_1 - x_2³ ─
// V(x) = (1/2)(x_1² + x_2²), V̇ = -x_2⁴ ≤ 0 with E = {x_2 = 0}.
// Largest invariant subset in E: x_2 = 0 ⇒ ẋ_2 = -x_1 = 0 ⇒ x_1 = 0.
{
  const f = (x) => [x[1], -x[0] - Math.pow(x[1], 3)];
  const V = (x) => 0.5 * (x[0] * x[0] + x[1] * x[1]);
  const result = certifyLaSalle(f, V, {
    radius: 0.8, gridSize: 9, simulationT: 5.0, simulationDt: 5e-3, targetTol: 0.1,
  });
  ok('LaSalle: certificate holds (largest invariant in E is origin)', result.certificate,
     result.witness ? `witness=${JSON.stringify(result.witness)}` : `samplesOnE=${result.samplesOnE}`);
}

// ── MUSIC on a two-tone signal at 50 Hz and 120 Hz ────────────────────────
{
  const fs = 1000;
  const N = 256;
  const x = new Array(N);
  for (let n = 0; n < N; n++) {
    x[n] = Math.cos(2 * Math.PI * 50 * n / fs)
         + 0.8 * Math.cos(2 * Math.PI * 120 * n / fs)
         + 0.05 * (Math.random() - 0.5);
  }
  const res = musicSpectrum(x, fs, 2, { M: 32 });
  ok('MUSIC: returned 2 peaks', res.peaks.length === 2);
  const sortedPeaks = res.peaks.slice().sort((a, b) => a - b);
  ok('MUSIC: lower peak within 5 Hz of 50',
     Math.abs(sortedPeaks[0] - 50) < 5, `peak1=${sortedPeaks[0].toFixed(1)} Hz`);
  ok('MUSIC: upper peak within 5 Hz of 120',
     Math.abs(sortedPeaks[1] - 120) < 5, `peak2=${sortedPeaks[1].toFixed(1)} Hz`);
}

// ── Carleman: truncation residual shrinks with N for small initial state ─
{
  // ẋ = -x + 0.5 x²; small x0 should give the lifted system close to the
  // exact nonlinear solution for short horizon.
  const coeffs = [-1, 0.5];
  const x0 = 0.3;
  const sim3 = simulateCarlemanScalar(coeffs, x0, { T: 0.5, dt: 1e-3, N: 3 });
  const sim6 = simulateCarlemanScalar(coeffs, x0, { T: 0.5, dt: 1e-3, N: 6 });
  const errN3 = Math.abs(sim3.xExact[sim3.xExact.length - 1] - sim3.xApprox[sim3.xApprox.length - 1]);
  const errN6 = Math.abs(sim6.xExact[sim6.xExact.length - 1] - sim6.xApprox[sim6.xApprox.length - 1]);
  ok('Carleman: matrix non-empty for N=3', sim3.A.length === 3);
  ok('Carleman: truncation error N=6 ≤ N=3',
     errN6 <= errN3 + 1e-9, `errN3=${errN3.toExponential(2)} errN6=${errN6.toExponential(2)}`);
  ok('Carleman: error N=6 is small (< 1e-3)',
     errN6 < 1e-3, `err=${errN6.toExponential(2)}`);
}

console.log('');
console.log(`Loop 9 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
