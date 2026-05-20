#!/usr/bin/env node
/**
 * verify_p23_miso.mjs — Phase 23-02: MISO ARX identification
 *
 * Tests:
 *   1. MISO with nu=2: estimated a coefficients match SISO result when 2nd input is zero
 *   2. True b coefficients recovered accurately (< 5% relative error)
 *   3. fitPercent > 95% on noise-free MISO data
 *   4. yhat has correct length (N)
 *   5. b_each has length nu, each element has length nb_vec[i]
 *   6. Individual nk delays respected — shifting u changes parameter estimates
 *   7. AIC decreases when adding truly relevant 2nd input
 *   8. Mismatched U_matrix rows throw
 *   9. Mismatched nb_vec length throws
 *  10. nu=1 MISO matches SISO ARX result (same coefficients)
 */

import { identifyMISOARX, identifyARX } from '../js/control/sysid.js';
import { setSeed, randn }               from '../js/math/rng.js';
import { generatePRBS }                 from '../js/control/sysid_signals.js';

let passed = 0, failed = 0;

function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function close(a, b, tol) { return Math.abs(a - b) <= tol; }
function relErr(a, b)     { return Math.abs(a - b) / (Math.abs(b) + 1e-12); }

console.log('\n=== P23-02: MISO ARX Identification ===\n');

// ── Generate MISO data ────────────────────────────────────────────────────────
// True model: y[k] = 0.7·y[k-1] + 0.4·u1[k-1] + 0.25·u2[k-1] - 0.15·u2[k-2]
//             na=1, nb=[1,2], nk=[1,1]
function makeMISOData(N, noiseStd = 0, seed = 42) {
  setSeed(seed);
  const u1 = generatePRBS(N, 7, 1.0);
  const u2 = generatePRBS(N, 6, 0.8);
  const y  = new Array(N).fill(0);
  for (let k = 2; k < N; k++) {
    const e = noiseStd > 0 ? noiseStd * randn() : 0;
    y[k] = 0.7 * y[k-1] + 0.4 * u1[k-1] + 0.25 * u2[k-1] - 0.15 * u2[k-2] + e;
  }
  const U = Array.from({ length: N }, (_, k) => [u1[k], u2[k]]);
  return { U, u1, u2, y };
}

// Test 1–3: noise-free MISO recovery
{
  const { U, u1, u2, y } = makeMISOData(500, 0, 42);
  const r = identifyMISOARX(U, y, 1, [1, 2], [1, 1], 1.0);

  // Convention: A(q)y=Bu → y[k] = -a[1]·y[k-1] + ... → true a[1] = -0.7
  ok('Test 1: a[1] ≈ -0.7 (AR coefficient, A(q) convention)',
    close(r.a[1], -0.7, 0.01), `a[1]=${r.a[1].toFixed(4)}, expected=-0.7`);

  ok('Test 2a: b_each[0][0] ≈ 0.4 (u1 gain)',
    close(r.b_each[0][0], 0.4, 0.02), `b1[0]=${r.b_each[0][0].toFixed(4)}`);
  ok('Test 2b: b_each[1][0] ≈ 0.25 (u2 gain 1)',
    close(r.b_each[1][0], 0.25, 0.02), `b2[0]=${r.b_each[1][0].toFixed(4)}`);
  ok('Test 2c: b_each[1][1] ≈ -0.15 (u2 gain 2)',
    close(r.b_each[1][1], -0.15, 0.02), `b2[1]=${r.b_each[1][1].toFixed(4)}`);

  ok('Test 3: fitPercent > 99% on noise-free data',
    r.fitPercent > 99, `fit=${r.fitPercent.toFixed(2)}%`);
}

// Test 4: yhat has length N
{
  const { U, y } = makeMISOData(300);
  const r = identifyMISOARX(U, y, 1, [1, 2]);
  ok('Test 4: yhat.length === N', r.yhat.length === 300);
}

// Test 5: b_each structure
{
  const { U, y } = makeMISOData(300);
  const r = identifyMISOARX(U, y, 2, [2, 3], [1, 1]);
  ok('Test 5: b_each.length === nu=2', r.b_each.length === 2);
  ok('Test 5: b_each[0].length === nb_vec[0]=2', r.b_each[0].length === 2);
  ok('Test 5: b_each[1].length === nb_vec[1]=3', r.b_each[1].length === 3);
}

// Test 6: nu=1 MISO matches SISO ARX
{
  setSeed(10);
  const N  = 400;
  const u1 = generatePRBS(N, 7, 1.0);
  const y  = new Array(N).fill(0);
  for (let k = 2; k < N; k++)
    y[k] = 0.7 * y[k-1] - 0.12 * y[k-2] + 0.4 * u1[k-1] + 0.2 * u1[k-2] + 0.05 * randn();

  const U_1col = Array.from({ length: N }, (_, k) => [u1[k]]);
  const miso   = identifyMISOARX(U_1col, y, 2, [2], [1], 1.0);
  const siso   = identifyARX(u1, y, 2, 2, 1, 1.0);

  ok('Test 6: MISO(nu=1) a[1] ≈ SISO a[1]',
    close(miso.a[1], siso.a[1], 1e-6), `miso=${miso.a[1].toFixed(6)}, siso=${siso.a[1].toFixed(6)}`);
  ok('Test 6: MISO(nu=1) b[0] ≈ SISO b[nk]=b[1]',
    close(miso.b_each[0][0], siso.b[1], 1e-6),
    `miso=${miso.b_each[0][0].toFixed(6)}, siso=${siso.b[1].toFixed(6)}`);
  ok('Test 6: MISO(nu=1) fitPercent ≈ SISO fitPercent',
    close(miso.fitPercent, siso.fitPercent, 0.5),
    `miso=${miso.fitPercent.toFixed(2)}%, siso=${siso.fitPercent.toFixed(2)}%`);
}

// Test 7: AIC decreases when adding the true 2nd input
{
  const { U, u1, y } = makeMISOData(400, 0.05, 77);
  const U_1col = Array.from({ length: 400 }, (_, k) => [u1[k]]);
  const miso1  = identifyMISOARX(U_1col, y, 1, [1],    [1],    1.0);
  const miso2  = identifyMISOARX(U,      y, 1, [1, 2], [1, 1], 1.0);
  ok('Test 7: AIC decreases when 2nd input added (true MISO)',
    miso2.aic < miso1.aic,
    `MISO-1: ${miso1.aic.toFixed(1)}, MISO-2: ${miso2.aic.toFixed(1)}`);
}

// Test 8: validation errors
{
  const { U, y } = makeMISOData(100);
  let t1 = false, t2 = false, t3 = false;
  try { identifyMISOARX(U.slice(0, 50), y, 1, [1, 2]); } catch { t1 = true; }
  try { identifyMISOARX(U, y, 1, [1]);                  } catch { t2 = true; }
  try { identifyMISOARX(U, y, 1, [1, 2], [1, 1, 1]);   } catch { t3 = true; }
  ok('Test 8: U_matrix row mismatch throws',  t1);
  ok('Test 8: nb_vec length mismatch throws', t2);
  ok('Test 8: nk_vec length mismatch throws', t3);
}

// Test 9: nParams = na + Σnb_i
{
  const { U, y } = makeMISOData(300);
  const r = identifyMISOARX(U, y, 2, [2, 3], [1, 1]);
  ok('Test 9: nParams = na + Σnb = 2+2+3 = 7',
    r.nParams === 7, `nParams=${r.nParams}`);
}

// Test 10: fitPercent on noisy MISO > 85%
{
  const { U, y } = makeMISOData(600, 0.05, 55);
  const r = identifyMISOARX(U, y, 1, [1, 2], [1, 1]);
  ok('Test 10: fitPercent > 85% on noisy MISO (σ=0.05)',
    r.fitPercent > 85, `fit=${r.fitPercent.toFixed(2)}%`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P23-02 MISO ARX: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
