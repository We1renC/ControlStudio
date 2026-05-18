#!/usr/bin/env node
// verify_p15_sysid.mjs — System Identification (ARX) verification
import { identifyARX, autoARXOrder } from '../js/control/sysid.js';
import { setSeed, randn } from '../js/math/rng.js';

let failed = 0;
function ok(label, cond, info='') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${info ? ': ' + info : ''}`);
  if (!cond) failed++;
}
function near(label, a, b, tol = 1e-3) {
  ok(`${label} ≈ ${b.toFixed(4)}`, Math.abs(a - b) < tol, `got ${a.toFixed(4)}`);
}

console.log('\n=== P15-01: ARX identification — recover known plant ===\n');

// True plant: y[k] = 0.7 y[k-1] + 0.4 u[k-1]  (ARX(1,1,1) with a_1=-0.7, b_1=0.4)
// Note: y[k] = -a_1 y[k-1] + b_1 u[k-1]  → so a_1 = -0.7 (storage)
// Or equivalently: A(z⁻¹) = 1 - 0.7 z⁻¹, B(z⁻¹) = 0.4 z⁻¹
{
  setSeed(42);
  const N = 500;
  const u = Array.from({ length: N }, (_, k) => (k < 5 ? 0 : Math.sin(0.3 * k) + 0.3 * randn()));
  const y = new Array(N).fill(0);
  for (let k = 1; k < N; k++) y[k] = 0.7 * y[k - 1] + 0.4 * u[k - 1];

  const model = identifyARX(u, y, 1, 1, 1, 0.1);
  // Storage: a = [1, a_1] where a_1 = -0.7
  near('a_1 ≈ −0.7', model.a[1], -0.7, 0.01);
  // Storage: b = [0, b_1] (leading zero for nk=1)
  near('b_1 ≈ 0.4', model.b[1], 0.4, 0.01);
  ok('fit% > 95', model.fitPercent > 95, `${model.fitPercent.toFixed(2)}%`);
}

console.log('\n=== P15-01: ARX with noise ===\n');
// Noisy data — should still recover approximately
{
  setSeed(7);
  const N = 800;
  const u = Array.from({ length: N }, () => randn());
  const y = new Array(N).fill(0);
  for (let k = 1; k < N; k++) y[k] = -0.5 * y[k - 1] + 0.3 * u[k - 1] + 0.05 * randn();
  const model = identifyARX(u, y, 1, 1, 1, 1.0);
  // True a_1 = 0.5 (since y[k] + 0.5 y[k-1] = 0.3 u[k-1])
  near('a_1 ≈ 0.5 (noisy)', model.a[1], 0.5, 0.05);
  near('b_1 ≈ 0.3 (noisy)', model.b[1], 0.3, 0.05);
  ok('fit% > 80', model.fitPercent > 80, `${model.fitPercent.toFixed(2)}%`);
}

console.log('\n=== P15-01: ARX(2,2) recovery ===\n');
{
  setSeed(101);
  const N = 1000;
  const u = Array.from({ length: N }, (_, k) => (k > 10 ? randn() : 0));
  const y = new Array(N).fill(0);
  // True: y[k] = 0.6 y[k-1] - 0.2 y[k-2] + 0.5 u[k-1] + 0.1 u[k-2]
  for (let k = 2; k < N; k++) {
    y[k] = 0.6 * y[k - 1] - 0.2 * y[k - 2] + 0.5 * u[k - 1] + 0.1 * u[k - 2];
  }
  const model = identifyARX(u, y, 2, 2, 1, 1.0);
  near('a_1 ≈ −0.6', model.a[1], -0.6, 0.01);
  near('a_2 ≈ 0.2', model.a[2], 0.2, 0.01);
  near('b_1 ≈ 0.5', model.b[1], 0.5, 0.01);
  near('b_2 ≈ 0.1', model.b[2], 0.1, 0.01);
}

console.log('\n=== P15-01: autoARXOrder picks correct order via AIC ===\n');
{
  setSeed(13);
  const N = 600;
  const u = Array.from({ length: N }, () => randn());
  const y = new Array(N).fill(0);
  for (let k = 1; k < N; k++) y[k] = 0.6 * y[k - 1] + 0.5 * u[k - 1];
  const { best } = autoARXOrder(u, y, { naMax: 3, nbMax: 3 });
  ok('auto picks na=1 or 2', best.order.na <= 2, `na=${best.order.na}, nb=${best.order.nb}, AIC=${best.aic.toFixed(1)}`);
  ok('auto fit% > 90', best.fitPercent > 90, `${best.fitPercent.toFixed(2)}%`);
}

console.log('');
if (failed === 0) console.log('P15-01 (ARX): all checks passed');
else { console.log(`P15-01 (ARX): ${failed} FAILED`); process.exitCode = 1; }
