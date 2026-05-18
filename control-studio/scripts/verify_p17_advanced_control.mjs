#!/usr/bin/env node
/**
 * Phase 17 verification:
 * - dynamic/full-order mixed-sensitivity H∞ synthesis path
 * - structured μ upper-bound and D-scaling sweep
 * - MIMO frequency-domain design diagnostics
 * - MIMO output-space MPC setpoint tracking
 */
import {
  defaultMixedSensitivityWeights,
  fullOrderHinfMixedSensitivity,
  mixedSensitivityCost,
} from '../js/control/hinf_synth.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { Complex } from '../js/math/complex.js';
import {
  MIMOStateSpace,
  characteristicLoci,
  gershgorinBands,
  inverseNyquistArray,
} from '../js/control/mimo.js';
import {
  structuredMuSweep,
  structuredMuSynthesisSurrogate,
  structuredMuUpperBound,
} from '../js/control/robust.js';
import {
  simulateMpcOutputTracking,
  solveOutputSetpointSteadyState,
} from '../js/control/mpc.js';

let failed = 0;
function ok(label, condition, detail = '') {
  console.log(`${condition ? '[PASS]' : '[FAIL]'} ${label}${detail ? ': ' + detail : ''}`);
  if (!condition) failed++;
}
function near(label, actual, expected, tol = 1e-8) {
  ok(label, Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
    `got=${actual.toExponential(4)}, expected=${expected.toExponential(4)}`);
}
function complexNear(label, actual, expected, tol = 1e-8) {
  ok(label, actual.sub(expected).magnitude <= tol,
    `got=${actual.toString(5)}, expected=${expected.toString(5)}`);
}

console.log('\n=== P17-01: Dynamic / full-order H∞ mixed-sensitivity synthesis ===\n');
{
  const G = new TransferFunction([1], [1, 1]);
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 2, controlPenalty: 0.02 });
  const omegas = Array.from({ length: 48 }, (_, i) => Math.pow(10, -2 + (4 * i) / 47));
  const C0 = new TransferFunction([1], [1]);
  const baseline = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, C0.series(G), C0, omegas).peak;
  const result = fullOrderHinfMixedSensitivity(G, weights, { omegas, maxIter: 90 });
  ok('full-order controller order equals plant order', result.order === G.order, `order=${result.order}`);
  ok('controller is stable/proper', result.controllerTf.isStable(), result.controllerTf.toString());
  ok('synthesis cost finite', Number.isFinite(result.cost), `cost=${result.cost.toFixed(4)}`);
  ok('dynamic synthesis is no worse than static K=1 baseline', result.peak <= baseline + 1e-3,
    `dynamic=${result.peak.toFixed(4)}, baseline=${baseline.toFixed(4)}`);
}

console.log('\n=== P17-02: Structured μ upper-bound / D-scaling ===\n');
{
  const M = [
    [new Complex(2, 0), new Complex(0, 0)],
    [new Complex(0, 0), new Complex(0.5, 0)],
  ];
  const result = structuredMuUpperBound(M);
  near('diagonal matrix μ upper bound = max diagonal magnitude', result.upperBound, 2, 1e-10);
  near('unscaled upper bound also = 2', result.unscaledUpperBound, 2, 1e-10);
}
{
  const M = [
    [new Complex(1, 0), new Complex(3, 0)],
    [new Complex(0.1, 0), new Complex(1, 0)],
  ];
  const result = structuredMuUpperBound(M, { maxIter: 60 });
  ok('D-scaling does not increase σ upper-bound', result.upperBound <= result.unscaledUpperBound + 1e-9,
    `scaled=${result.upperBound.toFixed(4)}, raw=${result.unscaledUpperBound.toFixed(4)}`);
}

console.log('\n=== P17-03: MIMO frequency-domain design diagnostics ===\n');
{
  const sys = new MIMOStateSpace(
    [[-1, 0], [0, -2]],
    [[1, 0], [0, 1]],
    [[1, 0], [0, 1]],
    [[0, 0], [0, 0]],
  );
  const omegas = [1];
  const loci = characteristicLoci(sys, omegas)[0].eigenvalues;
  const expected1 = new Complex(1, 0).div(new Complex(1, 1));
  const expected2 = new Complex(1, 0).div(new Complex(2, 1));
  ok('characteristic loci returns two eigenvalue channels', loci.length === 2);
  ok('characteristic loci matches diagonal channel set',
    loci.some((v) => v.sub(expected1).magnitude < 1e-8) && loci.some((v) => v.sub(expected2).magnitude < 1e-8));

  const bands = gershgorinBands(sys, omegas)[0].bands;
  near('diagonal plant Gershgorin radius channel 1 = 0', bands[0].radius, 0, 1e-12);
  near('diagonal plant Gershgorin radius channel 2 = 0', bands[1].radius, 0, 1e-12);

  const ina = inverseNyquistArray(sys, omegas)[0].inverse;
  complexNear('INA channel 1 inverse = 1 + jω', ina[0][0], new Complex(1, 1), 1e-8);
  complexNear('INA channel 2 inverse = 2 + jω', ina[1][1], new Complex(2, 1), 1e-8);

  const muSweep = structuredMuSweep(sys, [0.1, 1, 10]);
  ok('structured μ sweep has finite peak', Number.isFinite(muSweep.peak), `peak=${muSweep.peak.toFixed(4)}`);
  const surrogate = structuredMuSynthesisSurrogate(sys, [0.1, 1], { gainCandidates: [0.1, 1, 10] });
  ok('structured robust surrogate selects a tested gain', [0.1, 1, 10].includes(surrogate.bestGain),
    `bestGain=${surrogate.bestGain}`);
}

console.log('\n=== P17-04: MPC MIMO output-space setpoint tracking ===\n');
{
  const Ad = [[0.85, 0.05], [0.02, 0.8]];
  const Bd = [[0.2, 0.03], [0.01, 0.25]];
  const C = [[1, 0], [0, 1]];
  const D = [[0, 0], [0, 0]];
  const Q = [[4, 0], [0, 4]];
  const R = [[0.05, 0], [0, 0.05]];
  const yRef = [[1], [-0.5]];
  const steady = solveOutputSetpointSteadyState(Ad, Bd, C, D, yRef);
  ok('MIMO y-ref steady-state is exactly reachable', steady.exact, `residual=${steady.residual.toExponential(3)}`);
  near('x_ss[0] equals yRef[0]', steady.x_ss[0][0], 1, 1e-7);
  near('x_ss[1] equals yRef[1]', steady.x_ss[1][0], -0.5, 1e-7);

  const sim = simulateMpcOutputTracking(Ad, Bd, C, D, Q, R, 8, [[0], [0]], yRef, { uMin: -3, uMax: 3 }, { steps: 35 });
  ok('MIMO output tracking converges', sim.finalOutputErrorNormInf < 0.03,
    `finalOutputError=${sim.finalOutputErrorNormInf.toExponential(3)}`);
  ok('MIMO output tracking cost finite', Number.isFinite(sim.totalCost));
}

console.log('');
if (failed === 0) console.log('P17 advanced control: all checks passed');
else {
  console.log(`P17 advanced control: ${failed} FAILED`);
  process.exitCode = 1;
}
