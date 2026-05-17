#!/usr/bin/env node
import { Complex, polyval } from '../js/math/complex.js';
import { matExp, matIdentity, matInverse, matMul, matSolve } from '../js/math/matrix.js';
import { polyadd, polydiv, polymul, polyroots, rootsToRealPoly } from '../js/math/polynomial.js';
import { rk4, rk45, interpolateUniform } from '../js/math/ode.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { DiscreteTransferFunction } from '../js/control/discrete-transfer-function.js';
import { c2dTustin, c2dZOH } from '../js/control/c2d.js';
import { stateSpaceToTransferFunction, tfToControllableCanonical } from '../js/control/state-space.js';
import { stepResponse } from '../js/analysis/time-response.js';
import { discreteStepResponse } from '../js/analysis/discrete-response.js';

const checks = [];

function assertNear(name, actual, expected, tolerance = 1e-9) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(name, condition) {
  if (!condition) throw new Error(name);
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
  const tustin = c2dTustin(plant, 0.1);
  const zoh = c2dZOH(plant, 0.1);
  assertNear('Tustin DC gain', tustin.dcGain(), plant.dcGain(), 1e-12);
  assertNear('ZOH DC gain', zoh.dcGain(), plant.dcGain(), 1e-12);
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Math core verification failed: ${failed.length}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`Math core verification passed: ${checks.length}/${checks.length}`);
}
