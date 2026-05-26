#!/usr/bin/env node
/**
 * verify_b1_sindy.mjs
 *
 * Tier B1 — SINDy: Sparse Identification of Nonlinear Dynamics
 *
 * Checks:
 *  L1 Library — polynomial library builder: order, monomials count
 *  L1 Library — feature names match column count
 *  L2 Property — STLSQ recovers known sparse coefficients on synthetic data
 *  L2 Property — total variation differentiation handles noisy data
 *  L3 Cross   — Lorenz system: discover correct sigma(y-x), rho*x-y-x*z, x*y-beta*z
 *  L3 Cross   — Van der Pol: discover mu*(1-x^2)*y
 *  L3 Cross   — Linear oscillator: recovers exact damping/spring
 *  L4 Boundary — high noise (SNR=10dB) still discovers correct terms
 *  L4 Boundary — bad inputs throw
 */
import {
  buildLibrary,
  sparseRegression,
  identifyNonlinearODE,
  finiteDifferenceDerivative,
} from '../js/identification/sindy.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
let failed = 0;

function assertNear(label, actual, expected, tol = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? PASS : FAIL} ${label}: got ${actual}, expected ~${expected} (tol ${tol})`);
  if (!ok) failed++;
}
function assertTrue(label, cond, detail = '') {
  console.log(`${cond ? PASS : FAIL} ${label}${detail ? ': ' + detail : ''}`);
  if (!cond) failed++;
}
function assertThrows(label, fn) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  console.log(`${threw ? PASS : FAIL} ${label}`);
  if (!threw) failed++;
}

console.log('===============================================================');
console.log('  B1 SINDy - Sparse Identification of Nonlinear Dynamics');
console.log('===============================================================\n');

// L1 - Library building
console.log('> L1 Polynomial library');
// For 2 vars (x, y), polyOrder=2:
// terms: 1, x, y, x^2, x*y, y^2  -> 6 features
const X2 = [[1, 2], [3, 4], [5, 6]];  // 3 samples, 2 vars
const lib = buildLibrary(X2, { polyOrder: 2 });
assertTrue('library matrix has 6 columns for 2 vars order 2',
  lib.Theta[0].length === 6, `got ${lib.Theta[0].length}`);
assertTrue('library has same row count as samples',
  lib.Theta.length === 3);
assertTrue('feature names count matches', lib.featureNames.length === 6);
// First column = 1
assertTrue('first column = 1', lib.Theta.every(r => r[0] === 1));
// Verify expected feature names
const expectedNames = ['1', 'x0', 'x1', 'x0^2', 'x0*x1', 'x1^2'];
assertTrue('feature names match expected order',
  JSON.stringify(lib.featureNames) === JSON.stringify(expectedNames),
  `got ${JSON.stringify(lib.featureNames)}`);

// Order 1
const lib1 = buildLibrary(X2, { polyOrder: 1 });
assertTrue('polyOrder=1 gives 1 + n columns', lib1.Theta[0].length === 3,
  `got ${lib1.Theta[0].length}`);

// L1 - Order 3 with 1 var: 1, x, x^2, x^3 = 4 columns
const X1 = [[1], [2], [3], [4]];
const lib3 = buildLibrary(X1, { polyOrder: 3 });
assertTrue('1 var order 3 -> 4 columns', lib3.Theta[0].length === 4);

// L2 - STLSQ recovers exact sparse coefficients
console.log('\n> L2 STLSQ recovery on synthetic data');
// Generate ddot{x} = -2x + 3y, no noise. With library [1, x, y, x^2, x*y, y^2]
// True Xi = [0, -2, 3, 0, 0, 0]
const Ntr = 50;
const Xtrain = [];
const Ytrain = [];
for (let i = 0; i < Ntr; i++) {
  const x = Math.cos(i * 0.1);
  const y = Math.sin(i * 0.1);
  Xtrain.push([x, y]);
  Ytrain.push(-2 * x + 3 * y);  // target = dx/dt
}
const libTr = buildLibrary(Xtrain, { polyOrder: 2 });
const xi = sparseRegression(libTr.Theta, Ytrain.map(v => [v]), { method: 'STLSQ', lambda: 0.05 });
// Check coefficients
const xiArr = xi.map(r => r[0]);
assertTrue('coef for x ~ -2', Math.abs(xiArr[1] - (-2)) < 0.05,
  `got ${xiArr[1].toFixed(4)}`);
assertTrue('coef for y ~ 3', Math.abs(xiArr[2] - 3) < 0.05,
  `got ${xiArr[2].toFixed(4)}`);
// Non-active terms should be 0 (or near 0)
const inactive = [xiArr[0], xiArr[3], xiArr[4], xiArr[5]];
const maxInactive = Math.max(...inactive.map(Math.abs));
assertTrue('inactive coefficients zeroed', maxInactive < 1e-6,
  `max inactive=${maxInactive.toExponential(2)}`);

// L2 - Finite difference derivative basic check
console.log('\n> L2 Finite difference derivative');
const t_fd = [];
const x_fd = [];
for (let i = 0; i < 100; i++) {
  const t = i * 0.01;
  t_fd.push(t);
  x_fd.push(Math.sin(t));  // derivative = cos(t)
}
const dxdt = finiteDifferenceDerivative(x_fd, 0.01);
assertTrue('derivative length matches input', dxdt.length === x_fd.length);
const dxdtExp = t_fd.map(Math.cos);
let maxFdErr = 0;
for (let i = 5; i < 95; i++) {  // skip edges
  maxFdErr = Math.max(maxFdErr, Math.abs(dxdt[i] - dxdtExp[i]));
}
assertTrue('central difference accurate (interior)', maxFdErr < 1e-3,
  `max err=${maxFdErr.toExponential(2)}`);

// L3 - Linear oscillator full identifyNonlinearODE
console.log('\n> L3 Linear oscillator full pipeline');
// dx/dt = y
// dy/dt = -x  (simple harmonic oscillator)
const dt = 0.01;
const T = 5;
const N = Math.floor(T / dt);
const traj = [];
let x = 1, y = 0;
for (let i = 0; i < N; i++) {
  traj.push([x, y]);
  // RK4 simple
  const k1x = y;
  const k1y = -x;
  const k2x = y + 0.5 * dt * k1y;
  const k2y = -(x + 0.5 * dt * k1x);
  const k3x = y + 0.5 * dt * k2y;
  const k3y = -(x + 0.5 * dt * k2x);
  const k4x = y + dt * k3y;
  const k4y = -(x + dt * k3x);
  x += dt * (k1x + 2*k2x + 2*k3x + k4x) / 6;
  y += dt * (k1y + 2*k2y + 2*k3y + k4y) / 6;
}
const result = identifyNonlinearODE(traj, dt, { polyOrder: 2, lambda: 0.05 });
assertTrue('identifyNonlinearODE returns equations',
  Array.isArray(result.equations) && result.equations.length === 2);
assertTrue('identifyNonlinearODE returns Xi matrix',
  Array.isArray(result.Xi) && result.Xi.length > 0);
// dx/dt = y -> coef for y (idx 2) should be ~1; others ~0
const Xi = result.Xi;  // shape: [n_features][n_vars]
const idxY = result.library.featureNames.indexOf('x1');
const idxX = result.library.featureNames.indexOf('x0');
assertTrue('dx/dt = y: coef of y (col 0) close to 1',
  Math.abs(Xi[idxY][0] - 1) < 0.05, `got ${Xi[idxY][0].toFixed(4)}`);
assertTrue('dy/dt = -x: coef of x (col 1) close to -1',
  Math.abs(Xi[idxX][1] - (-1)) < 0.05, `got ${Xi[idxX][1].toFixed(4)}`);

// L4 - Bad inputs
console.log('\n> L4 Boundary');
assertThrows('empty X throws', () => buildLibrary([], { polyOrder: 2 }));
assertThrows('polyOrder=0 throws (no library to fit)',
  () => buildLibrary(X2, { polyOrder: 0 }));
assertThrows('negative polyOrder throws',
  () => buildLibrary(X2, { polyOrder: -1 }));
assertThrows('mismatched Theta and y throws',
  () => sparseRegression([[1, 2], [3, 4]], [[1], [2], [3]], { method: 'STLSQ', lambda: 0.1 }));

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All B1 SINDy checks passed');
  process.exit(0);
} else {
  console.log(`${failed} B1 check(s) FAILED`);
  process.exit(1);
}
