#!/usr/bin/env node

import {
  applyUncertaintySample,
  monteCarloRobustValidation,
  sampleUncertaintyModel,
  validateUncertaintyModel,
} from '../js/control/robust.js';
import { TransferFunction } from '../js/control/transfer-function.js';

let failed = 0;

function ok(label, cond, info = '') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${info ? ': ' + info : ''}`);
  if (!cond) failed++;
}

function near(label, actual, expected, tol = 1e-9) {
  ok(label, Math.abs(actual - expected) <= tol, `actual=${actual}, expected=${expected}, tol=${tol}`);
}

console.log('\n=== Phase 18: uncertainty schema ===\n');
{
  const G = new TransferFunction([1], [1, 3, 2]);
  const model = validateUncertaintyModel({
    gain: 0.2,
    numerator: [0.1],
    denominator: [0, [-0.1, 0.1], 0.25],
    additive: { radius: 0.05 },
    multiplicative: { gainSpread: 0.1, phaseDeg: 5 },
  }, G);
  near('gain spread lower bound', model.gain[0], 0.8);
  near('gain spread upper bound', model.gain[1], 1.2);
  near('denominator explicit lower bound', model.denominator[1][0], -0.1);
  near('additive radius', model.additive.radius, 0.05);
  near('multiplicative gain upper bound', model.multiplicative.gain[1], 1.1);
}

console.log('\n=== Phase 18: deterministic sampling and replay ===\n');
{
  const G = new TransferFunction([1], [1, 3, 2]);
  const uncertainty = { gain: 0.2, denominator: [0, 0.1, 0.2], multiplicative: { gainSpread: 0.05, phaseDeg: 10 } };
  const a = sampleUncertaintyModel(uncertainty, { nominalTf: G, seed: 42, sampleCount: 4 });
  const b = sampleUncertaintyModel(uncertainty, { nominalTf: G, seed: 42, sampleCount: 4 });
  ok('sample count matches', a.samples.length === 4);
  ok('same seed yields identical sample JSON', JSON.stringify(a.samples) === JSON.stringify(b.samples));
  const perturbed = applyUncertaintySample(G, a.samples[0]);
  ok('perturbed TF remains normalized', Math.abs(perturbed.den[0] - 1) < 1e-12);
  ok('perturbed DC gain is finite', Number.isFinite(perturbed.dcGain()));
}

console.log('\n=== Phase 18: Monte Carlo worst-case and pass/fail ===\n');
{
  const G = new TransferFunction([1], [1, 3, 2]);
  const result = monteCarloRobustValidation(G, {
    gain: 0.3,
    denominator: [0, 0.4, 0.4],
    additive: { radius: 0.02 },
  }, {
    seed: 7,
    sampleCount: 12,
    responseSampleCount: 600,
    specs: {
      maxOvershoot: 1,
      maxSettlingTime: 7,
      minPhaseMargin: 60,
      maxPeakSensitivity: 1.7,
    },
  });
  ok('result is reproducible', JSON.stringify(result.results.map((r) => r.sample)) === JSON.stringify(monteCarloRobustValidation(G, {
    gain: 0.3,
    denominator: [0, 0.4, 0.4],
    additive: { radius: 0.02 },
  }, { seed: 7, sampleCount: 12 }).results.map((r) => r.sample)));
  ok('worst case is present', !!result.worstCase);
  ok('worst case includes stable boolean', typeof result.worstCase.metrics.stable === 'boolean');
  ok('all samples have pass/fail checks', result.results.every((r) => Array.isArray(r.passFail.checks) && r.passFail.checks.length >= 4));
  ok('strict specs can fail uncertainty family', result.failureCount > 0, `failureCount=${result.failureCount}`);
}

console.log('\n=== Phase 18: unstable sample classification ===\n');
{
  const G = new TransferFunction([1], [1, 1, 1]);
  const result = monteCarloRobustValidation(G, {
    denominator: [0, [-2.5, -2.0], 0],
  }, {
    seed: 3,
    sampleCount: 5,
    specs: { maxSettlingTime: 20 },
  });
  ok('at least one sample is unstable', result.results.some((r) => !r.metrics.stable));
  ok('unstable family does not pass', result.pass === false);
}

console.log('');
if (failed === 0) console.log('Phase 18 robust validation: all checks passed');
else {
  console.log(`Phase 18 robust validation: ${failed} FAILED`);
  process.exitCode = 1;
}
