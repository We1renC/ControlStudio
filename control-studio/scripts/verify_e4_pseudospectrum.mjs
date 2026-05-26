#!/usr/bin/env node
/**
 * verify_e4_pseudospectrum.mjs
 *
 * Tier E4 — Pseudo-spectrum computation
 *
 * ε-pseudo-spectrum:
 *   σ_ε(A) = { z ∈ ℂ : σ_min(zI - A) ≤ ε }
 *
 * Equivalent: z is eigenvalue of (A + E) for some ||E||_2 ≤ ε.
 *
 * Checks:
 *  L1 Property — normal A: pseudospectrum = disks around eigenvalues
 *  L1 Property — at exact eigenvalue z = λ_i, σ_min(zI - A) = 0
 *  L2 Cross   — non-normal matrix (Toeplitz / shift): spectrum significantly enlarged
 *  L3 Boundary — grid extends beyond eigenvalue region
 *  L4 Boundary — bad inputs throw
 */
import {
  computePseudoSpectrum,
  sigmaMinComplex,
} from '../js/analysis/pseudospectrum.js';
import { matIdentity } from '../js/math/matrix.js';

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
console.log('  E4 Pseudo-spectrum');
console.log('===============================================================\n');

// L1 - At exact eigenvalue, sigma_min should be ~0
console.log('> L1 sigma_min at eigenvalue');
// Diagonal A = diag(-1, -2): eigenvalues are -1, -2
const A = [[-1, 0], [0, -2]];
const sigmaAtNeg1 = sigmaMinComplex(A, { re: -1, im: 0 });
const sigmaAtNeg2 = sigmaMinComplex(A, { re: -2, im: 0 });
const sigmaAtOrigin = sigmaMinComplex(A, { re: 0, im: 0 });
assertTrue('σ_min(z=-1) ~ 0 (eigenvalue)', sigmaAtNeg1 < 1e-9,
  `got ${sigmaAtNeg1.toExponential(2)}`);
assertTrue('σ_min(z=-2) ~ 0 (eigenvalue)', sigmaAtNeg2 < 1e-9,
  `got ${sigmaAtNeg2.toExponential(2)}`);
assertTrue('σ_min(z=0) > 0 (not eigenvalue)', sigmaAtOrigin > 0.5,
  `got ${sigmaAtOrigin.toFixed(4)}`);

// L1 - normal A: distance to nearest eigenvalue
console.log('\n> L1 Normal A: pseudo-spectrum = disks');
// For normal A, σ_min(zI - A) = min_i |z - λ_i|
// So pseudo-spectrum is disks of radius ε around each eigenvalue
const sigmaAt05 = sigmaMinComplex(A, { re: -0.5, im: 0 });
// Distance from z=-0.5 to eigenvalues {-1, -2}: min = 0.5
assertNear('σ_min(z=-0.5) = distance 0.5', sigmaAt05, 0.5, 1e-9);

const sigmaAtMid = sigmaMinComplex(A, { re: -1.5, im: 0 });
// Distance from -1.5 to {-1, -2}: min = 0.5
assertNear('σ_min(z=-1.5) = 0.5', sigmaAtMid, 0.5, 1e-9);

// L2 - Compute grid pseudo-spectrum
console.log('\n> L2 Grid pseudo-spectrum (normal A)');
const ps = computePseudoSpectrum(A, {
  reRange: [-3, 0.5], imRange: [-1, 1],
  npts: 15, epsilons: [0.1, 0.5]
});
assertTrue('grid has correct dims', ps.grid.length === 15 && ps.grid[0].length === 15);
assertTrue('sigmas computed', ps.sigmas.length === 15 && ps.sigmas[0].length === 15);
assertTrue('contours returned for each epsilon',
  ps.contours.length === 2);
// Check: at grid points near eigenvalues, sigma_min should be small
let minSigma = Infinity;
for (let i = 0; i < 15; i++) {
  for (let j = 0; j < 15; j++) {
    if (ps.sigmas[i][j] < minSigma) minSigma = ps.sigmas[i][j];
  }
}
assertTrue('grid captures eigenvalue (min σ < 0.2)', minSigma < 0.2,
  `min σ = ${minSigma.toFixed(4)}`);

// L2 - non-normal matrix: pseudo-spectrum significantly enlarged
console.log('\n> L2 Non-normal A: pseudo-spectrum enlarged');
// Triangular Toeplitz: highly non-normal, spectrum = {0} but pseudo-spectrum large
const N = 5;
const Anor = [];
for (let i = 0; i < N; i++) {
  const row = new Array(N).fill(0);
  row[i] = 0;
  if (i < N - 1) row[i + 1] = 2;  // shifts on upper diag
  Anor.push(row);
}
// All eigenvalues are 0. But for non-normal, σ_min(z·I − A) can be small for |z| significantly > 0.
// At z far from origin (say z=2), σ_min should be much smaller than for the normal case
const sigmaNonNormal = sigmaMinComplex(Anor, { re: 2, im: 0 });
// For comparison: normal matrix with eigenvalue at 0 would have σ_min(2I - A) = 2
const Anormal = matIdentity(N).map(r => r.map(v => 0)); // zeros (eigs all 0)
const sigmaNormal = sigmaMinComplex(Anormal, { re: 2, im: 0 });
assertTrue('non-normal σ_min(2I - A) << normal σ_min',
  sigmaNonNormal < sigmaNormal * 0.5,
  `non-normal=${sigmaNonNormal.toExponential(2)}, normal=${sigmaNormal.toExponential(2)}`);

// L4 - boundary
console.log('\n> L4 Boundary');
assertThrows('empty A throws', () => computePseudoSpectrum([], {}));
assertThrows('non-square A throws',
  () => computePseudoSpectrum([[1, 2]], { reRange: [-1,1], imRange: [-1,1], npts: 5, epsilons: [0.1] }));
assertThrows('npts < 2 throws',
  () => computePseudoSpectrum(A, { reRange: [-1,1], imRange: [-1,1], npts: 1, epsilons: [0.1] }));
assertThrows('missing reRange throws',
  () => computePseudoSpectrum(A, { imRange: [-1,1], npts: 10, epsilons: [0.1] }));

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All E4 Pseudo-spectrum checks passed');
  process.exit(0);
} else {
  console.log(`${failed} E4 check(s) FAILED`);
  process.exit(1);
}
