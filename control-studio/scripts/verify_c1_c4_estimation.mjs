#!/usr/bin/env node
/**
 * Verification for Functional Roadmap C1-C4 estimation APIs.
 */

import { designMHE, stepMHE } from '../js/estimation/mhe.js';
import { initPF, resample, stepPF } from '../js/estimation/particle_filter.js';
import { designDualEKF, stepDualEKF } from '../js/estimation/dual_ekf.js';
import { rtsSmoother } from '../js/estimation/smoother.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function verifyMHE() {
  const A = [[1]], B = [[0]], C = [[1]];
  const mhe = designMHE({ plant: { A, B, C }, horizon: 8, R: [[0.05]], constraints: { xMin: [-1], xMax: [1] } });
  let result;
  for (let k = 0; k < 25; k++) result = stepMHE(mhe, [1.8], [0]);
  assert(result.x_hat[0] <= 1 + 1e-9, `MHE state constraint violated: ${result.x_hat[0]}`);

  const free = designMHE({ plant: { A, B, C }, horizon: 8, R: [[0.05]] });
  for (let k = 0; k < 25; k++) result = stepMHE(free, [0.7 + 0.02 * Math.sin(k)], [0]);
  assert(Math.abs(result.x_hat[0] - 0.7) < 0.08, `Linear Gaussian MHE did not converge near KF-like estimate: ${result.x_hat[0]}`);

  const plant = {
    x0: [0.2],
    searchSpan: 3,
    f: (x, u) => [0.75 * x[0] + 0.25 * u[0] - 0.1 * x[0] * x[0]],
    h: (x) => [x[0] + 0.6 * x[0] * x[0]],
  };
  const nmhe = designMHE({ plant, horizon: 6, constraints: { xMin: [-2], xMax: [2] } });
  let trueX = [0.4];
  let ekfLike = [0.4];
  let mheErr = 0;
  let ekfErr = 0;
  for (let k = 0; k < 28; k++) {
    const u = [Math.sin(0.2 * k) + 0.4];
    trueX = plant.f(trueX, u);
    const y = plant.h(trueX);
    const r = stepMHE(nmhe, y, u);
    ekfLike = [0.75 * ekfLike[0] + 0.25 * u[0]];
    if (k > 15) {
      mheErr += Math.abs(r.x_hat[0] - trueX[0]);
      ekfErr += Math.abs(ekfLike[0] - trueX[0]);
    }
  }
  assert(mheErr < ekfErr, `Nonlinear MHE should reduce bias versus linearized predictor: mhe=${mheErr}, ekf=${ekfErr}`);
}

function verifyPF() {
  const trueRange = 10;
  const pf = initPF({
    N: 700,
    seed: 7,
    processNoise: [0.03, 0.03],
    measNoise: [0.02],
    x0Sampler: (rng) => [8 + 4 * rng(), 2 * rng() - 1],
    f: (x, u) => [x[0] + 0.1 * x[1] + (u?.[0] ?? 0), x[1]],
    h: (x) => [Math.atan2(1, x[0])],
  });
  let result;
  for (let k = 0; k < 20; k++) {
    const y = [Math.atan2(1, trueRange)];
    result = stepPF(pf, [0], y);
  }
  assert(Math.abs(result.x_mean[0] - trueRange) < 1.2, `PF bearing-only range estimate too far: ${result.x_mean[0]}`);
  assert(result.ESS > pf.N / 3, `PF ESS too low after resampling: ${result.ESS}`);
  const before = result.x_cov[0][0];
  resample(pf, 'stratified');
  result = stepPF(pf, [0], [Math.atan2(1, trueRange)]);
  assert(Number.isFinite(before) && Number.isFinite(result.x_cov[0][0]), 'PF covariance should remain finite across resampling');
}

function verifyDualEKF() {
  const trueK = 1.8;
  const trueTau = 2.2;
  const ekf = designDualEKF({
    x0: [0],
    theta0: [1.0, 1.2],
    Q_x: [1e-4],
    Q_theta: [2e-4, 2e-4],
    R: [0.002],
    f: (x, u, theta) => {
      const [K, tau] = theta;
      return [x[0] + 0.1 * (-(1 / tau) * x[0] + (K / tau) * u[0])];
    },
    h: (x) => [x[0]],
  });
  let x = [0];
  let r;
  for (let k = 0; k < 140; k++) {
    const u = [k < 20 ? 0 : 1 + 0.3 * Math.sin(0.05 * k)];
    x = [x[0] + 0.1 * (-(1 / trueTau) * x[0] + (trueK / trueTau) * u[0])];
    r = stepDualEKF(ekf, u, [x[0]]);
  }
  assert(Math.abs(r.theta_hat[0] - trueK) < 0.35, `Dual EKF K estimate off: ${r.theta_hat[0]}`);
  assert(Math.abs(r.theta_hat[1] - trueTau) < 0.55, `Dual EKF tau estimate off: ${r.theta_hat[1]}`);

  const bad = designDualEKF({
    x0: [0],
    theta0: [1],
    f: (x) => [x[0]],
    h: () => [0],
    R: [0.1],
  });
  const warn = stepDualEKF(bad, [0], [0]);
  assert(warn.warning?.includes('rank deficient'), 'Dual EKF should flag unobservable measurement Jacobian');
}

function verifySmoother() {
  const A = [[1]];
  const filtered = [
    { x: [0], P: [[1.0]] },
    { x: [1.2], P: [[0.6]] },
    { x: [1.8], P: [[0.4]] },
    { x: [3.1], P: [[0.3]] },
  ];
  const predicted = [
    { x: [0], P: [[1.0]] },
    { x: [0], P: [[1.1]] },
    { x: [1.2], P: [[0.7]] },
    { x: [1.8], P: [[0.5]] },
  ];
  const { smoothed } = rtsSmoother({ A, filtered, predicted });
  for (let k = 0; k < smoothed.length - 1; k++) {
    assert(smoothed[k].P[0][0] <= filtered[k].P[0][0] + 1e-9, `RTS covariance increased at ${k}`);
  }
  const truth = [2.4, 2.6, 2.8, 3.0];
  const filterMse = filtered.reduce((sum, item, i) => sum + (item.x[0] - truth[i]) ** 2, 0) / filtered.length;
  const smoothMse = smoothed.reduce((sum, item, i) => sum + (item.x[0] - truth[i]) ** 2, 0) / smoothed.length;
  assert(smoothMse <= 0.7 * filterMse, `RTS MSE reduction too small: ${smoothMse} vs ${filterMse}`);
}

verifyMHE();
verifyPF();
verifyDualEKF();
verifySmoother();

console.log('PASS: C1-C4 estimation verification');
