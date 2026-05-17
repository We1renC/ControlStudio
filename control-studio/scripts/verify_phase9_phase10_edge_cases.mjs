#!/usr/bin/env node
/**
 * verify_phase9_phase10_edge_cases.mjs
 *
 * Commit-3 of CONTROL_SYSTEM_PHASE10_VERIFICATION_PLAN.md.
 * Targets the L4 (degenerate / boundary) layer across Phase 9 & 10.
 *
 * Each case asserts one of:
 *   (a) a *friendly* error message is thrown (with the expected substring),
 *   (b) the numerical output stays finite and direction-correct
 *       (e.g. sigma_min ≈ 0, sensitivity peak > 1 for NMP plants),
 *   (c) a Pade-approximated delay plant produces sensible robustness peaks.
 *
 * The goal is to catch silent NaN/Infinity leaks and missing guards before
 * users hit them in the studio UI.
 */
import { TransferFunction } from '../js/control/transfer-function.js';
import {
  MIMOStateSpace,
  dcGain,
  rgaSteady,
  singularValues,
  singularValueBode,
  dynamicDecouplerAtFrequency,
  evalAtJw,
} from '../js/control/mimo.js';
import {
  solveLqr,
  solveLqrMIMO,
  solveCareHamiltonianSchur,
} from '../js/control/state-feedback.js';
import {
  finiteHorizonLqr,
  simulateUnconstrainedMpc,
} from '../js/control/mpc.js';
import {
  sensitivityAt,
  sensitivityBode,
  robustPeaks,
} from '../js/control/robust.js';
import { Complex } from '../js/math/complex.js';
import { matIdentity } from '../js/math/matrix.js';

// ----- harness --------------------------------------------------------------

const records = [];
let failed = 0;
function record(name, fn) {
  try {
    const info = fn() || {};
    console.log(`[PASS] ${name}${info.detail ? ` (${info.detail})` : ''}`);
    records.push({ name, ok: true });
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    records.push({ name, ok: false });
    failed += 1;
  }
}
function assertTrue(cond, msg) { if (!cond) throw new Error(msg); }
function expectThrow(fn, predicate, label) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  if (!err) throw new Error(`${label}: expected to throw, did not`);
  if (predicate && !predicate(err)) {
    throw new Error(`${label}: error message mismatch — got "${err.message}"`);
  }
  return err;
}

// ============================================================================
// B2/B3-L4. Integrator plant — dcGain / RGA must give friendly error
// ============================================================================

record('B2-L4 dcGain on integrator plant errors with "integrator" hint', () => {
  // Single integrator: A=0, B=1, C=1, D=0 (1×1)
  const sys = new MIMOStateSpace([[0]], [[1]], [[1]], [[0]]);
  expectThrow(
    () => dcGain(sys),
    (e) => /integrator/.test(e.message),
    'dcGain integrator',
  );
});

record('B3-L4 RGA on integrator plant errors with hint', () => {
  // 2×2 with one integrator on the diagonal
  const sys = new MIMOStateSpace(
    [[0, 0], [0, -1]],
    [[1, 0], [0, 1]],
    [[1, 0], [0, 1]],
    [[0, 0], [0, 0]],
  );
  expectThrow(
    () => rgaSteady(sys),
    (e) => /integrator|singular/i.test(e.message),
    'RGA integrator',
  );
});

// ============================================================================
// B4-L4. Singular Value Bode on degenerate matrix → σ_min ≈ 0, no NaN
// ============================================================================

record('B4-L4 singular complex matrix has σ_min ≈ 0 (no NaN)', () => {
  // rank-1: [[1,1],[1,1]] → σ_max = 2, σ_min = 0
  const G = [
    [new Complex(1, 0), new Complex(1, 0)],
    [new Complex(1, 0), new Complex(1, 0)],
  ];
  const sv = singularValues(G);
  assertTrue(Number.isFinite(sv[0]), `σ_max non-finite: ${sv[0]}`);
  assertTrue(Number.isFinite(sv[1]), `σ_min non-finite: ${sv[1]}`);
  assertTrue(Math.abs(sv[0] - 2) < 1e-10, `σ_max=${sv[0]} expected 2`);
  assertTrue(sv[1] < 1e-10, `σ_min=${sv[1]} not ≈ 0`);
  return { detail: `σ=[${sv[0].toFixed(4)}, ${sv[1].toExponential(2)}]` };
});

record('B4-L4 SVB on plant with rank-deficient C remains finite', () => {
  // Output rows linearly dependent → output rank deficiency at DC
  const sys = new MIMOStateSpace(
    [[-1, 0], [0, -2]],
    [[1, 0], [0, 1]],
    [[1, 1], [2, 2]], // row 2 = 2 · row 1
    [[0, 0], [0, 0]],
  );
  const sweep = singularValueBode(sys, [0.01, 0.1, 1, 10]);
  for (let k = 0; k < sweep.omegas.length; k++) {
    assertTrue(Number.isFinite(sweep.sigmaMax[k]), `σ_max NaN at k=${k}`);
    assertTrue(Number.isFinite(sweep.sigmaMin[k]), `σ_min NaN at k=${k}`);
    assertTrue(sweep.sigmaMin[k] < 1e-6, `σ_min=${sweep.sigmaMin[k]} should be ≈ 0`);
  }
  return { detail: `σ_min(1)=${sweep.sigmaMin[2].toExponential(2)}` };
});

// ============================================================================
// B5-L4. Dynamic decoupler on singular G(jω)
// ============================================================================

record('B5-L4 dynamicDecouplerAtFrequency on singular G(jω) errors with hint', () => {
  // Rank-deficient C → G(jω) singular at any ω
  const sys = new MIMOStateSpace(
    [[-1, 0], [0, -1]],
    [[1, 0], [0, 1]],
    [[1, 1], [2, 2]],
    [[0, 0], [0, 0]],
  );
  expectThrow(
    () => dynamicDecouplerAtFrequency(sys, 1),
    (e) => /singular|ill-conditioned/i.test(e.message),
    'dynamic decoupler singular',
  );
});

// ============================================================================
// B6-L4. MIMO LQR on uncontrollable plant — friendly diagnosis
// ============================================================================

record('B6-L4 solveLqr on uncontrollable plant rejects with controllability msg', () => {
  // Mode at -2 is uncontrollable: B touches only first state
  const A = [[-1, 0], [0, -2]];
  const B = [[1], [0]];
  expectThrow(
    () => solveLqr(A, B, matIdentity(2), [[1]]),
    (e) => /controll/i.test(e.message),
    'LQR uncontrollable',
  );
});

record('B6-L4 solveLqrMIMO on unstable + uncontrollable rejects with friendly msg', () => {
  // Unstable mode at +1, uncontrollable through B
  const A = [[1, 0], [0, -1]];
  const B = [[0], [1]];
  expectThrow(
    () => solveLqrMIMO(A, B, matIdentity(2), [[1]]),
    (e) => /stabiliz|controll|Schur|Newton/i.test(e.message),
    'MIMO LQR uncontrollable',
  );
});

// ============================================================================
// B7-L4. Schur CARE on degenerate inputs
// ============================================================================

record('B7-L4 solveCareHamiltonianSchur rejects R = 0', () => {
  expectThrow(
    () => solveCareHamiltonianSchur([[0, 1], [0, 0]], [[0], [1]], matIdentity(2), [[0]]),
    (e) => /R must be positive definite/i.test(e.message),
    'CARE non-PD R',
  );
});

// ============================================================================
// B8-L4. MPC guards on bad inputs
// ============================================================================

record('B8-L4 MPC with R = 0 rejects with positive-definite message', () => {
  expectThrow(
    () => finiteHorizonLqr([[1]], [[1]], [[1]], [[0]], 5, [[1]]),
    (e) => /R must be positive definite/i.test(e.message),
    'MPC singular R',
  );
});

record('B8-L4 MPC rejects horizon ≤ 0 / non-integer', () => {
  for (const bad of [0, -1, 1.5, 'x']) {
    expectThrow(
      () => finiteHorizonLqr([[1]], [[1]], [[1]], [[1]], bad, [[1]]),
      (e) => /horizon/i.test(e.message),
      `MPC bad horizon=${bad}`,
    );
  }
});

record('B8-L4 MPC sim on unstable plant with short horizon still finishes', () => {
  // Ad = 1.2 (z-unstable), short horizon — should converge thanks to LQR Riccati
  const sim = simulateUnconstrainedMpc([[1.2]], [[1]], [[1]], [[1]], 8, [[1]], { steps: 30 });
  assertTrue(Number.isFinite(sim.totalCost), 'MPC sim produced NaN cost');
  // With finite horizon LQR, gain still stabilizes scalar unstable plant
  assertTrue(sim.finalStateNormInf < 1, `final norm = ${sim.finalStateNormInf} (no convergence)`);
  return { detail: `final ‖x‖∞=${sim.finalStateNormInf.toExponential(2)}` };
});

// ============================================================================
// B10-L4. Robust sensitivity on marginal / NMP / delay loops
// ============================================================================

record('B10-L4 sensitivity at frequency where 1+L=0 errors instead of NaN', () => {
  const loop = new TransferFunction([-1], [1]); // L(jω) = -1 for all ω → singular
  expectThrow(
    () => sensitivityAt(loop, 1),
    (e) => /singular|near zero/i.test(e.message),
    'sensitivity at singular point',
  );
});

record('B10-L4 robustPeaks on NMP loop has peak |S| > 1', () => {
  // L(s) = (1 - s) / ((s+1)(s+3))  — RHP zero at s=1
  // Numerator: -s + 1   Denominator: (s+1)(s+3) = s² + 4s + 3
  const loop = new TransferFunction([-1, 1], [1, 4, 3]);
  const omegas = [];
  for (let k = -2; k <= 2; k += 0.05) omegas.push(Math.pow(10, k));
  const peaks = robustPeaks(loop, omegas);
  assertTrue(Number.isFinite(peaks.Ms.peak), `Ms peak NaN: ${peaks.Ms.peak}`);
  assertTrue(peaks.Ms.peak > 1, `NMP loop peak |S|=${peaks.Ms.peak} expected > 1`);
  return { detail: `peak |S|=${peaks.Ms.peak.toFixed(3)} @ ω=${peaks.Ms.peakOmega.toExponential(2)}` };
});

record('B10-L4 robustPeaks on Padé-approximated delay loop finishes & finite', () => {
  // L(s) = (1 - 0.25s) / ((s+1)(1 + 0.25s)) — first-order Padé of e^{-0.5 s} / (s+1)
  // Num: -0.25 s + 1   Den: (s+1)(0.25 s + 1) = 0.25 s² + 1.25 s + 1
  const loop = new TransferFunction([-0.25, 1], [0.25, 1.25, 1]);
  const omegas = [];
  for (let k = -2; k <= 2; k += 0.05) omegas.push(Math.pow(10, k));
  const peaks = robustPeaks(loop, omegas);
  assertTrue(Number.isFinite(peaks.Ms.peak), 'Ms peak NaN');
  assertTrue(Number.isFinite(peaks.Mt.peak), 'Mt peak NaN');
  assertTrue(peaks.Ms.peak >= 1, `peak |S|=${peaks.Ms.peak}`);
  return { detail: `peak |S|=${peaks.Ms.peak.toFixed(3)}, |T|=${peaks.Mt.peak.toFixed(3)}` };
});

record('B10-L4 sensitivityBode S + T = 1 identity holds across NMP loop', () => {
  const loop = new TransferFunction([-1, 1], [1, 4, 3]);
  const omegas = [0, 0.01, 0.1, 1, 5, 50];
  const bode = sensitivityBode(loop, omegas);
  let worst = 0;
  for (let k = 0; k < omegas.length; k++) {
    const sum = bode.S[k].add(bode.T[k]);
    worst = Math.max(worst, Math.abs(sum.re - 1), Math.abs(sum.im));
  }
  assertTrue(worst < 1e-12, `S+T identity violated: ${worst}`);
  return { detail: `max |S+T-1|=${worst.toExponential(2)}` };
});

// ----- summary --------------------------------------------------------------

const total = records.length;
console.log('');
console.log(`Phase 9/10 edge-case verification: ${total - failed}/${total} passed`);
if (failed) process.exitCode = 1;
