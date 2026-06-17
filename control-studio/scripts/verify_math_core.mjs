#!/usr/bin/env node
import { Complex, polyval } from '../js/math/complex.js';
import { matExp, matIdentity, matInverse, matIsPositiveDefinite, matMul, matRank, matSolve } from '../js/math/matrix.js';
import { polyadd, polydiv, polymul, polyroots, rootsToRealPoly } from '../js/math/polynomial.js';
import { rk4, rk45, interpolateUniform } from '../js/math/ode.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { DiscreteTransferFunction } from '../js/control/discrete-transfer-function.js';
import { c2dMatchedZ, c2dTustin, c2dTustinPrewarp, c2dZOH } from '../js/control/c2d.js';
import { stateSpaceToTransferFunction, tfToControllableCanonical } from '../js/control/state-space.js';
import { simulatePIDAntiWindup, simulateTimeResponse, stepResponse } from '../js/analysis/time-response.js';
import { discreteImpulseResponse, discreteStepResponse } from '../js/analysis/discrete-response.js';
import { discreteBodeData } from '../js/analysis/discrete-frequency-response.js';
import { bodeData, nyquistData, nicholsData, nyquistEncirclements } from '../js/analysis/frequency-response.js';
import { rootLocusData, rootLocusJwCrossings } from '../js/analysis/root-locus.js';

const checks = [];

function assertNear(name, actual, expected, tolerance = 1e-9) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertRelNear(name, actual, expected, relTolerance = 1e-9, absTolerance = 1e-12) {
  const scale = Math.max(1, Math.abs(expected));
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > Math.max(absTolerance, relTolerance * scale)) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(name, condition) {
  if (!condition) throw new Error(name);
}

function assertThrows(name, fn, pattern) {
  let err = null;
  try {
    fn();
  } catch (caught) {
    err = caught;
  }
  if (!err) throw new Error(`${name}: expected throw`);
  if (pattern && !pattern.test(err.message)) {
    throw new Error(`${name}: message mismatch: ${err.message}`);
  }
}

function record(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    checks.push({ name, ok: false, error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

function hasRoot(roots, re, im = 0, tolerance = 1e-7) {
  return roots.some((root) => Math.abs(root.re - re) < tolerance && Math.abs(root.im - im) < tolerance);
}

record('Complex arithmetic invariants', () => {
  const z = new Complex(3, 4);
  assertNear('|3+4j|', z.magnitude, 5);
  const q = z.mul(new Complex(1, -2)).div(new Complex(1, -2));
  assertNear('complex roundtrip re', q.re, 3);
  assertNear('complex roundtrip im', q.im, 4);
  const hugeDiv = new Complex(1e308, 1e308).div(new Complex(1e308, -1e308));
  assertNear('huge complex division re', hugeDiv.re, 0);
  assertNear('huge complex division im', hugeDiv.im, 1);
  const tinyDiv = new Complex(1e-308, 1e-308).div(new Complex(1e-308, -1e-308));
  assertNear('tiny complex division re', tinyDiv.re, 0);
  assertNear('tiny complex division im', tinyDiv.im, 1);
  const p = polyval([1, 0, 1], new Complex(0, 1));
  assertNear('polyval(j) for s^2+1 re', p.re, 0);
  assertNear('polyval(j) for s^2+1 im', p.im, 0);
});

record('Polynomial algebra and roots', () => {
  const product = polymul([1, 1], [1, -1]);
  assertTrue('polymul length', product.length === 3);
  assertNear('polymul s^2 coefficient', product[0], 1);
  assertNear('polymul constant', product[2], -1);
  const sum = polyadd([1, 0, -1], [1, 1]);
  assertTrue(`polyadd result ${sum}`, JSON.stringify(sum) === JSON.stringify([1, 1, 0]));
  const div = polydiv([1, 0, -1], [1, -1]);
  assertTrue('polydiv quotient', JSON.stringify(div.quotient.map(Math.round)) === JSON.stringify([1, 1]));
  assertNear('polydiv remainder', div.remainder[0], 0);

  const cubic = polyroots([1, 0, 0, 1]);
  assertTrue('cubic root -1', hasRoot(cubic, -1));
  assertTrue('cubic complex root +', hasRoot(cubic, 0.5, Math.sqrt(3) / 2));
  assertTrue('cubic complex root -', hasRoot(cubic, 0.5, -Math.sqrt(3) / 2));

  const quartic = polyroots([1, 0, 0, 0, 1]);
  for (const [re, im] of [[Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]]) {
    assertTrue(`quartic root ${re}+j${im}`, hasRoot(quartic, re, im));
  }

  const separatedPositive = polyroots([1, -1e16, 1]).map((root) => root.re).sort((a, b) => a - b);
  assertRelNear('separated quadratic small positive root', separatedPositive[0], 1e-16, 1e-12, 1e-20);
  assertRelNear('separated quadratic large positive root', separatedPositive[1], 1e16, 1e-12);
  const separatedNegative = polyroots([1, 1e16, 1]).map((root) => root.re).sort((a, b) => a - b);
  assertRelNear('separated quadratic large negative root', separatedNegative[0], -1e16, 1e-12);
  assertRelNear('separated quadratic small negative root', separatedNegative[1], -1e-16, 1e-12, 1e-20);

  const realPoly = rootsToRealPoly([{ re: -1, im: 2 }, { re: -1, im: -2 }]);
  assertNear('conjugate pair coefficient s', realPoly[1], 2);
  assertNear('conjugate pair constant', realPoly[2], 5);
  let threw = false;
  try { rootsToRealPoly([{ re: 1, im: 2 }]); } catch { threw = true; }
  assertTrue('unpaired complex roots rejected', threw);
});

record('Matrix solve, inverse, and exponential', () => {
  const A = [[1, 2], [3, 4]];
  const inv = matInverse(A);
  const I = matMul(A, inv);
  assertNear('A inv(A) 00', I[0][0], 1);
  assertNear('A inv(A) 01', I[0][1], 0);
  assertNear('A inv(A) 10', I[1][0], 0);
  assertNear('A inv(A) 11', I[1][1], 1);
  const x = matSolve(A, [5, 11]);
  assertNear('matSolve x0', x[0], 1);
  assertNear('matSolve x1', x[1], 2);
  const tinyA = [[1e-20, 0], [0, 2e-20]];
  const tinyInv = matInverse(tinyA);
  assertRelNear('tiny-scale inverse 00', tinyInv[0][0], 1e20, 1e-12);
  assertRelNear('tiny-scale inverse 11', tinyInv[1][1], 5e19, 1e-12);
  const tinyX = matSolve(tinyA, [1e-20, 4e-20]);
  assertNear('tiny-scale solve x0', tinyX[0], 1);
  assertNear('tiny-scale solve x1', tinyX[1], 2);
  assertTrue('tiny full-rank matrix rank', matRank(tinyA) === 2);
  assertTrue('tiny positive-definite matrix accepted', matIsPositiveDefinite(tinyA));
  assertTrue('tiny negative matrix rejected as PD', !matIsPositiveDefinite([[-1e-20, 0], [0, 2e-20]]));
  assertTrue('zero matrix rank', matRank([[0, 0], [0, 0]]) === 0);
  const expZero = matExp([[0, 0], [0, 0]]);
  assertTrue('exp(0)=I', JSON.stringify(expZero) === JSON.stringify(matIdentity(2)));
  const rot = matExp([[0, 1], [-1, 0]]);
  assertNear('rotation exp cos', rot[0][0], Math.cos(1), 1e-10);
  assertNear('rotation exp sin', rot[0][1], Math.sin(1), 1e-10);
});

record('ODE solvers', () => {
  const f = (_, y) => [-y[0]];
  const fixed = rk4(f, [1], 0, 1, 0.01);
  assertNear('rk4 exp decay', fixed.y.at(-1)[0], Math.exp(-1), 1e-8);
  const adaptive = rk45(f, [1], 0, 1, { rtol: 1e-8, atol: 1e-10 });
  assertNear('rk45 exp decay', adaptive.y.at(-1)[0], Math.exp(-1), 1e-7);
  const uniform = interpolateUniform(adaptive, 11);
  assertTrue('interpolateUniform count', uniform.t.length === 11 && uniform.y.length === 11);
});

record('Transfer function invariants', () => {
  let threw = false;
  try { new TransferFunction([1], [0]); } catch { threw = true; }
  assertTrue('zero denominator rejected', threw);
  const g = new TransferFunction([2], [2, 2]);
  assertNear('TF normalization num', g.num[0], 1);
  assertNear('TF normalization den0', g.den[0], 1);
  const h = new TransferFunction([1], [1, 1]);
  const series = g.series(h);
  assertNear('series dc gain', series.dcGain(), 1);
  const closed = h.feedback();
  assertNear('feedback den constant', closed.den.at(-1), 2);
  assertNear('dc gain cancels origin pole-zero', new TransferFunction([1, 0], [1, 0]).dcGain(), 1);
  assertNear('dc gain zero after extra origin zero', new TransferFunction([1, 0, 0], [1, 0]).dcGain(), 0);
  assertTrue('dc gain infinite after extra origin pole', new TransferFunction([1, 0], [1, 0, 0]).dcGain() === Infinity);
  assertTrue('dc gain preserves signed infinity', new TransferFunction([-1], [1, 0]).dcGain() === -Infinity);
});

record('Discrete transfer function invariants', () => {
  let threw = false;
  try { new DiscreteTransferFunction([1], [0], 0.1); } catch { threw = true; }
  assertTrue('zero discrete denominator rejected', threw);
  const g = new DiscreteTransferFunction([0, 0.5], [1, -0.5], 0.1);
  assertNear('DTF dc gain', g.dcGain(), 1);
  assertTrue('DTF stable pole', g.isStable());
  const step = discreteStepResponse(g, { sampleCount: 80 });
  assertNear('DTF step final', step.y.at(-1), 1, 1e-10);
  assertTrue('DTF step finite grid', step.t.length === 80 && step.t.every(Number.isFinite));
  assertTrue('DTF step finite output', step.y.length === 80 && step.y.every(Number.isFinite));
  const impulse = discreteImpulseResponse(g, { sampleCount: '6', amplitude: '2' });
  assertNear('DTF impulse delayed sample', impulse.y[1], 1, 1e-12);
  const scaledDen = discreteStepResponse({ num: [2], den: [2], sampleTime: 0.25 }, { sampleCount: 3 });
  assertNear('plain DTF den0 scaling', scaledDen.y[0], 1, 1e-12);
  assertThrows('discreteStepResponse rejects non-finite sampleCount', () => discreteStepResponse(g, { sampleCount: NaN }), /sampleCount/);
  assertThrows('discreteStepResponse rejects non-positive sampleCount', () => discreteStepResponse(g, { sampleCount: 0 }), /sampleCount/);
  assertThrows('discreteStepResponse rejects non-finite amplitude', () => discreteStepResponse(g, { amplitude: NaN }), /amplitude/);
  assertThrows('discreteStepResponse rejects invalid sampleTime', () => discreteStepResponse({ num: [1], den: [1], sampleTime: NaN }), /sampleTime/);
});

record('State-space conversion roundtrip', () => {
  const tf = new TransferFunction([1, 3], [1, 2, 1]);
  const ss = tfToControllableCanonical(tf.num, tf.den);
  const roundtrip = stateSpaceToTransferFunction(ss.A, ss.B, ss.C, ss.D);
  assertNear('SS roundtrip num0', roundtrip.num[0], 1);
  assertNear('SS roundtrip num1', roundtrip.num[1], 3);
  assertNear('SS roundtrip den0', roundtrip.den[0], 1);
  assertNear('SS roundtrip den1', roundtrip.den[1], 2);
  assertNear('SS roundtrip den2', roundtrip.den[2], 1);
});

record('Continuous/discrete response consistency', () => {
  const plant = new TransferFunction([1], [1, 1]);
  const step = stepResponse(plant, { duration: 8, sampleCount: 400 });
  assertNear('continuous step final', step.y.at(-1), 1, 5e-4);
  assertTrue('continuous step time grid finite', step.t.length === 400 && step.t.every(Number.isFinite));
  assertTrue('continuous step output finite', step.y.length === 400 && step.y.every(Number.isFinite));
  const sineDefault = simulateTimeResponse(plant, 'sine');
  assertTrue('sine default options remain finite', sineDefault.y.every(Number.isFinite));
  assertThrows('stepResponse rejects non-finite sampleCount', () => stepResponse(plant, { sampleCount: NaN }), /sampleCount/);
  assertThrows('stepResponse rejects non-positive duration', () => stepResponse(plant, { duration: -1 }), /duration/);
  assertThrows('simulateTimeResponse rejects non-finite frequency', () => simulateTimeResponse(plant, 'sine', { frequency: NaN }), /frequency/);
  assertThrows('simulateTimeResponse rejects non-finite initialState', () => simulateTimeResponse(plant, 'step', { initialState: [0, NaN] }), /initialState/);
  assertThrows('stepResponse rejects improper TF', () => stepResponse(new TransferFunction([1, 1], [1]), { sampleCount: 20 }), /proper transfer function/);
  const biproper = new TransferFunction([1, 2], [1, 1]);
  const biproperDisturbance = stepResponse(biproper, {
    duration: 1,
    sampleCount: 20,
    amplitude: 1,
    disturbanceType: 'step',
    disturbanceAmplitude: 1,
    disturbanceStart: 0,
  });
  assertNear('biproper disturbance feedthrough at t=0', biproperDisturbance.y[0], 2, 1e-12);
  assertThrows('simulatePIDAntiWindup rejects non-finite saturation bound', () => simulatePIDAntiWindup(plant, { Kp: 1 }, { uMax: NaN }), /uMax/);
  assertThrows('simulatePIDAntiWindup rejects invalid saturation bounds', () => simulatePIDAntiWindup(plant, { Kp: 1 }, { uMin: 2, uMax: 1 }), /uMin/);
  assertThrows('simulatePIDAntiWindup rejects non-positive tracking time', () => simulatePIDAntiWindup(plant, { Kp: 1, Ki: 1 }, { Tt: 0 }), /Tt/);
  assertThrows('simulatePIDAntiWindup rejects biproper plant', () => simulatePIDAntiWindup(biproper, { Kp: 1 }, { sampleCount: 20 }), /strictly proper/);
  const tustin = c2dTustin(plant, 0.1);
  const zoh = c2dZOH(plant, 0.1);
  assertNear('Tustin DC gain', tustin.dcGain(), plant.dcGain(), 1e-12);
  assertNear('ZOH DC gain', zoh.dcGain(), plant.dcGain(), 1e-12);

  // Tustin prewarping: |H_d(e^{jω_w·Ts})| should equal |H_c(jω_w)| exactly
  const omegaW = 5; // rad/s
  const prewarp = c2dTustinPrewarp(plant, 0.1, omegaW);
  assertNear('Prewarp DC gain preserved', prewarp.dcGain(), plant.dcGain(), 1e-6);
  // At ω_w: magnitude should match — verify via direct evaluation
  // H_c(jω_w) magnitude = |1 / (jω_w + 1)| = 1/sqrt(ω_w²+1)
  const contMagAtW = 1 / Math.sqrt(omegaW * omegaW + 1);
  // H_d(e^{jω_w·Ts}): evaluate DiscreteTransferFunction at z=e^{jθ}, θ=ω_w*Ts
  const theta = omegaW * 0.1;
  const zRe = Math.cos(theta); const zIm = Math.sin(theta);
  // Evaluate: sum(b_k * z^{-k}) / sum(a_k * z^{-k}) where z^{-k} = cos(-k*theta)+j*sin(-k*theta)
  let numRe = 0, numIm = 0, denRe = 0, denIm = 0;
  for (let k = 0; k < prewarp.num.length; k++) {
    numRe += prewarp.num[k] * Math.cos(-k * theta);
    numIm += prewarp.num[k] * Math.sin(-k * theta);
  }
  for (let k = 0; k < prewarp.den.length; k++) {
    denRe += prewarp.den[k] * Math.cos(-k * theta);
    denIm += prewarp.den[k] * Math.sin(-k * theta);
  }
  const discMagAtW = Math.sqrt(numRe * numRe + numIm * numIm) / Math.sqrt(denRe * denRe + denIm * denIm);
  assertNear('Prewarp magnitude matches at ω_w', discMagAtW, contMagAtW, 1e-8);

  // Matched-Z: poles map correctly, DC gain preserved
  const matched = c2dMatchedZ(plant, 0.1);
  assertNear('Matched-Z DC gain', matched.dcGain(), plant.dcGain(), 1e-6);
  // Discrete pole should be exp(-1 * 0.1) = exp(-0.1)
  const expectedPole = Math.exp(-1 * 0.1);
  const discPoles = matched.poles();
  const realPole = discPoles.find((p) => Math.abs(p.im) < 1e-9);
  assertNear('Matched-Z pole = exp(-Ts)', realPole?.re ?? 0, expectedPole, 1e-8);
});

record('Analysis grid input guards', () => {
  const plant = new TransferFunction([1], [1, 1]);
  const discretePlant = new DiscreteTransferFunction([0, 1], [1, -0.5], 0.1);
  const bode = bodeData(plant, 1e-2, 1e2, 8);
  assertTrue('bode finite grid', bode.w.length === 8 && bode.w.every(Number.isFinite));
  const nyquist = nyquistData(plant, 1e-2, 1e2, 8);
  assertTrue('nyquist finite grid', nyquist.w.length === 8 && nyquist.re.every(Number.isFinite) && nyquist.im.every(Number.isFinite));
  const nichols = nicholsData(plant, 1e-2, 1e2, 8);
  assertTrue('nichols finite grid', nichols.w.length === 8 && nichols.magDB.every(Number.isFinite));
  assertTrue('nyquist encirclements remains finite', Number.isFinite(nyquistEncirclements(plant, 1e-2, 1e2, 8)));
  const locus = rootLocusData(plant, 0, 2, 8);
  assertTrue('root locus finite gains', locus.gains.length === 8 && locus.gains.every(Number.isFinite));
  const discreteBode = discreteBodeData(discretePlant, { omegaMin: 1e-2, samples: 50 });
  assertTrue('discrete bode finite grid', discreteBode.w.length === 50 && discreteBode.w.every(Number.isFinite));
  assertTrue('discrete bode finite dB', discreteBode.magDB.every(Number.isFinite));
  const zeroDiscreteBode = discreteBodeData(new DiscreteTransferFunction([0], [1], 0.1), { omegaMin: 1e-2, samples: 50 });
  assertTrue('zero discrete bode dB remains finite', zeroDiscreteBode.magDB.every(Number.isFinite));

  assertThrows('bodeData rejects single-point grid', () => bodeData(plant, 1e-2, 1e2, 1), /nPoints/);
  assertThrows('nyquistData rejects invalid range', () => nyquistData(plant, 1, 1, 8), /frequency range/);
  assertThrows('discreteBodeData rejects non-finite samples', () => discreteBodeData(discretePlant, { samples: NaN }), /samples/);
  assertThrows('discreteBodeData rejects invalid omegaMin', () => discreteBodeData(discretePlant, { omegaMin: Math.PI / 0.1 }), /omegaMin/);
  assertThrows('rootLocusData rejects single-point grid', () => rootLocusData(plant, 0, 2, 1), /nPoints/);
  assertThrows('rootLocusJwCrossings rejects single-point sweep', () => rootLocusJwCrossings(plant, 10, 1), /samples/);
  assertThrows('rootLocusJwCrossings rejects invalid kMax', () => rootLocusJwCrossings(plant, 1e-4, 8), /kMax/);
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Math core verification failed: ${failed.length}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`Math core verification passed: ${checks.length}/${checks.length}`);
}
