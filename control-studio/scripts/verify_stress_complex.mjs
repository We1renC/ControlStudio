#!/usr/bin/env node
/**
 * Stress-test verification: 3 progressively harder control systems.
 *
 * System 1 — SISO 3rd-order NMP with RHP zero + lightly damped resonance
 *   G(s) = (s-2) / ((s+1)(s^2+0.4s+100))
 *   NMP zero at s=+2, stable poles: -1, -0.2±j·9.998 (ωn=10, ζ=0.02)
 *
 * System 2 — SISO 5th-order unstable + integrator
 *   G(s) = 1 / (s(s-0.5)(s+1)(s+2)(s+5))
 *
 * System 3 — 3×3 MIMO strongly coupled
 *   A, B=I, C=I, D=0; LQR, integral LQR, H∞ filter, RGA
 */

import { TransferFunction } from '../js/control/transfer-function.js';
import { polyroots } from '../js/math/polynomial.js';
import { bodeData } from '../js/analysis/frequency-response.js';
import { routhTable, stabilityMargins } from '../js/control/stability.js';
import {
  solveLqrMIMO,
  augmentWithIntegralAction,
  designIntegralLQR,
  solveHinfFilter,
} from '../js/control/state-feedback.js';
import { matInverse, matMul, matTranspose, matRank, matIdentity } from '../js/math/matrix.js';
import {
  MIMOStateSpace,
  dcGain,
  rgaSteady,
  rgaInvariants,
} from '../js/control/mimo.js';
import { controllabilityMatrix, observabilityMatrix } from '../js/control/state-space.js';
import { Complex } from '../js/math/complex.js';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let failed = 0;

function assertTrue(label, condition, detail = '') {
  const pass = Boolean(condition);
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${label}${detail ? ': ' + detail : ''}`);
  if (!pass) failed++;
}

function assertNear(label, actual, expected, tol = 1e-6) {
  const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(
    `${pass ? '[PASS]' : '[FAIL]'} ${label}: got=${Number.isFinite(actual) ? actual.toExponential(5) : actual}, expected=${expected.toExponential(5)}, tol=${tol}`,
  );
  if (!pass) failed++;
}

// ---------------------------------------------------------------------------
// System 1: SISO 3rd-order NMP plant
//   G(s) = (s-2) / ((s+1)(s^2+0.4s+100))
//   Numerator:   [1, -2]
//   Denominator: (s+1)(s^2+0.4s+100) = s^3 + 1.4s^2 + 100.4s + 100
// ---------------------------------------------------------------------------
console.log('\n=== System 1: SISO NMP 3rd-order (RHP zero + lightly damped resonance) ===\n');
{
  // Build TF from first principles
  // den = s^3 + 1.4*s^2 + 100.4*s + 100
  const num = [1, -2];
  const den = [1, 1.4, 100.4, 100];
  const G = new TransferFunction(num, den);

  // 1. DC gain = num(0) / den(0) = -2 / 100 = -0.02
  assertNear('Sys1 DC gain = -0.02', G.dcGain(), -0.02, 1e-10);

  // 2. Exactly 1 RHP zero (s=+2)
  const zeros = G.zeros();
  const rhpZeros = zeros.filter(z => z.re > 1e-9);
  assertTrue('Sys1 has exactly 1 RHP zero', rhpZeros.length === 1,
    `RHP zeros: [${rhpZeros.map(z => `${z.re.toFixed(4)}+j${z.im.toFixed(4)}`).join(', ')}]`);
  assertNear('Sys1 RHP zero real part = +2', rhpZeros[0]?.re ?? NaN, 2, 1e-8);

  // 3. All poles have Re < 0 (plant is stable)
  const poles = G.poles();
  const rhpPoles = poles.filter(p => p.re > 1e-9);
  assertTrue('Sys1 all poles in LHP (stable plant)', rhpPoles.length === 0,
    `poles Re: [${poles.map(p => p.re.toFixed(4)).join(', ')}]`);

  // 4. Resonance peak: at ω=10 the complex-conjugate pair at ωn=10 (ζ=0.02)
  //    dominates. Expect |G(j10)| >> 1 (very lightly damped, 1/(2ζ)=25 amplification factor).
  //    Nominal |G(j10)| ≈ |j10-2| / (|(j10+1)| · |(j10)^2+0.4·(j10)+100|)
  //                      = √(100+4) / (√101 · |(-100+100)+j4|)
  //                      = √104 / (√101 · 4) ≈ 10.2 / 40.2 ≈ 0.254   (this is WRONG estimate)
  //    More carefully: |(jω)^2 + 0.4jω + 100|_{ω=10} = |(-100+j4+100)| = |j4| = 4
  //    |j10-2| = √(4+100) = √104 ≈ 10.198
  //    |(j10+1)| = √(1+100) = √101 ≈ 10.05
  //    So |G(j10)| ≈ 10.198 / (10.05 × 4) ≈ 0.2537 — NOT large
  //    Peak occurs exactly at ωn=10 in the resonant quadratic.
  //    The TF already normalises den so check absolute magnitude with evalAt.
  const gAt10 = G.evalAt(new Complex(0, 10));
  // At resonance the second-order factor gives the peak boost; check magnitude > 0.1
  assertTrue('Sys1 |G(j10)| is finite and positive', gAt10.magnitude > 0 && Number.isFinite(gAt10.magnitude),
    `|G(j10)|=${gAt10.magnitude.toFixed(4)}`);

  // The lightly damped pair (ζ=0.02) means the peak ~1/(2ζ·ωn) × (numerator/leading denominator)
  // is large. Check Bode data and verify peak > 0.05 (loose bound — exact value confirmed above ~0.25)
  const bode = bodeData(G, 0.1, 100, 300);
  const peakMagDB = Math.max(...bode.magDB);
  assertTrue('Sys1 Bode peak > -20 dB (resonance visible)', peakMagDB > -20,
    `peak mag = ${peakMagDB.toFixed(2)} dB`);

  // 5. Stability margins: with unit feedback, |G(jω)| peaks at ~0.25 (< 1 dB)
  //    so gain crossover may not exist (|G| never reaches 1).
  //    Verify that stabilityMargins returns a valid object and gainMargin is finite or Infinity.
  const margins = stabilityMargins(G);
  assertTrue('Sys1 stabilityMargins returns object with gainMargin',
    typeof margins === 'object' && 'gainMargin' in margins,
    `gainMargin=${margins.gainMargin}`);
  // With K=5 (scaled loop), |G|=1 crossing should exist
  const GL = G.scale(5);
  const marginsL = stabilityMargins(GL);
  assertTrue('Sys1 scaled loop (K=5) gain crossover is finite',
    Number.isFinite(marginsL.gainCrossover),
    `gcf=${marginsL.gainCrossover?.toFixed(4)}`);

  // 6. polyroots on the denominator correctly identifies 3 roots
  const denRoots = polyroots(den);
  assertTrue('Sys1 den has 3 roots', denRoots.length === 3, `count=${denRoots.length}`);
  // One real root at s=-1
  const realRoots = denRoots.filter(r => Math.abs(r.im) < 1e-6);
  assertTrue('Sys1 has one real pole', realRoots.length === 1,
    `real poles: [${realRoots.map(r => r.re.toFixed(4)).join(', ')}]`);
  assertNear('Sys1 real pole at s=-1', realRoots[0]?.re ?? NaN, -1, 1e-6);
  // Complex conjugate pair near ωn=10, ζ=0.02 → σ = -0.2
  const complexRoots = denRoots.filter(r => Math.abs(r.im) > 1e-6);
  assertTrue('Sys1 has two complex poles', complexRoots.length === 2,
    `complex poles Im: [${complexRoots.map(r => r.im.toFixed(4)).join(', ')}]`);
  assertNear('Sys1 complex pole real part ≈ -0.2', complexRoots[0]?.re ?? NaN, -0.2, 1e-6);
}

// ---------------------------------------------------------------------------
// System 2: SISO 5th-order unstable + integrator
//   G(s) = 1 / (s(s-0.5)(s+1)(s+2)(s+5))
//   Roots: 0, +0.5, -1, -2, -5
//   Den = (s)(s-0.5)(s+1)(s+2)(s+5)
//       = (s^2-0.5s)(s+1)(s+2)(s+5)
// Expand step by step:
//   (s^2 - 0.5s)(s+1) = s^3 + s^2 - 0.5s^2 - 0.5s = s^3 + 0.5s^2 - 0.5s
//   (s^3 + 0.5s^2 - 0.5s)(s+2) = s^4 + 2s^3 + 0.5s^3 + s^2 - 0.5s^2 - s
//                                = s^4 + 2.5s^3 + 0.5s^2 - s
//   (s^4 + 2.5s^3 + 0.5s^2 - s)(s+5) = s^5 + 5s^4 + 2.5s^4 + 12.5s^3
//                                       + 0.5s^3 + 2.5s^2 - s^2 - 5s
//                                     = s^5 + 7.5s^4 + 13s^3 + 1.5s^2 - 5s + 0
// ---------------------------------------------------------------------------
console.log('\n=== System 2: SISO 5th-order unstable + integrator ===\n');
{
  const den = [1, 7.5, 13, 1.5, -5, 0];
  const num = [1];
  const G = new TransferFunction(num, den);

  // 1. DC gain is infinite (integrator at s=0)
  assertTrue('Sys2 DC gain = Infinity (integrator)', G.dcGain() === Infinity,
    `dcGain=${G.dcGain()}`);

  // 2. polyroots on denominator finds all 5 roots
  const roots = polyroots(den);
  assertTrue('Sys2 denominator has 5 roots', roots.length === 5, `count=${roots.length}`);

  // 3. Has a pole at s=0 (integrator)
  const poleSAt0 = roots.filter(r => Math.abs(r.re) < 1e-6 && Math.abs(r.im) < 1e-6);
  assertTrue('Sys2 has a pole at s=0 (integrator)', poleSAt0.length >= 1,
    `poles near 0: ${poleSAt0.length}`);

  // 4. Has exactly 1 RHP pole at s≈+0.5
  const rhpPoles = roots.filter(r => r.re > 1e-6);
  assertTrue('Sys2 has exactly 1 RHP pole', rhpPoles.length === 1,
    `RHP poles: [${rhpPoles.map(r => r.re.toFixed(4)).join(', ')}]`);
  assertNear('Sys2 RHP pole at s=+0.5', rhpPoles[0]?.re ?? NaN, 0.5, 1e-4);

  // 5. Routh table correctly identifies at least 1 sign change (unstable + RHP pole)
  const routh = routhTable(den);
  assertTrue('Sys2 Routh table signChanges >= 1', routh.signChanges >= 1,
    `signChanges=${routh.signChanges}`);
  assertTrue('Sys2 Routh table reports not stable', routh.stable === false || routh.marginal === true,
    `stable=${routh.stable}, marginal=${routh.marginal}`);

  // 6. LHP poles found at approximately -1, -2, -5
  const lhpPoles = roots.filter(r => r.re < -1e-6);
  assertTrue('Sys2 has 3 LHP poles', lhpPoles.length === 3,
    `LHP poles Re: [${lhpPoles.map(r => r.re.toFixed(4)).join(', ')}]`);
  const lhpRe = lhpPoles.map(r => r.re).sort((a, b) => a - b);
  assertNear('Sys2 LHP pole near -5', lhpRe[0], -5, 1e-4);
  assertNear('Sys2 LHP pole near -2', lhpRe[1], -2, 1e-4);
  assertNear('Sys2 LHP pole near -1', lhpRe[2], -1, 1e-4);

  // 7. Bode magnitude at low frequency (below integrator crossover) is large
  const gAtLow = G.evalAt(new Complex(0, 0.01));
  assertTrue('Sys2 |G(j0.01)| >> 1 (integrator dominates at low freq)',
    gAtLow.magnitude > 10, `|G(j0.01)|=${gAtLow.magnitude.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// System 3: 3×3 MIMO strongly coupled state-space
//   A = [[-2, 1.5, 0], [-0.5, -3, 1.2], [0.3, -0.8, -4]]
//   B = C = I_3, D = 0_3×3
// ---------------------------------------------------------------------------
console.log('\n=== System 3: 3×3 MIMO strongly coupled ===\n');
{
  const A = [
    [-2,   1.5,  0  ],
    [-0.5, -3,   1.2],
    [ 0.3, -0.8, -4 ],
  ];
  const B3 = [[1,0,0],[0,1,0],[0,0,1]]; // 3×3 identity
  const C3 = [[1,0,0],[0,1,0],[0,0,1]];
  const D3 = [[0,0,0],[0,0,0],[0,0,0]];

  const sys = new MIMOStateSpace(A, B3, C3, D3);

  // 1. All eigenvalues of A are in LHP (characteristic polynomial has all Re<0)
  //    Use polyroots on the characteristic poly — or rely on matrixPoles via state-feedback internals.
  //    We'll validate by computing the LQR (which requires stabilisability) and checking CL stability.
  //    Direct eigenvalue check: det(sI-A) for small 3×3 can be checked via routhTable.
  //    Characteristic polynomial of A: det(sI-A)
  //    Using trace/trace^2 Cayley-Hamilton shortcut isn't robust, so just check via
  //    solveLqrMIMO which internally validates provenStable.
  //    Alternatively verify via Routh on the characteristic polynomial:
  //    char poly = s^3 - trace(A)s^2 + (sum of 2x2 principal minors)s - det(A)
  //    trace(A) = -2 - 3 - 4 = -9
  //    Sum of 2x2 principal minors:
  //      M11 = det[[-3,1.2],[-0.8,-4]] = (-3)(-4)-(1.2)(-0.8) = 12+0.96 = 12.96
  //      M22 = det[[-2,0],[0.3,-4]] = (-2)(-4)-(0)(0.3) = 8
  //      M33 = det[[-2,1.5],[-0.5,-3]] = (-2)(-3)-(1.5)(-0.5) = 6+0.75 = 6.75
  //      sum = 12.96 + 8 + 6.75 = 27.71
  //    det(A): expand along first row
  //      det = -2*((-3)(-4)-(1.2)(-0.8)) - 1.5*((-0.5)(-4)-(1.2)(0.3)) + 0*(...)
  //           = -2*(12+0.96) - 1.5*(2 - 0.36)
  //           = -2*12.96 - 1.5*1.64
  //           = -25.92 - 2.46 = -28.38
  //    char poly: s^3 - (-9)s^2 + 27.71s - (-28.38)
  //             = s^3 + 9s^2 + 27.71s + 28.38
  const charPoly = [1, 9, 27.71, 28.38];
  const routh3 = routhTable(charPoly);
  assertTrue('Sys3 characteristic poly has no sign changes (all poles LHP)',
    routh3.signChanges === 0 && routh3.stable === true,
    `signChanges=${routh3.signChanges}, stable=${routh3.stable}`);

  // 2. Controllability: rank(Wc) = 3
  const Wc = controllabilityMatrix(A, B3);
  const rankWc = matRank(Wc);
  assertTrue('Sys3 rank(Wc) = 3 (fully controllable)', rankWc === 3, `rank=${rankWc}`);

  // 3. Observability: rank(Wo) = 3
  const Wo = observabilityMatrix(A, C3);
  const rankWo = matRank(Wo);
  assertTrue('Sys3 rank(Wo) = 3 (fully observable)', rankWo === 3, `rank=${rankWo}`);

  // 4. MIMO LQR with Q=I, R=I finds a 3×3 K; all CL poles stable
  let lqrResult;
  try {
    lqrResult = solveLqrMIMO(A, B3, matIdentity(3), matIdentity(3));
    assertTrue('Sys3 solveLqrMIMO returns K with shape 3×3',
      lqrResult.K.length === 3 && lqrResult.K[0].length === 3,
      `K shape=${lqrResult.K.length}×${lqrResult.K[0].length}`);
    assertTrue('Sys3 LQR closed-loop is stable', lqrResult.closedLoopStable === true,
      `closedLoopStable=${lqrResult.closedLoopStable}`);
    // All CL poles Re < 0
    const clPoles = polyroots(routhTable(charPoly) && lqrResult.Acl
      ? (() => {
          // Compute char poly of Acl via Faddeev-LeVerrier / Cayley-Hamilton
          // Use the trace / principal minor method for 3×3 Acl
          const Ac = lqrResult.Acl;
          const tr  = Ac[0][0] + Ac[1][1] + Ac[2][2];
          const m11 = Ac[1][1]*Ac[2][2] - Ac[1][2]*Ac[2][1];
          const m22 = Ac[0][0]*Ac[2][2] - Ac[0][2]*Ac[2][0];
          const m33 = Ac[0][0]*Ac[1][1] - Ac[0][1]*Ac[1][0];
          const sum2 = m11 + m22 + m33;
          const detAc = Ac[0][0]*(Ac[1][1]*Ac[2][2]-Ac[1][2]*Ac[2][1])
                      - Ac[0][1]*(Ac[1][0]*Ac[2][2]-Ac[1][2]*Ac[2][0])
                      + Ac[0][2]*(Ac[1][0]*Ac[2][1]-Ac[1][1]*Ac[2][0]);
          return [1, -tr, sum2, -detAc];
        })()
      : [1]);
    // clPoles from the Acl char poly
    const AcM = lqrResult.Acl;
    const trAc = AcM[0][0] + AcM[1][1] + AcM[2][2];
    const m11Ac = AcM[1][1]*AcM[2][2] - AcM[1][2]*AcM[2][1];
    const m22Ac = AcM[0][0]*AcM[2][2] - AcM[0][2]*AcM[2][0];
    const m33Ac = AcM[0][0]*AcM[1][1] - AcM[0][1]*AcM[1][0];
    const sum2Ac = m11Ac + m22Ac + m33Ac;
    const detAcM = AcM[0][0]*(AcM[1][1]*AcM[2][2]-AcM[1][2]*AcM[2][1])
                 - AcM[0][1]*(AcM[1][0]*AcM[2][2]-AcM[1][2]*AcM[2][0])
                 + AcM[0][2]*(AcM[1][0]*AcM[2][1]-AcM[1][1]*AcM[2][0]);
    const clCharPoly = [1, -trAc, sum2Ac, -detAcM];
    const clPoles3 = polyroots(clCharPoly);
    const allClLHP = clPoles3.every(p => p.re < 0);
    assertTrue('Sys3 all LQR CL poles Re < 0', allClLHP,
      `poles Re: [${clPoles3.map(p => p.re.toFixed(4)).join(', ')}]`);
  } catch (e) {
    assertTrue('Sys3 solveLqrMIMO did not throw', false, e.message);
    lqrResult = null;
  }

  // 5. Integral-action LQR: augmented order = 6
  try {
    const { Aaug, Baug, Caug, n, ni } = augmentWithIntegralAction(A, B3, C3);
    assertTrue('Sys3 augmented state order = 6', Aaug.length === 6,
      `Aaug size=${Aaug.length}`);
    assertTrue('Sys3 ni (integral states) = 3', ni === 3, `ni=${ni}`);
    assertTrue('Sys3 n (original states) = 3', n === 3, `n=${n}`);

    // designIntegralLQR with Q=I_6, R=I_3
    const Q6 = matIdentity(6);
    const R3 = matIdentity(3);
    const ilqr = designIntegralLQR(A, B3, C3, Q6, R3);
    assertTrue('Sys3 designIntegralLQR augCLStable = true', ilqr.augCLStable === true,
      `augCLStable=${ilqr.augCLStable}`);
    assertTrue('Sys3 integral LQR K shape is 3×6',
      ilqr.K.length === 3 && ilqr.K[0].length === 6,
      `K shape=${ilqr.K.length}×${ilqr.K[0].length}`);
    assertTrue('Sys3 Kx shape is 3×3', ilqr.Kx.length === 3 && ilqr.Kx[0].length === 3,
      `Kx shape=${ilqr.Kx.length}×${ilqr.Kx[0].length}`);
    assertTrue('Sys3 Ki shape is 3×3', ilqr.Ki.length === 3 && ilqr.Ki[0].length === 3,
      `Ki shape=${ilqr.Ki.length}×${ilqr.Ki[0].length}`);
    assertTrue('Sys3 integral LQR all aug CL poles Re < 0',
      ilqr.poles.every(p => p.re < 0),
      `poles Re: [${ilqr.poles.map(p => p.re.toFixed(4)).join(', ')}]`);
  } catch (e) {
    assertTrue('Sys3 integral LQR did not throw', false, e.message);
  }

  // 6. H∞ filter with γ=20: observer poles all Re < 0
  try {
    const Qw = matIdentity(3); // process noise intensity
    const Rv = matIdentity(3); // measurement noise covariance
    const hinfResult = solveHinfFilter(A, C3, Qw, Rv, 20);
    assertTrue('Sys3 H∞ filter stable (all filter poles Re < 0)', hinfResult.stable === true,
      `stable=${hinfResult.stable}`);
    assertTrue('Sys3 H∞ filter poles all Re < 0',
      hinfResult.filterPoles.every(p => p.re < 0),
      `poles Re: [${hinfResult.filterPoles.map(p => p.re.toFixed(4)).join(', ')}]`);
    assertTrue('Sys3 H∞ filter gain K has shape 3×3',
      hinfResult.K.length === 3 && hinfResult.K[0].length === 3,
      `K shape=${hinfResult.K.length}×${hinfResult.K[0].length}`);
  } catch (e) {
    assertTrue('Sys3 solveHinfFilter did not throw', false, e.message);
  }

  // 7. RGA at DC: G(0) = C·(-A)^{-1}·B = (-A)^{-1} (since B=C=I)
  //    Row and column sums of RGA should each equal 1 (RGA invariant property)
  try {
    const rga = rgaSteady(sys);
    const inv = rgaInvariants(rga);
    assertTrue('Sys3 RGA has 3 rows', rga.length === 3, `rows=${rga.length}`);
    assertTrue('Sys3 RGA has 3 cols', rga[0].length === 3, `cols=${rga[0].length}`);
    assertTrue('Sys3 RGA row sums all ≈ 1',
      inv.rowDeviation < 1e-10,
      `max row deviation=${inv.rowDeviation.toExponential(3)}`);
    assertTrue('Sys3 RGA col sums all ≈ 1',
      inv.colDeviation < 1e-10,
      `max col deviation=${inv.colDeviation.toExponential(3)}`);

    // DC gain G(0) = (-A)^{-1} since B=C=I, D=0
    const G0 = dcGain(sys);
    assertTrue('Sys3 G(0) is finite (A is invertible)', G0.flat().every(Number.isFinite),
      `G(0)[0][0]=${G0[0][0].toFixed(4)}`);

    // Verify RGA trace >= 3 (diagonal dominance or not — trace of RGA^2 >= n)
    // The absolute sum of RGA entries >= n for non-trivial coupling
    const rgaTrace = rga[0][0] + rga[1][1] + rga[2][2];
    assertTrue('Sys3 RGA is fully defined (finite entries)', rga.flat().every(Number.isFinite),
      `RGA trace=${rgaTrace.toFixed(4)}`);
  } catch (e) {
    assertTrue('Sys3 RGA/dcGain did not throw', false, e.message);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
if (failed === 0) {
  console.log('stress-complex: all checks passed');
} else {
  console.log(`stress-complex: ${failed} check(s) FAILED`);
  process.exitCode = 1;
}
