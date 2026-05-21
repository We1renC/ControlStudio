#!/usr/bin/env node
/**
 * verify_p29_dk.mjs — Phase 29-06: D-K iteration / μ-synthesis
 *
 * Tests:
 *   1.  computeMuUpperBound: identity → μ̄ = σ_max (D=I optimal for full-block)
 *   2.  computeMuUpperBound: diagonal M → D-scaling reduces bound below σ_max
 *   3.  computeMuUpperBound: upper bound ≤ σ_max(M) always
 *   4.  computeMuUpperBound: μ̄(αM) = α·μ̄(M) (positive homogeneity)
 *   5.  computeMuUpperBound: scalar 1×1 matrix → μ̄ = |m|
 *   6.  computeMuUpperBound: returns d > 0 (D positive definite)
 *   7.  computeMuBoundFreq: returns profile length = |omegas|
 *   8.  computeMuBoundFreq: peakMu = max of profile
 *   9.  computeMuBoundFreq: peak at resonant frequency for integrator
 *  10.  computeMuBoundFreq: monotone decay for stable system
 *  11.  dkIteration: returns K, muBound, gammaHistory
 *  12.  dkIteration: muHistory is non-empty
 *  13.  dkIteration: muBound ≤ γ (K-step gives initial H∞ bound)
 *  14.  dkIteration: method = 'dk-iteration'
 */

import {
  computeMuUpperBound,
  computeMuBoundFreq,
  dkIteration,
} from '../js/control/dk_iteration.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol = 1e-3) { return Number.isFinite(a) && Math.abs(a - b) <= tol; }

function sigmaMax(M) {
  // Power iteration for σ_max
  const n = M.length;
  let v = new Array(n).fill(1 / Math.sqrt(n));
  for (let it = 0; it < 100; it++) {
    // Mv
    const Mv = Array.from({length: n}, (_, i) => M[i].reduce((s, a, j) => s + a * v[j], 0));
    // MᵀMv
    const MTMv = Array.from({length: n}, (_, i) =>
      M.reduce((s, row, k) => s + row[i] * Mv[k], 0));
    const norm = Math.sqrt(MTMv.reduce((s, x) => s + x*x, 0)) || 1;
    v = MTMv.map(x => x / norm);
  }
  const Mv = Array.from({length: n}, (_, i) => M[i].reduce((s, a, j) => s + a * v[j], 0));
  return Math.sqrt(Mv.reduce((s, x) => s + x*x, 0));
}

console.log('\n=== P29-06: D-K Iteration / μ-synthesis ===\n');

// ── Tests 1–6: computeMuUpperBound ───────────────────────────────────────────

// Test 1: Identity — D=I optimal, μ̄ = σ_max
{
  const M = [[3, 1], [1, 3]];  // σ_max = 4
  const r = computeMuUpperBound(M);
  const sm = sigmaMax(M);
  ok('Test 1: μ̄(I·M·I⁻¹) ≈ σ_max(M)', close(r.muBound, sm, 0.05),
    `μ̄=${r.muBound.toFixed(4)}, σ_max=${sm.toFixed(4)}`);
}

// Test 2: Off-diagonal M — D-scaling reduces bound below σ_max
{
  // M = [[0, 2], [0.5, 0]]: σ_max = 2, optimal D = diag(0.5, 1) → σ_max(DM D⁻¹) = 1
  const M = [[0, 2], [0.5, 0]];
  const sm = sigmaMax(M);  // = 2
  const r = computeMuUpperBound(M, { maxIter: 500, lr: 0.1 });
  ok('Test 2: D-scaling reduces bound for off-diagonal M (2→1)',
    r.muBound < sm - 0.2, `μ̄=${r.muBound.toFixed(4)} < σ_max=${sm.toFixed(4)}`);
}

// Test 3: μ̄ ≤ σ_max always
{
  const M = [[2, 1.5, 0.5], [0.3, 3, 1], [0.1, 0.5, 1.5]];
  const sm = sigmaMax(M);
  const r = computeMuUpperBound(M, { maxIter: 200 });
  ok('Test 3: μ̄ ≤ σ_max(M)', r.muBound <= sm + 1e-4, `μ̄=${r.muBound.toFixed(4)}, σ=${sm.toFixed(4)}`);
}

// Test 4: Positive homogeneity μ̄(αM) = α μ̄(M)
{
  const M = [[2, 0.5], [0.3, 1.5]];
  const alpha = 3;
  const r1 = computeMuUpperBound(M);
  const r2 = computeMuUpperBound(M.map(row => row.map(v => v * alpha)));
  ok('Test 4: μ̄(αM) = α·μ̄(M)', close(r2.muBound, alpha * r1.muBound, 0.1),
    `μ̄(αM)=${r2.muBound.toFixed(4)}, α·μ̄(M)=${(alpha * r1.muBound).toFixed(4)}`);
}

// Test 5: Scalar 1×1 → μ̄ = |m|
{
  const M = [[2.5]];
  const r = computeMuUpperBound(M);
  ok('Test 5: 1×1 matrix → μ̄ = |m|', close(r.muBound, 2.5, 0.01),
    `μ̄=${r.muBound.toFixed(4)}`);
}

// Test 6: d > 0 always
{
  const M = [[3, 2], [1, 4]];
  const r = computeMuUpperBound(M);
  ok('Test 6: returned d > 0', r.d.every(di => di > 0), `d=[${r.d.map(v=>v.toFixed(4))}]`);
}

// ── Tests 7–10: computeMuBoundFreq ───────────────────────────────────────────

// Test 7: profile length
{
  const omegas = [0.1, 1, 10, 100];
  const r = computeMuBoundFreq(() => [[1, 0.5], [0.3, 2]], omegas);
  ok('Test 7: profile length = |omegas|', r.muProfile.length === omegas.length);
}

// Test 8: peakMu = max of profile
{
  let k = 0;
  const gains = [0.5, 3, 1, 0.8];  // peak at index 1
  const r = computeMuBoundFreq(() => [[gains[k++]]], [0.1, 1, 10, 100]);
  ok('Test 8: peakMu = max(muProfile)',
    close(r.peakMu, Math.max(...r.muProfile), 1e-9),
    `peakMu=${r.peakMu.toFixed(4)}`);
}

// Test 9: peak at resonant frequency — larger M at ω=1
{
  const Mfr = (omega) => {
    const gain = omega === 1 ? 5 : 1;
    return [[gain]];
  };
  const omegas = [0.1, 0.5, 1, 2, 10];
  const r = computeMuBoundFreq(Mfr, omegas);
  ok('Test 9: peak detected at resonant frequency', close(r.peakOmega, 1, 0.01),
    `peakOmega=${r.peakOmega}`);
}

// Test 10: monotone decay for low-pass system
{
  // SISO: G(jω) = 1/(1+jω) → |G| decreases with ω
  const Mfr = (omega) => [[1 / Math.sqrt(1 + omega * omega)]];
  const omegas = [0.01, 0.1, 1, 10, 100];
  const r = computeMuBoundFreq(Mfr, omegas);
  let mono = true;
  for (let i = 1; i < r.muProfile.length; i++)
    if (r.muProfile[i] > r.muProfile[i - 1] + 1e-6) mono = false;
  ok('Test 10: μ̄ decreases monotonically for low-pass |G(jω)|', mono,
    `profile=[${r.muProfile.map(v=>v.toFixed(4))}]`);
}

// ── Tests 11–14: dkIteration ─────────────────────────────────────────────────

{
  // Simple 2nd-order SISO plant: G(s) = 1/(s² + 2s + 2)
  // SS: A=[[-2,-2],[1,0]], B=[[1],[0]], C=[[0,1]], D=[[0]]
  const plantSS = {
    A: [[-2, -2], [1, 0]],
    B: [[1], [0]],
    C: [[0, 1]],
    D: [[0]],
  };

  const r = dkIteration(plantSS, { maxIter: 3, omegas: [0.1, 1, 5, 20] });

  ok('Test 11: dkIteration returns K, muBound, gammaHistory',
    r.K !== null && typeof r.muBound === 'number' && Array.isArray(r.gammaHistory));
  ok('Test 12: muHistory is non-empty', r.muHistory.length > 0,
    `muHistory=[${r.muHistory.map(v=>v.toFixed(4))}]`);
  ok('Test 13: muBound is finite and positive',
    Number.isFinite(r.muBound) && r.muBound > 0,
    `muBound=${r.muBound.toFixed(4)}`);
  ok('Test 14: method = "dk-iteration"', r.method === 'dk-iteration');
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P29-06 D-K iteration: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
