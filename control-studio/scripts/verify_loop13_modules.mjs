#!/usr/bin/env node
/**
 * verify_loop13_modules.mjs — Zero-Flaw Loop 13 verification:
 *   - Polytopic quadratic stability LMI (Bernussou-Geromel-Peres)
 *   - Loewner data-driven model reduction (Mayo-Antoulas)
 *   - L1 adaptive control (Hovakimyan-Cao)
 */

import { polytopicQuadraticStability } from '../js/verification/polytopic_stability.js';
import { buildLoewnerMatrices, loewnerReduction } from '../js/identification/loewner_reduction.js';
import { simulateL1Adaptive } from '../js/control/l1_adaptive.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── Polytopic stability: both vertex matrices Hurwitz, common P exists ────
{
  const A1 = [[-1, 1], [0, -2]];
  const A2 = [[-2, 0], [1, -1]];
  const r = polytopicQuadraticStability([A1, A2]);
  ok('polytopic: common P found for stable vertices', r.stable,
     `residual=${r.residual.toExponential(2)}`);
  ok('polytopic: P[0][0] > 0', r.P[0][0] > 0, `P[0][0]=${r.P[0][0].toFixed(3)}`);
}

// ── Polytopic stability: vertex with eigenvalue at 0 fails ────────────────
{
  const A1 = [[-1, 0], [0, -2]];
  const A2 = [[0, 1], [-1, 0]];        // pure rotation, eigenvalues ±j
  const r = polytopicQuadraticStability([A1, A2]);
  ok('polytopic: rejects marginally stable vertex', !r.stable,
     `residual=${r.residual.toExponential(2)}`);
}

// ── Loewner: build Loewner matrices from synthetic samples ─────────────────
{
  // True plant G(s) = 2 / (s + 1)(s + 3). Sample at several ω points.
  const omegas = [0.1, 0.3, 1, 3, 10, 30];
  const G = (omega) => {
    // (s+1)(s+3) = s² + 4s + 3 → at s = jω: (3 − ω²) + j 4ω
    const reD = 3 - omega * omega;
    const imD = 4 * omega;
    const mag = reD * reD + imD * imD;
    return { re: 2 * reD / mag, im: -2 * imD / mag };
  };
  const samples = omegas.map((w) => ({ omega: w, G: G(w) }));
  const { L, sigmaL } = buildLoewnerMatrices(samples);
  ok('Loewner: L is 3×3 (half/half split)', L.length === 3 && L[0].length === 3);
  ok('Loewner: σL is 3×3', sigmaL.length === 3 && sigmaL[0].length === 3);
  ok('Loewner: L is non-zero', L.flat().some((v) => Math.abs(v) > 1e-6));

  const reduced = loewnerReduction(samples, 2);
  ok('Loewner reduction: order 2 produces 2×2 matrices',
     reduced.E.length === 2 && reduced.A.length === 2);
  ok('Loewner reduction: B has 2 rows, 1 column', reduced.B.length === 2 && reduced.B[0].length === 1);
  ok('Loewner reduction: singular values descending',
     reduced.singularValues.every((v, i) => i === 0 || v <= reduced.singularValues[i - 1] + 1e-9),
     `sv=${reduced.singularValues.map((v) => v.toExponential(2)).join(',')}`);
}

// ── L1 adaptive: track step under unknown disturbance ─────────────────────
{
  // Plant: ẋ = -x + u + sigma_true (a=-1 known, b=1 known, sigma=2 unknown)
  const Ts = 1e-3;
  const T = 3.0;
  const N = Math.round(T / Ts);
  const ref = new Array(N).fill(1.0);
  const result = simulateL1Adaptive(
    { a: -1, b: 1, sigma: () => 2.0 },
    ref,
    { Ts, am: -5, Gamma: 50000, omegaC: 50, Q: 1, x0: 0, xHat0: 0, sigmaHat0: 0 },
  );
  const xFinal = result.x[N - 1];
  ok('L1: state tracks reference within 0.2 by 3 s',
     Math.abs(xFinal - 1.0) < 0.2, `x_T=${xFinal.toFixed(4)}`);
  // L1 estimates the LUMPED uncertainty σ_tot = (a − a_m) x + σ_true.
  // At steady state x → 1, so σ_tot ≈ (-1 − (-5)) · 1 + 2 = 6.
  ok('L1: σ̂ converges to lumped uncertainty σ_tot ≈ 6 (within 5%)',
     Math.abs(result.sigmaHat[N - 1] - 6.0) < 0.3,
     `σ̂_T=${result.sigmaHat[N - 1].toFixed(3)} (lumped σ_tot=6.0)`);
  ok('L1: control signal bounded (no chattering)',
     Math.max(...result.u.map(Math.abs)) < 30);
}

console.log('');
console.log(`Loop 13 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
