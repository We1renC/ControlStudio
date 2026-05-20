#!/usr/bin/env node
/**
 * benchmark.mjs — Performance Baseline for Control Studio Core Functions
 *
 * Measures wall-clock time for key computationally intensive operations.
 * Run after significant changes to detect performance regressions.
 * Exit 0 always (results are informational only).
 *
 * Usage:  node scripts/benchmark.mjs [--json]
 */

import { solveCareHamiltonianSchur } from '../js/control/state-feedback.js';
import { synthesizeHinfRiccati }      from '../js/control/hinf_riccati.js';
import { defaultMixedSensitivityWeights } from '../js/control/hinf_synth.js';
import { identifyBJ }                  from '../js/control/sysid.js';
import { nsga2TunePID }                from '../js/control/ga_tuner.js';
import { balancedTruncation }          from '../js/control/model_reduction.js';
import { autoModelOrder }              from '../js/control/sysid.js';
import { TransferFunction }            from '../js/control/transfer-function.js';
import { setSeed, randn }              from '../js/math/rng.js';
import { generatePRBS }               from '../js/control/sysid_signals.js';

const JSON_MODE = process.argv.includes('--json');
const results   = [];

function bench(label, fn, warmup = 1, reps = 3) {
  for (let i = 0; i < warmup; i++) { try { fn(); } catch {} }
  const times = [];
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    try { fn(); } catch {}
    times.push(performance.now() - t0);
  }
  const median = [...times].sort((a, b) => a - b)[Math.floor(reps / 2)];
  const min    = Math.min(...times);
  results.push({ label, medianMs: +median.toFixed(2), minMs: +min.toFixed(2), reps });
  if (!JSON_MODE) {
    const bar = '█'.repeat(Math.min(40, Math.round(median / 5)));
    console.log(`  ${label.padEnd(48)} ${median.toFixed(1).padStart(7)}ms  ${bar}`);
  }
}

// ── Helper: build n×n double-integrator chain ────────────────────────────────
function buildIntegratorChain(n) {
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (j === i + 1 ? 1 : 0))
  );
  const B = Array.from({ length: n }, (_, i) => [i === n - 1 ? 1 : 0]);
  const Q = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  const R = [[1]];
  return { A, B, Q, R };
}

if (!JSON_MODE) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Control Studio — Performance Benchmark              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('  ' + 'Function'.padEnd(48) + 'Median'.padStart(8) + '  (bar = 5ms/block)\n');
}

// ── CARE / LQR ───────────────────────────────────────────────────────────────
if (!JSON_MODE) console.log('▶ CARE / LQR');

for (const n of [5, 10, 20]) {
  const { A, B, Q, R } = buildIntegratorChain(n);
  bench(`CARE n=${n} (Hamiltonian-Schur)`, () => solveCareHamiltonianSchur(A, B, Q, R));
}

// ── SysID ────────────────────────────────────────────────────────────────────
if (!JSON_MODE) console.log('\n▶ SysID');

setSeed(99);
for (const N of [500, 1000]) {
  const u = generatePRBS(N, 8, 1.0);
  const y = (() => {
    const arr = new Array(N).fill(0);
    for (let k = 2; k < N; k++) arr[k] = 0.7 * arr[k-1] - 0.12 * arr[k-2] + 0.4 * u[k-1] + 0.2 * randn();
    return arr;
  })();
  bench(`identifyBJ(nb=2,nf=2,nc=1,nd=1, N=${N})`, () =>
    identifyBJ(u, y, 2, 2, 1, 1, 1, 1.0, { maxIter: 10 })
  );
}

setSeed(77);
{
  const N = 400;
  const u = generatePRBS(N, 7, 1.0);
  const y = (() => {
    const arr = new Array(N).fill(0);
    for (let k = 1; k < N; k++) arr[k] = 0.7 * arr[k-1] + 0.4 * u[k-1] + 0.1 * randn();
    return arr;
  })();
  bench('autoModelOrder([ARX,ARMAX], AICc, N=400', () =>
    autoModelOrder(u, y, { structures: ['ARX', 'ARMAX'], criterion: 'AICc',
      maxNa: 3, maxNb: 3, maxNc: 2, crossValidate: false })
  );
}

// ── H∞ Synthesis ─────────────────────────────────────────────────────────────
if (!JSON_MODE) console.log('\n▶ H∞ Synthesis');

{
  const G1 = new TransferFunction([1], [1, 1]);
  const w1  = defaultMixedSensitivityWeights({ wB: 1, M: 2, Alow: 0.01, controlPenalty: 0.1 });
  bench('synthesizeHinfRiccati 1st-order (gammaTol=0.05)', () =>
    synthesizeHinfRiccati(G1, w1, { gammaHi: 100, gammaTol: 0.05 })
  );

  const G2 = new TransferFunction([1], [1, 2, 1]);
  const w2  = defaultMixedSensitivityWeights({ wB: 0.5, M: 2, Alow: 0.01, controlPenalty: 0.1 });
  bench('synthesizeHinfRiccati 2nd-order (gammaTol=0.1)', () =>
    synthesizeHinfRiccati(G2, w2, { gammaHi: 100, gammaTol: 0.1 })
  );
}

// ── NSGA-II ──────────────────────────────────────────────────────────────────
if (!JSON_MODE) console.log('\n▶ NSGA-II PID Tuning');

{
  const plant = new TransferFunction([1], [1, 0.4, 1]);
  for (const [pop, gen] of [[20, 10], [40, 20], [80, 30]]) {
    setSeed(42);
    bench(`NSGA-II pop=${pop} gen=${gen}`, () =>
      nsga2TunePID(plant, { populationSize: pop, generations: gen })
    );
  }
}

// ── Model Reduction ──────────────────────────────────────────────────────────
if (!JSON_MODE) console.log('\n▶ Model Order Reduction');

{
  // Build n-state stable system
  function buildStableSS(n) {
    const A = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => i === j ? -(i + 1) : 0)
    );
    const B = Array.from({ length: n }, () => [1]);
    const C = [Array.from({ length: n }, (_, i) => 1 / (i + 1))];
    const D = [[0]];
    return { A, B, C, D };
  }
  for (const n of [5, 8]) {
    const { A, B, C, D } = buildStableSS(n);
    bench(`balancedTruncation n=${n} → order=${Math.floor(n/2)}`, () =>
      balancedTruncation(A, B, C, D, Math.floor(n / 2))
    );
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

if (JSON_MODE) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
} else {
  const total = results.reduce((s, r) => s + r.medianMs, 0);
  console.log('\n' + '─'.repeat(64));
  console.log(`  ${results.length} benchmarks completed  |  total: ${total.toFixed(0)}ms`);
  console.log('─'.repeat(64));

  // Flag regressions vs simple thresholds
  const THRESHOLDS = {
    'CARE n=5':  200, 'CARE n=10': 500, 'CARE n=20': 2000,
    'identifyBJ': 500, 'autoModelOrder': 1000,
    'synthesizeHinfRiccati': 2000,
    'NSGA-II pop=20': 500, 'NSGA-II pop=80': 3000,
    'balancedTruncation': 300,
  };
  let regressions = 0;
  for (const r of results) {
    const key = Object.keys(THRESHOLDS).find(k => r.label.includes(k.split(' ')[0]) &&
      r.label.includes(k.split(' ')[1] ?? ''));
    if (key && r.medianMs > THRESHOLDS[key]) {
      console.log(`  ⚠  SLOW: ${r.label} (${r.medianMs}ms > threshold ${THRESHOLDS[key]}ms)`);
      regressions++;
    }
  }
  if (regressions === 0) console.log('  ✓  All within expected performance thresholds.');
  console.log('');
}
