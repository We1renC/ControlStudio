#!/usr/bin/env node
// verify_p14_delay.mjs — Time delay (Padé) and delay margin tests
import { padeCoefficients, padeApprox, applyDelay, delayMargin, delayPhase, smithPredictor } from '../js/control/delay.js';
import { TransferFunction } from '../js/control/transfer-function.js';
import { Complex } from '../js/math/complex.js';

let failed = 0;
function near(label, a, b, tol = 1e-9) {
  const ok = Math.abs(a - b) < tol;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}: got ${a}, expected ≈${b}`);
  if (!ok) failed++;
}
function approxArr(label, a, b, tol = 1e-9) {
  const ok = a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < tol);
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  if (!ok) failed++;
}
function throwsLike(label, fn, pattern) {
  let err = null;
  try { fn(); } catch (caught) { err = caught; }
  const ok = err && (!pattern || pattern.test(err.message));
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}: ${err ? err.message : 'no throw'}`);
  if (!ok) failed++;
}

console.log('\n=== P14-01: Padé approximation ===\n');

// 1st-order Padé of e^{-sT}: (1 − Ts/2) / (1 + Ts/2)
{
  const T = 0.5;
  const { num, den } = padeCoefficients(T, 1);
  // p(s) low-order: [1, -T/2] → high-order first: [-T/2, 1] = [-0.25, 1]
  // q(s) low-order: [1,  T/2] → high-order first: [ T/2, 1] = [ 0.25, 1]
  approxArr('1st-order Padé num (T=0.5)', num, [-0.25, 1]);
  approxArr('1st-order Padé den (T=0.5)', den, [0.25, 1]);
}

// 2nd-order Padé of e^{-sT}: (1 − Ts/2 + (Ts)²/12) / (1 + Ts/2 + (Ts)²/12)
{
  const T = 1.0;
  const { num, den } = padeCoefficients(T, 2);
  // low-order: [1, -1/2, 1/12]
  // high-order first: [1/12, -1/2, 1]
  approxArr('2nd-order Padé num (T=1)', num, [1/12, -1/2, 1], 1e-9);
  approxArr('2nd-order Padé den (T=1)', den, [1/12,  1/2, 1], 1e-9);
}

// e^{-jωT} should match Padé at DC: gain=1, phase=0
{
  const pade = padeApprox(0.5, 2);
  const dc = pade.evalAt(new Complex(0, 0));
  near('Padé DC gain real part', dc.re, 1, 1e-12);
  near('Padé DC gain imag part', dc.im, 0, 1e-12);
}

// Apply delay to a plant: 1/(s+1) with T=0.2
{
  const G = new TransferFunction([1], [1, 1]);
  const Gd = applyDelay(G, 0.2, 2);
  // Resulting TF should be 3rd-order in s
  near('plant·Padé order (s³)', Gd.den.length - 1, 3);
}

// Zero delay: returns the same plant
{
  const G = new TransferFunction([1], [1, 1]);
  const Gd = applyDelay(G, 0, 2);
  approxArr('zero-delay numerator', Gd.num, [1]);
  approxArr('zero-delay denominator', Gd.den, [1, 1]);
}

throwsLike('invalid delay rejects NaN', () => applyDelay(new TransferFunction([1], [1, 1]), NaN, 2), /delaySeconds/);
throwsLike('delayPhase rejects invalid omega', () => delayPhase(NaN, 0.2), /omega/);
near('delayPhase(ω=2,T=0.5)', delayPhase(2, 0.5), -1, 1e-12);

console.log('\n=== P14-01: Delay Margin ===\n');

// PM = 60°, ω_gc = 1 rad/s → DM = 60·π/180 / 1 = 1.0472 s
near('DM(60°, ω=1) = π/3', delayMargin(60, 1), Math.PI / 3, 1e-10);
near('DM(45°, ω=2)', delayMargin(45, 2), (45 * Math.PI / 180) / 2, 1e-10);
near('DM(non-positive PM) clamps to 0', delayMargin(-5, 2), 0, 1e-12);
// Edge cases
{
  const v = delayMargin(60, 0);
  const ok = Number.isNaN(v);
  console.log(`${ok ? '[PASS]' : '[FAIL]'} DM invalid ω=0 returns NaN: got ${v}`);
  if (!ok) failed++;
}
{
  const v = delayMargin(Infinity, 1);
  const ok = v === Infinity;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} DM infinite PM remains Infinity: got ${v}`);
  if (!ok) failed++;
}

console.log('\n=== P14-01: Smith Predictor ===\n');

// Smith predictor produces L_eff = C·G_m
{
  const C = new TransferFunction([1], [1]);      // P controller K=1
  const Gm = new TransferFunction([1], [1, 1]);  // 1/(s+1)
  const { effectiveLoop, description } = smithPredictor(C, Gm);
  approxArr('Smith L_eff numerator', effectiveLoop.num, [1]);
  approxArr('Smith L_eff denominator', effectiveLoop.den, [1, 1]);
  const ok = typeof description === 'string' && description.length > 20;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} Smith predictor description: "${description.slice(0,60)}..."`);
  if (!ok) failed++;
}

console.log('');
if (failed === 0) console.log('P14-01 (delay): all checks passed');
else { console.log(`P14-01 (delay): ${failed} check(s) FAILED`); process.exitCode = 1; }
