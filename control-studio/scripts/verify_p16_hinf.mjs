#!/usr/bin/env node
import { mixedSensitivityCost, tunePIDForMixedSensitivity, defaultMixedSensitivityWeights } from '../js/control/hinf_synth.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { PIDController } from '../js/control/pid.js';

let failed = 0;
function ok(label, cond, info='') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${info ? ': ' + info : ''}`);
  if (!cond) failed++;
}

console.log('\n=== P16-01: Mixed-sensitivity cost ===\n');
// Plant 1/(s+1), unit P controller K=1 → L = 1/(s+1), S = (s+1)/(s+2), T = 1/(s+2)
{
  const G = new TransferFunction([1], [1, 1]);
  const C = new TransferFunction([1], [1]);
  const L = C.series(G);
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 2 });
  const omegas = Array.from({ length: 60 }, (_, i) => Math.pow(10, -2 + (4 * i) / 59));
  const r = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, L, C, omegas);
  ok('cost is finite', Number.isFinite(r.peak), `peak=${r.peak.toFixed(4)} @ ω=${r.peakOmega.toFixed(3)}`);
  ok('peak is > 0', r.peak > 0);
  ok('magArr length matches', r.magArr.length === omegas.length);
}

console.log('\n=== P16-01: Nelder-Mead PID tuning ===\n');
// Plant 1/(s²+s) — tune PID
{
  const G = new TransferFunction([1], [1, 1, 0]);
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 1.8 });
  const result = tunePIDForMixedSensitivity(G, weights, { maxIter: 60 });
  ok('tuned cost is finite', Number.isFinite(result.cost), `cost=${result.cost.toFixed(4)}`);
  ok('tuned cost < 50 (sane)', result.cost < 50);
  ok('Kp positive', result.Kp > 0, `Kp=${result.Kp.toFixed(3)}`);
  ok('history decreasing', result.history[result.history.length - 1] <= result.history[0]);
  // Compare to a naive K=1 P controller
  const Cnaive = new PIDController(1, 0, 0).toTransferFunction();
  const Lnaive = Cnaive.series(G);
  const omegas = Array.from({ length: 60 }, (_, i) => Math.pow(10, -2 + (4 * i) / 59));
  const baseline = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, Lnaive, Cnaive, omegas).peak;
  ok('tuned cost ≤ naive cost', result.cost <= baseline + 1e-3, `tuned=${result.cost.toFixed(3)} vs naive=${baseline.toFixed(3)}`);
}

console.log('');
if (failed === 0) console.log('P16-01 (H∞ synth): all checks passed');
else { console.log(`P16-01 (H∞ synth): ${failed} FAILED`); process.exitCode = 1; }
