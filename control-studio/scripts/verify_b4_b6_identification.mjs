#!/usr/bin/env node
/**
 * Verification for Functional Roadmap B4-B6 identification baselines.
 */

import { Complex } from '../js/math/complex.js';
import { fitGP, optimizeHyper, predictGP } from '../js/identification/gp.js';
import { identifyHammerstein, identifyWiener } from '../js/identification/hammerstein_wiener.js';
import { computeFRFMIMO, fitMIMOFromFRF } from '../js/identification/freq_mimo.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const nearly = (actual, expected, tolerance, message) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
};

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

function verifyGP() {
  const X = [];
  const y = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 4;
    X.push([t]);
    y.push(315 + 0.9 * t);
  }
  const trainX = X.filter((_, i) => i % 2 === 0);
  const trainY = y.filter((_, i) => i % 2 === 0);
  const testX = X.filter((_, i) => i % 2 === 1);
  const testY = y.filter((_, i) => i % 2 === 1);
  const gp = fitGP({
    X: trainX,
    y: trainY,
    kernel: 'rbf',
    noiseVar: 2e-4,
    hyper: { kernel: 'rbf', lengthScale: 3.5, variance: 100, noiseVar: 2e-4 },
  });
  const pred = predictGP(gp, testX);
  const covered = testY.filter((actual, i) => actual >= pred.ci95[i][0] && actual <= pred.ci95[i][1]).length;
  assert(covered / testY.length >= 0.95, `GP 95% interval coverage too low: ${covered}/${testY.length}`);

  const near = predictGP(gp, [[5]]).variance[0];
  const far = predictGP(gp, [[25]]).variance[0];
  assert(far > near * 5, `GP far-field variance should expand: near=${near}, far=${far}`);

  const hyper = optimizeHyper({ kernel: 'rbf', lengthScale: 2, variance: 25, noiseVar: 2e-4 }, trainX, trainY, { noiseVar: 2e-4 });
  assert(hyper.converged && Number.isFinite(hyper.lengthScale) && Number.isFinite(hyper.variance), 'GP hyperparameter optimization did not converge');
}

function verifyHammersteinWiener() {
  const u = [];
  const y = [];
  const level = 1.2;
  const a = 0.55;
  const b = 0.8;
  y[0] = 0;
  for (let k = 0; k < 220; k++) {
    u[k] = 2.2 * Math.sin(0.13 * k) + 0.65 * Math.sin(0.47 * k);
    if (k > 0) y[k] = a * y[k - 1] + b * clamp(u[k - 1], level);
  }
  const model = identifyHammerstein({ u, y, na: 1, nb: 1, nlOrder: 1, dt: 1 });
  const levelErr = Math.abs(model.nonlinearity.level - level) / level;
  assert(levelErr < 0.05, `Hammerstein saturation level error too high: ${levelErr}`);
  assert(model.fitPercent > 95, `Hammerstein fit too low: ${model.fitPercent}`);

  const wu = [];
  const wy = [];
  const coeff = [0.4, 1.2, 0.3];
  for (let k = 0; k < 160; k++) {
    const x = -1.4 + 2.8 * k / 159;
    wu.push(x);
    wy.push(coeff[0] + coeff[1] * x + coeff[2] * x * x);
  }
  const wmodel = identifyWiener({ u: wu, y: wy, nb: 1, nlOrder: 2, dt: 1 });
  wmodel.h_coeffs.forEach((value, i) => nearly(value, coeff[i], 5e-4, `Wiener polynomial coefficient ${i}`));
  assert(wmodel.fitPercent > 99.9, `Wiener fit too low: ${wmodel.fitPercent}`);
}

function trueMimoFRF(w) {
  const jw = new Complex(0, w);
  return [
    [new Complex(2, 0).div(jw.add(1)), new Complex(0.4, 0).div(jw.add(2))],
    [new Complex(-0.25, 0).div(jw.add(3)), new Complex(1.5, 0).div(jw.add(0.7))],
  ];
}

function cMul(A, B) {
  return A.map((row) => B[0].map((_, j) => row.reduce((sum, value, k) => sum.add(value.mul(B[k][j])), new Complex(0, 0))));
}

function verifyMimoFRF() {
  const freq = [0.2, 0.8, 2.5, 5];
  const U = [];
  const Y = [];
  const trueG = [];
  for (const w of freq) {
    const G = trueMimoFRF(w);
    const Uk = [
      [new Complex(1, 0), new Complex(0.25, 0.1)],
      [new Complex(-0.15, 0.05), new Complex(1, -0.2)],
    ];
    trueG.push(G);
    U.push(Uk);
    Y.push(cMul(G, Uk));
  }
  const frf = computeFRFMIMO({ U, Y, freq, method: 'LS' });
  for (let k = 0; k < freq.length; k++) {
    assert(frf.coherence[k] > 0.9, `MIMO FRF coherence too low at ${freq[k]} rad/s`);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const actual = frf.G_jw[k][i][j];
        const expected = trueG[k][i][j];
        const magErr = Math.abs(actual.magnitude - expected.magnitude) / Math.max(1e-12, expected.magnitude);
        const phaseErr = Math.abs(actual.angleDeg - expected.angleDeg);
        assert(magErr < 0.05, `MIMO FRF magnitude error too high at ${k}/${i}${j}: ${magErr}`);
        assert(phaseErr < 3, `MIMO FRF phase error too high at ${k}/${i}${j}: ${phaseErr}`);
      }
    }
  }
  const ss = fitMIMOFromFRF(frf, 'ss', 2);
  assert(ss.A.length === 2 && ss.B[0].length === 2 && ss.C.length === 2 && ss.D.length === 2, 'MIMO FRF state-space fit has invalid dimensions');
}

verifyGP();
verifyHammersteinWiener();
verifyMimoFRF();

console.log('PASS: B4-B6 identification verification');
