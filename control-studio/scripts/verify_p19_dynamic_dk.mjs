#!/usr/bin/env node
/**
 * verify_p19_dynamic_dk.mjs — Phase 19-03: dynamic D-K iteration baseline.
 *
 * Tests:
 *   1. fitDynamicDScaling returns compact log-linear D(jw) model.
 *   2. evaluateDynamicDScaling interpolates in log-frequency / log-D space.
 *   3. computeDynamicMuBoundFreq warm-starts and returns fitted D profile.
 *   4. fitted D profile tracks optimized D profile within bounded RMS error.
 *   5. dynamic D upper-bound is no worse than unscaled sigma profile.
 *   6. dkIterationDynamic returns controller, dynamicD, histories, method.
 */

import {
  computeDynamicMuBoundFreq,
  computeMuBoundFreq,
  dkIterationDynamic,
  evaluateDynamicDScaling,
  fitDynamicDScaling,
} from '../js/control/dk_iteration.js';

let passed = 0;
let failed = 0;

function ok(msg, cond, detail = '') {
  if (cond) {
    console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`);
    failed++;
  }
}

function close(a, b, tol = 1e-8) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
}

console.log('\n=== Phase 19-03: Dynamic D-K Iteration Baseline ===\n');

// ── Test 1: dynamic D fit shape ─────────────────────────────────────────────
{
  const omegas = [0.1, 1, 10, 100];
  const dProfile = [
    [0.5, 2.0],
    [0.75, 1.6],
    [1.5, 0.8],
    [2.0, 0.5],
  ];
  const fit = fitDynamicDScaling(omegas, dProfile, { nodes: 4 });
  ok('Test 1: dynamic D fit has expected method', fit.method === 'dynamic-d-log-linear-fit');
  ok('Test 1: dynamic D fit preserves channel count', fit.channels === 2);
  ok('Test 1: dynamic D fit keeps requested nodes', fit.nodes.length === 4);
  ok('Test 1: dynamic D fit RMS is finite', Number.isFinite(fit.fitErrorRms));
}

// ── Test 2: log-log interpolation ───────────────────────────────────────────
{
  const fit = fitDynamicDScaling(
    [1, 100],
    [[1, 4], [100, 1]],
    { nodes: 2 },
  );
  const d10 = evaluateDynamicDScaling(fit, 10);
  // Geometric midpoint: sqrt(1*100)=10, sqrt(4*1)=2
  ok('Test 2: channel 1 interpolates geometrically', close(d10[0], 10, 1e-6), `d=${d10[0]}`);
  ok('Test 2: channel 2 interpolates geometrically', close(d10[1], 2, 1e-6), `d=${d10[1]}`);
}

// ── Tests 3-5: dynamic mu profile ───────────────────────────────────────────
{
  const omegas = [0.1, 0.3, 1, 3, 10, 30];
  // Frequency-dependent off-diagonal matrix. D-scaling should reduce the
  // conservative sigma bound around the asymmetric mid-band region.
  const Mfr = (w) => {
    const a = 0.8 + 3 / (1 + w);
    const b = 0.25 + w / (2 + w);
    return [[0, a], [b, 0]];
  };

  const dynamic = computeDynamicMuBoundFreq(Mfr, omegas, { maxIter: 250, lr: 0.08, nodes: 4 });
  const unscaled = computeMuBoundFreq(Mfr, omegas, { maxIter: 1, lr: 0, d0: [1, 1] });

  ok('Test 3: dynamic mu profile length matches frequency grid',
    dynamic.muProfile.length === omegas.length && dynamic.dProfile.length === omegas.length);
  ok('Test 3: dynamicD model returned', dynamic.dynamicD?.method === 'dynamic-d-log-linear-fit');
  ok('Test 4: fitted D profile tracks optimized D profile',
    dynamic.dynamicD.fitErrorRms < 0.75,
    `fitErrorRms=${dynamic.dynamicD.fitErrorRms.toFixed(4)}`);

  ok('Test 5: optimized dynamic D peak is no worse than unscaled peak',
    dynamic.peakMu <= unscaled.peakMu + 1e-6,
    `dynamicPeak=${dynamic.peakMu.toFixed(4)}, unscaledPeak=${unscaled.peakMu.toFixed(4)}`);
}

// ── Test 6: dynamic D-K wrapper ─────────────────────────────────────────────
{
  const plantSS = {
    A: [[-2, -2], [1, 0]],
    B: [[1], [0]],
    C: [[0, 1]],
    D: [[0]],
  };
  const r = dkIterationDynamic(plantSS, {
    maxIter: 3,
    omegas: [0.1, 0.5, 1, 5, 20],
    nodes: 3,
  });

  ok('Test 6: dynamic D-K returns controller and dynamicD',
    r.K !== null && r.dynamicD?.type === 'log-linear-d-scaling');
  ok('Test 6: dynamic D-K histories are populated',
    r.muHistory.length > 0 && r.gammaHistory.length > 0 && r.fitErrorHistory.length > 0);
  ok('Test 6: dynamic D-K mu bound finite positive',
    Number.isFinite(r.muBound) && r.muBound > 0,
    `mu=${r.muBound.toFixed(4)}`);
  ok('Test 6: method = dynamic-dk-iteration', r.method === 'dynamic-dk-iteration');
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`Phase 19-03 dynamic D-K: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
