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

function seededNoise(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000 - 0.5;
  };
}

function toneSignal(fs, N, tones) {
  return Array.from({ length: N }, (_, n) => tones.reduce(
    (sum, tone) => sum + tone.amplitude * Math.cos(
      2 * Math.PI * tone.frequency * n / fs + (tone.phase ?? 0)
    ),
    0
  ));
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
  const noise = seededNoise(9);
  const x = new Array(N);
  for (let n = 0; n < N; n++) {
    x[n] = Math.cos(2 * Math.PI * 50 * n / fs)
         + 0.8 * Math.cos(2 * Math.PI * 120 * n / fs)
         + 0.05 * noise();
  }
  const res = musicSpectrum(x, fs, 2, { M: 32 });
  ok('MUSIC: returned 2 peaks', res.peaks.length === 2);
  const sortedPeaks = res.peaks.slice().sort((a, b) => a - b);
  ok('MUSIC: lower peak within 5 Hz of 50',
     Math.abs(sortedPeaks[0] - 50) < 5, `peak1=${sortedPeaks[0].toFixed(1)} Hz`);
  ok('MUSIC: upper peak within 5 Hz of 120',
     Math.abs(sortedPeaks[1] - 120) < 5, `peak2=${sortedPeaks[1].toFixed(1)} Hz`);
}

// ── ESPRIT on multi-tone and closely spaced deterministic signals ─────────
{
  const fs = 1000;
  const N = 256;
  const twoTone = toneSignal(fs, N, [
    { frequency: 50, amplitude: 1, phase: 0.3 },
    { frequency: 120, amplitude: 0.8, phase: -0.7 },
  ]);
  const estimated = espritFrequencies(twoTone, fs, 2, { M: 40 });
  ok('ESPRIT: returned one positive frequency per conjugate pair', estimated.length === 2);
  ok('ESPRIT: two-tone frequencies recover 50/120 Hz',
    Math.abs(estimated[0] - 50) < 1e-6 && Math.abs(estimated[1] - 120) < 1e-6,
    `estimated=${estimated.map((f) => f.toFixed(6)).join(',')} Hz`);

  const noise = seededNoise(17);
  const noisyTwoTone = twoTone.map((sample) => sample + 0.04 * noise());
  const noisyEstimated = espritFrequencies(noisyTwoTone, fs, 2, { M: 40 });
  ok('ESPRIT: noisy two-tone estimate remains within 0.1 Hz',
    Math.abs(noisyEstimated[0] - 50) < 0.1 && Math.abs(noisyEstimated[1] - 120) < 0.1,
    `estimated=${noisyEstimated.map((f) => f.toFixed(4)).join(',')} Hz`);

  const closeTone = toneSignal(fs, N, [
    { frequency: 80, amplitude: 1, phase: 0.2 },
    { frequency: 92, amplitude: 0.7, phase: 1.1 },
  ]);
  const closeEstimated = espritFrequencies(closeTone, fs, 2, { M: 48 });
  ok('ESPRIT: resolves deterministic 80/92 Hz close tones',
    Math.abs(closeEstimated[0] - 80) < 1e-5 && Math.abs(closeEstimated[1] - 92) < 1e-5,
    `estimated=${closeEstimated.map((f) => f.toFixed(6)).join(',')} Hz`);

  const threeTone = toneSignal(fs, 320, [
    { frequency: 40, amplitude: 1, phase: 0.1 },
    { frequency: 135, amplitude: 0.7, phase: 0.9 },
    { frequency: 220, amplitude: 0.5, phase: -0.4 },
  ]);
  const threeEstimated = espritFrequencies(threeTone, fs, 3, { M: 48 });
  ok('ESPRIT: three-tone frequencies recover 40/135/220 Hz',
    Math.abs(threeEstimated[0] - 40) < 1e-5
      && Math.abs(threeEstimated[1] - 135) < 1e-5
      && Math.abs(threeEstimated[2] - 220) < 1e-5,
    `estimated=${threeEstimated.map((f) => f.toFixed(6)).join(',')} Hz`);

  let invalidWindowRejected = false;
  try {
    espritFrequencies(twoTone, fs, 2, { M: 4 });
  } catch (error) {
    invalidWindowRejected = /2\*numSources\+1/.test(error.message);
  }
  ok('ESPRIT: rejects rank-deficient subspace window', invalidWindowRejected);
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
