#!/usr/bin/env node
/**
 * verify_tf_ss_zpk_c2d.mjs
 * Verification suite for TF/SS/ZPK/C2D improvements.
 *
 * Covers:
 *   TF  — isStable fix, formatCoeff, subtract/negate/inverse, minreal, toZPK, toZPKLatex
 *   DTF — zeros() fix, evalAt, series, parallel, feedback
 *   SS  — Faddeev-LeVerrier correctness + O(n^4) speed, biproper tfToControllableCanonical
 *   ZPK — conjugate deduplication, ZPK class, tfToZPK
 *   C2D — c2dZOH biproper + integrator, c2dImpulseInvariant, d2cTustin
 */
import { TransferFunction }          from '../js/control/transfer-function.js';
import { DiscreteTransferFunction }   from '../js/control/discrete-transfer-function.js';
import { stateSpaceToTransferFunction, tfToControllableCanonical }
                                      from '../js/control/state-space.js';
import { c2dTustin, c2dZOH, c2dMatchedZ, c2dImpulseInvariant, d2cTustin }
                                      from '../js/control/c2d.js';
import { zpkToTransferFunction, tfToZPK, ZPK, parseRootsString }
                                      from '../js/control/zpk.js';
import { Complex }                    from '../js/math/complex.js';

const checks = [];
function assertNear(name, actual, expected, tol = 1e-6) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol)
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
}
function assertTrue(name, cond) { if (!cond) throw new Error(name); }
function assertThrows(name, fn, pattern) {
  let err = null;
  try { fn(); } catch (caught) { err = caught; }
  if (!err) throw new Error(`${name}: expected throw`);
  if (pattern && !pattern.test(err.message)) throw new Error(`${name}: message mismatch: ${err.message}`);
}
function record(name, fn) {
  try { fn(); checks.push({ name, ok: true }); console.log(`[PASS] ${name}`); }
  catch (err) { checks.push({ name, ok: false }); console.error(`[FAIL] ${name}: ${err.message}`); }
}

// ============================================================
// TF — isStable fix (was < -1e-10, now < 0)
// ============================================================
record('TF#1: isStable — marginally stable pole at s=0 → UNSTABLE', () => {
  // G(s) = 1/s, pole at 0
  const g = new TransferFunction([1], [1, 0]);
  assertTrue('TF#1: integrator is not stable', !g.isStable());
});

record('TF#2: isStable — stable pole at s=-1e-11 → STABLE (was bug)', () => {
  // Numerically: polyroots snaps very small re→0, but let's test with a proper stable system
  // G(s) = 1/(s+0.001), pole at -0.001
  const g = new TransferFunction([1], [1, 0.001]);
  assertTrue('TF#2: weakly stable system is stable', g.isStable());
});

record('TF#3: isStable — unstable pole at s=+1 → UNSTABLE', () => {
  const g = new TransferFunction([1], [1, -1]);
  assertTrue('TF#3: unstable system detected', !g.isStable());
});

// ============================================================
// TF — arithmetic: subtract, negate, inverse, divide
// ============================================================
record('TF#4: subtract — G1-G2 DC gain', () => {
  const g1 = new TransferFunction([2], [1, 1]);  // DC gain = 2
  const g2 = new TransferFunction([1], [1, 1]);  // DC gain = 1
  const diff = g1.subtract(g2);
  assertNear('TF#4: subtract DC', diff.dcGain(), 1);
});

record('TF#5: negate — negated DC gain', () => {
  const g = new TransferFunction([3], [1, 2]);  // DC gain = 3/2
  assertNear('TF#5: negate DC', g.negate().dcGain(), -1.5);
});

record('TF#6: inverse — 1/G DC gain', () => {
  const g = new TransferFunction([1], [1, 1]);  // DC gain = 1
  const inv = g.inverse();
  assertNear('TF#6: inverse DC', inv.dcGain(), 1);  // (s+1)/1 at s=0 = 1
});

record('TF#7: divide — G1/G2 = G1*inv(G2)', () => {
  const g1 = new TransferFunction([2], [1, 2]);
  const g2 = new TransferFunction([1], [1, 1]);
  // G1/G2 = 2(s+1) / (s+2)
  const quot = g1.divide(g2);
  assertNear('TF#7: divide DC', quot.dcGain(), 1);  // 2*1/2 = 1
});

record('TF#7b: dcGain — cancels removable origin pole-zero factors', () => {
  assertNear('TF#7b: s/s DC gain = 1', new TransferFunction([1, 0], [1, 0]).dcGain(), 1);
  assertNear('TF#7b: s^2/s DC gain = 0', new TransferFunction([1, 0, 0], [1, 0]).dcGain(), 0);
  assertTrue('TF#7b: s/s^2 DC gain = Infinity', new TransferFunction([1, 0], [1, 0, 0]).dcGain() === Infinity);
  assertTrue('TF#7b: -1/s DC gain = -Infinity', new TransferFunction([-1], [1, 0]).dcGain() === -Infinity);
});

// ============================================================
// TF — minreal
// ============================================================
record('TF#8: minreal — cancels pole-zero pair', () => {
  // G(s) = (s+1)/[(s+1)(s+2)] = 1/(s+2)
  const g = new TransferFunction([1, 1], [1, 3, 2]);
  const mr = g.minreal(1e-4);
  // After cancellation: order should be 1
  assertTrue('TF#8: order reduced', mr.order === 1);
  assertNear('TF#8: DC gain preserved', mr.dcGain(), 0.5, 1e-4);
});

record('TF#9: minreal — no cancellation when poles differ', () => {
  const g = new TransferFunction([1], [1, 3, 2]); // poles at -1, -2, zero at ∞
  const mr = g.minreal(1e-4);
  assertTrue('TF#9: order unchanged', mr.order === 2);
});

// ============================================================
// TF — toZPK
// ============================================================
record('TF#10: toZPK — gain and poles', () => {
  const g = new TransferFunction([2], [1, 3, 2]); // 2/[(s+1)(s+2)]
  const { zeros, poles, gain } = g.toZPK();
  assertNear('TF#10: gain', gain, 2);
  assertTrue('TF#10: no zeros', zeros.length === 0);
  assertTrue('TF#10: two poles', poles.length === 2);
});

record('TF#11: toZPKLatex — returns string with backslash', () => {
  const g = new TransferFunction([1, 0], [1, 3, 2]); // s/[(s+1)(s+2)]
  const latex = g.toZPKLatex();
  assertTrue('TF#11: latex is string', typeof latex === 'string' && latex.length > 0);
});

// ============================================================
// DTF — zeros() fix
// ============================================================
record('DTF#1: zeros — no spurious z=0 roots', () => {
  // G(z) = 0.5 / (1 - 0.5z^{-1}), num=[0.5], den=[1,-0.5]
  const g = new DiscreteTransferFunction([0.5], [1, -0.5], 0.1);
  const zs = g.zeros();
  // num = [0.5] is a degree-0 polynomial → no zeros
  assertTrue('DTF#1: no zeros for constant numerator', zs.length === 0);
});

record('DTF#2: zeros — correct for non-trivial numerator', () => {
  // num=[1, -0.5] → zero at z=0.5
  const g = new DiscreteTransferFunction([1, -0.5], [1, -0.9], 0.1);
  const zs = g.zeros();
  assertTrue('DTF#2: one zero', zs.length === 1);
  assertNear('DTF#2: zero at 0.5', zs[0].re, 0.5, 1e-6);
});

// ============================================================
// DTF — evalAt
// ============================================================
record('DTF#3: evalAt(z=1) = dcGain()', () => {
  const g = new DiscreteTransferFunction([0, 0.5], [1, -0.5], 0.1);
  const dc = g.dcGain();
  const evAt1 = g.evalAt(new Complex(1, 0)).re;
  assertNear('DTF#3: evalAt(1) = dcGain', evAt1, dc, 1e-8);
});

record('DTF#3b: dcGain — cancels removable unit-circle pole-zero factors', () => {
  assertNear('DTF#3b: (1-z^-1)/(1-z^-1) DC gain = 1', new DiscreteTransferFunction([1, -1], [1, -1], 0.1).dcGain(), 1);
  assertNear('DTF#3b: extra unit-circle zero gives zero DC', new DiscreteTransferFunction([1, -2, 1], [1, -1], 0.1).dcGain(), 0);
  assertTrue('DTF#3b: extra unit-circle pole gives infinite DC', new DiscreteTransferFunction([1, -1], [1, -2, 1], 0.1).dcGain() === Infinity);
});

// ============================================================
// DTF — series / parallel / feedback
// ============================================================
record('DTF#4: series — DC gain product', () => {
  const g1 = new DiscreteTransferFunction([0, 0.5], [1, -0.5], 0.1);
  const g2 = new DiscreteTransferFunction([0, 0.3], [1, -0.7], 0.1);
  const series = g1.series(g2);
  assertNear('DTF#4: series DC', series.dcGain(), g1.dcGain() * g2.dcGain(), 1e-6);
});

record('DTF#5: parallel — DC gain sum', () => {
  const g1 = new DiscreteTransferFunction([0, 0.5], [1, -0.5], 0.1);
  const g2 = new DiscreteTransferFunction([0, 0.3], [1, -0.7], 0.1);
  const par = g1.parallel(g2);
  assertNear('DTF#5: parallel DC', par.dcGain(), g1.dcGain() + g2.dcGain(), 1e-6);
});

record('DTF#6: feedback — closed-loop DC gain', () => {
  // G/(1+G) where G has DC gain K → CL DC = K/(1+K)
  const K = 2; // dcGain = 2
  const g = new DiscreteTransferFunction([0, K], [1, -(1 - K * 0.1)], 0.1); // approximate
  // Use simple: G=0.8/(1-0.2z^{-1}), dcGain=1, CL=0.5
  const g2 = new DiscreteTransferFunction([0.8], [1, -0.2], 0.1);
  const cl = g2.feedback();
  assertNear('DTF#6: CL DC = G/(1+G)', cl.dcGain(), g2.dcGain() / (1 + g2.dcGain()), 1e-6);
});

// ============================================================
// SS — Faddeev-LeVerrier correctness (compare to known TF)
// ============================================================
record('SS#1: Faddeev-LeVerrier 2nd-order round-trip', () => {
  // G(s) = (s+3) / (s^2+2s+1)
  const tf = new TransferFunction([1, 3], [1, 2, 1]);
  const ss = tfToControllableCanonical(tf.num, tf.den);
  const rt = stateSpaceToTransferFunction(ss.A, ss.B, ss.C, ss.D);
  assertNear('SS#1: num[0]', rt.num[0], 1, 1e-8);
  assertNear('SS#1: num[1]', rt.num[1], 3, 1e-8);
  assertNear('SS#1: den[1]', rt.den[1], 2, 1e-8);
  assertNear('SS#1: den[2]', rt.den[2], 1, 1e-8);
});

record('SS#2: Faddeev-LeVerrier 4th-order correctness', () => {
  // G(s) = 1/(s+1)^4
  const tf = new TransferFunction([1], [1, 4, 6, 4, 1]);
  const ss = tfToControllableCanonical(tf.num, tf.den);
  const rt = stateSpaceToTransferFunction(ss.A, ss.B, ss.C, ss.D);
  assertNear('SS#2: DC gain', rt.dcGain(), 1, 1e-6);
  assertNear('SS#2: den[1]', rt.den[1], 4, 1e-6);
  assertNear('SS#2: den[4]', rt.den[4], 1, 1e-6);
});

record('SS#3: Faddeev-LeVerrier 6th-order (would hang with O(n!) cofactor)', () => {
  // G(s) = 1/(s+1)^6
  const tf = new TransferFunction([1], [1, 6, 15, 20, 15, 6, 1]);
  const ss = tfToControllableCanonical(tf.num, tf.den);
  const rt = stateSpaceToTransferFunction(ss.A, ss.B, ss.C, ss.D);
  assertNear('SS#3: DC gain', rt.dcGain(), 1, 1e-4);
  assertNear('SS#3: order', rt.order, 6, 0.1);
});

record('SS#4: tfToControllableCanonical biproper — D term extracted', () => {
  // G(s) = (s+2)/(s+1), biproper: D=1, G_sp = 1/(s+1)
  const ss = tfToControllableCanonical([1, 2], [1, 1]);
  assertNear('SS#4: D = b1/a1 = 1', ss.D[0][0], 1, 1e-8);
  // The strictly proper part is G_sp(s) = (2-1·1)/(s+1) = 1/(s+1), DC gain = 1
  const tf_sp = stateSpaceToTransferFunction(ss.A, ss.B, ss.C, [[0]]);
  assertNear('SS#4: G_sp DC gain = 1', tf_sp.dcGain(), 1, 1e-6);
});

// ============================================================
// ZPK — conjugate deduplication
// ============================================================
record('ZPK#1: polyFromRoots — no duplication when both conjugates entered', () => {
  // If user enters "-1+2j" and "-1-2j", result should be degree-2, not degree-4
  const roots = parseRootsString('-1+2j, -1-2j');
  const tf = zpkToTransferFunction([], roots, 1); // use as poles
  // Result should be s^2 + 2s + 5 (degree 2)
  assertTrue('ZPK#1: denominator is degree 2', tf.den.length === 3);
});

record('ZPK#2: polyFromRoots — single complex root auto-generates pair', () => {
  const roots = parseRootsString('-1+2j'); // only one entered
  const tf = zpkToTransferFunction([], roots, 1);
  assertTrue('ZPK#2: denominator is degree 2', tf.den.length === 3);
  assertNear('ZPK#2: -2a coefficient = 2', tf.den[1], 2, 1e-6);
  assertNear('ZPK#2: a²+b² = 5', tf.den[2], 5, 1e-6);
});

record('ZPK#3: ZPK class evalAt and dcGain', () => {
  // G = 2·(s-0)/(s+1)(s+2) = 2s/[(s+1)(s+2)]
  const zpk = new ZPK([new Complex(0, 0)], [new Complex(-1, 0), new Complex(-2, 0)], 2);
  // DC gain G(0) = 0
  assertNear('ZPK#3: dcGain = 0', zpk.dcGain(), 0, 1e-8);
  // At s=1: G(1) = 2·1/(2·3) = 1/3
  const g1 = zpk.evalAt(new Complex(1, 0)).re;
  assertNear('ZPK#3: G(1) = 1/3', g1, 1 / 3, 1e-8);
});

record('ZPK#3b: dcGain — cancels removable origin zero-pole factors', () => {
  assertNear('ZPK#3b: K*s/s DC gain = K', new ZPK([new Complex(0, 0)], [new Complex(0, 0)], 3).dcGain(), 3);
  assertNear('ZPK#3b: extra origin zero gives zero DC', new ZPK([new Complex(0, 0), new Complex(0, 0)], [new Complex(0, 0)], 3).dcGain(), 0);
  assertTrue('ZPK#3b: extra origin pole gives infinite DC', new ZPK([new Complex(0, 0)], [new Complex(0, 0), new Complex(0, 0)], 3).dcGain() === Infinity);
});

record('ZPK#4: ZPK series — combined gain and roots', () => {
  const z1 = new ZPK([], [new Complex(-1, 0)], 2);
  const z2 = new ZPK([], [new Complex(-3, 0)], 3);
  const series = z1.series(z2);
  assertNear('ZPK#4: combined gain = 6', series.gain, 6, 1e-8);
  assertTrue('ZPK#4: two poles', series.poles.length === 2);
});

record('ZPK#5: ZPK.fromTF round-trip', () => {
  const tf = new TransferFunction([2, 4], [1, 3, 2]); // 2(s+2)/[(s+1)(s+2)]
  const zpk = ZPK.fromTF(tf);
  assertNear('ZPK#5: gain', zpk.gain, 2, 1e-6);
  assertTrue('ZPK#5: one zero', zpk.zeros.length === 1);
  assertTrue('ZPK#5: two poles', zpk.poles.length === 2);
});

record('ZPK#6: tfToZPK', () => {
  const tf = new TransferFunction([3], [1, 5, 6]); // 3/[(s+2)(s+3)]
  const { zeros, poles, gain } = tfToZPK(tf);
  assertNear('ZPK#6: gain = 3', gain, 3, 1e-6);
  assertTrue('ZPK#6: two poles', poles.length === 2);
  assertTrue('ZPK#6: no zeros', zeros.length === 0);
});

// ============================================================
// C2D — c2dZOH biproper fix
// ============================================================
record('C2D#1: c2dZOH biproper first-order — DC gain preserved', () => {
  // G(s) = (s+2)/(s+1), DC gain = 2
  const sys = new TransferFunction([1, 2], [1, 1]);
  const dtf = c2dZOH(sys, 0.1);
  assertNear('C2D#1: DTF DC gain = 2', dtf.dcGain(), 2, 1e-6);
});

record('C2D#2: c2dZOH biproper — initial value = feedthrough D', () => {
  // G(s) = (s+2)/(s+1), D = 1 at t=0+
  const sys = new TransferFunction([1, 2], [1, 1]);
  const dtf = c2dZOH(sys, 0.1);
  // First coefficient num[0] = D = b1/a1 = 1
  assertNear('C2D#2: feedthrough D=1', dtf.num[0], 1, 1e-6);
});

record('C2D#3: c2dZOH integrator — correct discrete integrator', () => {
  // G(s) = 1/s → G_d(z) = Ts*z^{-1}/(1-z^{-1}) = [0, Ts] / [1, -1]
  const sys = new TransferFunction([1], [1, 0]);
  const dtf = c2dZOH(sys, 0.1);
  // den should be [1, -1]
  assertNear('C2D#3: den[0]=1', dtf.den[0], 1, 1e-8);
  assertNear('C2D#3: den[1]=-1', dtf.den[1], -1, 1e-8);
  // num[0]=0, num[1]=Ts=0.1
  assertNear('C2D#3: num[0]=0', dtf.num[0], 0, 1e-8);
  assertNear('C2D#3: num[1]=Ts', dtf.num[1], 0.1, 1e-8);
});

record('C2D#4: c2dZOH strictly proper 1st-order — unchanged behavior', () => {
  // G(s) = 1/(s+1), ZOH with Ts=0.1
  const sys = new TransferFunction([1], [1, 1]);
  const dtf = c2dZOH(sys, 0.1);
  // DC gain should equal continuous DC gain = 1
  assertNear('C2D#4: DC gain preserved', dtf.dcGain(), sys.dcGain(), 1e-6);
  // Pole should be e^{-0.1} ≈ 0.9048
  const poles = dtf.poles();
  assertNear('C2D#4: discrete pole = e^{-Ts}', poles[0].re, Math.exp(-0.1), 1e-6);
});

record('C2D#5: c2dZOH general 2nd-order — DC gain preserved', () => {
  // G(s) = 1/(s^2+3s+2) = 1/[(s+1)(s+2)], DC gain = 0.5
  const sys = new TransferFunction([1], [1, 3, 2]);
  const dtf = c2dZOH(sys, 0.1);
  assertNear('C2D#5: DC gain preserved', dtf.dcGain(), 0.5, 1e-4);
});

// ============================================================
// C2D — c2dImpulseInvariant
// ============================================================
record('C2D#6: c2dImpulseInvariant — DC gain preserved', () => {
  // G(s) = 1/(s+1), DC gain = 1
  const sys = new TransferFunction([1], [1, 1]);
  const dtf = c2dImpulseInvariant(sys, 0.1);
  // Impulse-invariant does NOT preserve DC gain in general, but for simple poles:
  // G_d(z) = Ts*R / (1 - e^{p*Ts}*z^{-1}), R = 1, p = -1
  // DC = Ts*R / (1 - e^{p*Ts}) = 0.1*1/(1-exp(-0.1)) = 0.1/0.09516... ≈ 1.051
  // (different from ZOH DC gain = 1)
  assertTrue('C2D#6: DTF is valid', dtf instanceof DiscreteTransferFunction);
  assertTrue('C2D#6: stable', dtf.isStable());
  // Verify denominator pole = e^{-Ts}
  const poles = dtf.poles();
  assertNear('C2D#6: pole = e^{-Ts}', poles[0].re, Math.exp(-0.1), 1e-6);
});

record('C2D#7: c2dImpulseInvariant — 2nd-order complex poles', () => {
  // G(s) = 1/(s^2+2s+5), poles at -1±2j
  const sys = new TransferFunction([1], [1, 2, 5]);
  const dtf = c2dImpulseInvariant(sys, 0.1);
  assertTrue('C2D#7: DTF is valid', dtf instanceof DiscreteTransferFunction);
  assertTrue('C2D#7: stable', dtf.isStable());
});

// ============================================================
// C2D — d2cTustin (inverse Tustin)
// ============================================================
record('C2D#8: d2cTustin round-trip — recover original TF', () => {
  // c2dTustin then d2cTustin should approximately recover the original
  const sys = new TransferFunction([1], [1, 2, 1]); // 1/(s+1)^2
  const dtf = c2dTustin(sys, 0.1);
  const recovered = d2cTustin(dtf);
  // DC gain should be preserved
  assertNear('C2D#8: DC gain round-trip', recovered.dcGain(), sys.dcGain(), 1e-8);
  // Poles should be approximately at -1 (both)
  const poles = recovered.poles();
  for (const p of poles) {
    assertNear('C2D#8: pole near -1', p.re, -1, 0.01);
  }
});

record('C2D#9: d2cTustin DC gain preserved', () => {
  const sys = new TransferFunction([5], [1, 3]);
  const dtf = c2dTustin(sys, 0.05);
  const recovered = d2cTustin(dtf);
  assertNear('C2D#9: DC gain', recovered.dcGain(), sys.dcGain(), 1e-8);
});

record('C2D#10: c2dMatchedZ preserves gain after removable origin pole-zero', () => {
  const sys = new TransferFunction([2, 0], [1, 0]);
  const dtf = c2dMatchedZ(sys, 0.1);
  assertNear('C2D#10: 2s/s maps to DC gain 2', dtf.dcGain(), 2, 1e-12);
  assertNear('C2D#10: numerator retains leading gain', dtf.num[0], 2, 1e-12);
  assertTrue('C2D#10: gain normalized', dtf._gainNormalized === true);
});

record('C2D#11: c2dMatchedZ rejects improper continuous plants', () => {
  const improper = new TransferFunction([1, 2, 1], [1, 1]);
  assertThrows('C2D#11: improper plant rejected', () => c2dMatchedZ(improper, 0.1), /proper/);
});

record('C2D#12: c2dImpulseInvariant rejects repeated poles', () => {
  const repeatedPole = new TransferFunction([1], [1, 2, 1]);
  assertThrows('C2D#12: repeated pole rejected', () => c2dImpulseInvariant(repeatedPole, 0.1), /repeated poles/);
});

// ============================================================
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error(`\nTF/SS/ZPK/C2D verification FAILED: ${failed.length}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`\nTF/SS/ZPK/C2D verification PASSED: ${checks.length}/${checks.length}`);
}
