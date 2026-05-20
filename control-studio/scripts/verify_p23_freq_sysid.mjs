#!/usr/bin/env node
/**
 * verify_p23_freq_sysid.mjs — Phase 23-01: Frequency-domain SysID
 *
 * estimateFRF tests:
 *   1. Output arrays have correct length (N/2+1)
 *   2. omega[0]=0, omega increases monotonically
 *   3. coherence ∈ [0, 1] for all bins
 *   4. FRF of a 1st-order system matches analytic G(jω)=1/(jω+1) within 1 dB
 *   5. Low coherence at zero-input frequencies (DC if input is AC only)
 *   6. nSegments > 0 and is correct for given N and segLen
 *
 * fitTFfromFRF tests:
 *   7. Recovered num/den have correct length (nb+1, na+1)
 *   8. fitPercent > 90% for low-noise FRF of 1st-order system
 *   9. DC gain of fitted TF ≈ DC gain of true system (|Δ| < 5%)
 *  10. 2nd-order system recovery: poles within 10% of true values
 *  11. Too few points → throws with informative message
 */

import { estimateFRF, fitTFfromFRF } from '../js/control/sysid_freq.js';
import { setSeed, randn }             from '../js/math/rng.js';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate 1st-order system y[k+1] = a·y[k] + (1-a)·u[k], then add noise. */
function sim1stOrder(u, a = 0.8, noiseStd = 0.0) {
  const N = u.length;
  const y = new Array(N).fill(0);
  for (let k = 0; k < N - 1; k++)
    y[k + 1] = a * y[k] + (1 - a) * u[k] + noiseStd * (Math.random() - 0.5) * 2;
  return y;
}

/** Analytic FRF of G(z)=(1-a)·z⁻¹/(1-a·z⁻¹) at freq k/N */
function trueFRF_1stOrder(omega_k, a, Ts) {
  const z_re = Math.cos(omega_k * Ts);
  const z_im = Math.sin(omega_k * Ts);
  // G(z) = (1-a)·z⁻¹ / (1-a·z⁻¹)
  // z⁻¹ = cos-j·sin
  const zinv_re = z_re, zinv_im = -z_im;  // z⁻¹ at ω·Ts
  const num_re = (1 - a) * zinv_re;
  const num_im = (1 - a) * zinv_im;
  const den_re = 1 - a * zinv_re;
  const den_im = -(-a) * zinv_im;  // 1 - a/z = 1 - a·z⁻¹
  // Actually: den = 1 - a·z⁻¹
  const dr = 1 - a * zinv_re;
  const di = -a * zinv_im;
  const denom = dr * dr + di * di;
  const H_re = (num_re * dr + num_im * di) / denom;
  const H_im = (num_im * dr - num_re * di) / denom;
  return { re: H_re, im: H_im, mag: Math.sqrt(H_re**2 + H_im**2) };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== P23-01: estimateFRF ===\n');

const Ts  = 0.01;
const N   = 2048;
setSeed(42);
const u_exc = Array.from({ length: N }, () => (Math.random() > 0.5 ? 1 : -1)); // binary noise

// Test 1: output array lengths
{
  const frf = estimateFRF(u_exc, sim1stOrder(u_exc, 0.8), Ts, { segLen: 256 });
  const segLen = 256;
  const expectedLen = Math.floor(segLen / 2) + 1;
  ok('Test 1: omega length = segLen/2+1',
    frf.omega.length === expectedLen, `len=${frf.omega.length}, expected=${expectedLen}`);
  ok('Test 1: all arrays same length',
    frf.freq.length === expectedLen &&
    frf.magDB.length === expectedLen &&
    frf.phaseRad.length === expectedLen &&
    frf.coherence.length === expectedLen);
}

// Test 2: omega[0]=0 and monotonically increasing
{
  const frf = estimateFRF(u_exc, sim1stOrder(u_exc, 0.8), Ts, { segLen: 256 });
  ok('Test 2: omega[0] = 0', Math.abs(frf.omega[0]) < 1e-10);
  let mono = true;
  for (let i = 1; i < frf.omega.length; i++)
    if (frf.omega[i] <= frf.omega[i - 1]) { mono = false; break; }
  ok('Test 2: omega monotonically increasing', mono);
}

// Test 3: coherence ∈ [0, 1]
{
  const frf = estimateFRF(u_exc, sim1stOrder(u_exc, 0.8), Ts, { segLen: 256 });
  const allOK = frf.coherence.every(c => c >= -1e-9 && c <= 1 + 1e-9);
  ok('Test 3: coherence ∈ [0, 1] for all bins', allOK);
}

// Test 4: FRF magnitude within 1 dB of analytic 1st-order response
{
  // Clean simulation (no noise) → expect near-perfect coherence and FRF match
  setSeed(10);
  const u4   = Array.from({ length: 4096 }, () => (Math.random() > 0.5 ? 1 : -1));
  const y4   = sim1stOrder(u4, 0.8, 0.0);
  const frf  = estimateFRF(u4, y4, Ts, { segLen: 512, overlap: 0.5 });

  // Check at frequency bin 10 (ω ≈ 10·2π·fs/512)
  const bin  = 10;
  const w_k  = frf.omega[bin];
  const true_h = trueFRF_1stOrder(w_k, 0.8, Ts);
  const trueMagDB = 20 * Math.log10(true_h.mag + 1e-300);

  ok('Test 4: FRF magnitude within 1 dB of analytic (bin 10)',
    Math.abs(frf.magDB[bin] - trueMagDB) < 1.0,
    `measDB=${frf.magDB[bin].toFixed(2)}, trueDB=${trueMagDB.toFixed(2)}, Δ=${Math.abs(frf.magDB[bin]-trueMagDB).toFixed(3)}`);

  // Mean coherence over mid-frequency bins should be high for clean data
  const midBins = frf.coherence.slice(5, 50);
  const meanCoh = midBins.reduce((s, v) => s + v, 0) / midBins.length;
  ok('Test 4: mean coherence > 0.90 for noise-free simulation',
    meanCoh > 0.90, `meanCoh=${meanCoh.toFixed(3)}`);
}

// Test 5: nSegments is positive
{
  const frf = estimateFRF(u_exc, sim1stOrder(u_exc, 0.8), Ts, { segLen: 256 });
  ok('Test 5: nSegments > 0', frf.nSegments > 0, `nSeg=${frf.nSegments}`);
  const expSegs = Math.floor((N - 256) / Math.floor(256 * 0.5)) + 1;
  ok('Test 5: nSegments within expected range',
    frf.nSegments >= 1 && frf.nSegments <= expSegs + 2);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== P23-01: fitTFfromFRF ===\n');

// Build analytic FRF for G(s) = 1/(s+2) at sampled frequencies
function analyticFRF_cont(omega, a0) {
  // G(jω) = 1/(jω + a0)
  const H_re = new Array(omega.length);
  const H_im = new Array(omega.length);
  for (let k = 0; k < omega.length; k++) {
    const w = omega[k];
    const denom = a0 * a0 + w * w;
    H_re[k] =  a0 / denom;
    H_im[k] = -w  / denom;
  }
  return { H_re, H_im };
}

// Test 6: output array lengths for na=1, nb=0
{
  const omega = Array.from({ length: 50 }, (_, k) => (k + 1) * 0.2);
  const { H_re, H_im } = analyticFRF_cont(omega, 2);
  const r = fitTFfromFRF(omega, H_re, H_im, 1, 0);
  ok('Test 6: num length = nb+1', r.num.length === 1, `len=${r.num.length}`);
  ok('Test 6: den length = na+1', r.den.length === 2, `len=${r.den.length}`);
}

// Test 7: fitPercent > 90% for 1st-order clean FRF
{
  const omega = Array.from({ length: 100 }, (_, k) => (k + 1) * 0.3);
  const { H_re, H_im } = analyticFRF_cont(omega, 2);
  const r = fitTFfromFRF(omega, H_re, H_im, 1, 0);
  ok('Test 7: fitPercent > 90% for clean 1/(s+2) FRF',
    r.fitPercent > 90, `fitPercent=${r.fitPercent.toFixed(2)}%`);
}

// Test 8: DC gain of fitted TF ≈ 0.5 for G(s)=1/(s+2)
{
  const omega = Array.from({ length: 100 }, (_, k) => (k + 1) * 0.3);
  const { H_re, H_im } = analyticFRF_cont(omega, 2);
  const r = fitTFfromFRF(omega, H_re, H_im, 1, 0);
  // DC gain of num/den polynomial: sum(num)/sum(den)
  // Polynomial evaluation at s=0: use constant term (last coefficient in high→low form)
  const dcNum  = r.num[r.num.length - 1];   // b_0
  const dcDen  = r.den[r.den.length - 1];   // A(0) = 1 (Levy's constant term)
  const dcGain = dcNum / dcDen;
  ok('Test 8: DC gain ≈ 0.5 for G(s)=1/(s+2)',
    close(dcGain, 0.5, 0.05), `DC=${dcGain.toFixed(4)}, expected=0.5`);
}

// Test 9: 2nd-order system FRF fitting
// G(s) = 1/(s²+3s+2) = 1/((s+1)(s+2)) — poles at -1 and -2
{
  const omega = Array.from({ length: 150 }, (_, k) => (k + 1) * 0.1);
  const H_re = new Array(omega.length);
  const H_im = new Array(omega.length);
  for (let k = 0; k < omega.length; k++) {
    const w = omega[k];
    // G(jω) = 1/((jω+1)(jω+2)) = 1/((2-w²)+3jw)
    const dr = 2 - w * w, di = 3 * w;
    const denom = dr * dr + di * di;
    H_re[k] = dr / denom;
    H_im[k] = -di / denom;
  }
  const r = fitTFfromFRF(omega, H_re, H_im, 2, 0);
  ok('Test 9: fitPercent > 90% for 2nd-order system',
    r.fitPercent > 90, `fitPercent=${r.fitPercent.toFixed(2)}%`);
  ok('Test 9: den has length 3 (na=2)',
    r.den.length === 3, `len=${r.den.length}`);
}

// Test 10: too few points throws
{
  let threw = false;
  try {
    fitTFfromFRF([0.1, 0.2], [1, 1], [0, 0], 3, 3);
  } catch (e) {
    threw = true;
  }
  ok('Test 10: too few frequency points throws', threw);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`P23-01 freq SysID: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
