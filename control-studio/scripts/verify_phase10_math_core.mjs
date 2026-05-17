#!/usr/bin/env node
import { TransferFunction } from '../js/control/transfer-function.js';
import { MIMOStateSpace, dynamicDecouplerAtFrequency } from '../js/control/mimo.js';
import { finiteHorizonLqr, firstMpcAction, simulateUnconstrainedMpc } from '../js/control/mpc.js';
import { robustPeaks, sensitivityAt, uncertaintyEnvelope } from '../js/control/robust.js';
import { analyzeLyapunov, solveCareHamiltonianSchur, solveLqr, solveLqrMIMO } from '../js/control/state-feedback.js';
import { matIdentity, matMul, matSub } from '../js/math/matrix.js';

const results = [];

function assertNear(name, actual, expected, tolerance = 1e-8) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(name, condition) {
  if (!condition) throw new Error(name);
}

function assertMatrixNear(name, actual, expected, tolerance = 1e-8) {
  assertTrue(`${name}: row count`, actual.length === expected.length);
  for (let i = 0; i < expected.length; i++) {
    assertTrue(`${name}: col count row ${i}`, actual[i].length === expected[i].length);
    for (let j = 0; j < expected[i].length; j++) {
      assertNear(`${name}[${i}][${j}]`, actual[i][j], expected[i][j], tolerance);
    }
  }
}

function record(name, fn) {
  fn();
  results.push(name);
  console.log(`[PASS] ${name}`);
}

try {
  record('Hamiltonian CARE scalar unstable analytic solution', () => {
    const result = solveCareHamiltonianSchur([[2]], [[1]], [[1]], [[1]]);
    assertNear('K', result.K[0][0], 2 + Math.sqrt(5), 1e-8);
    assertNear('Acl', result.Acl[0][0], -Math.sqrt(5), 1e-8);
    assertTrue('closed-loop stable', result.closedLoopStable);
    assertTrue(`CARE residual ${result.riccatiResidualNorm}`, result.riccatiResidualNorm < 1e-10);
  });

  record('Hamiltonian CARE double-integrator analytic solution', () => {
    const result = solveCareHamiltonianSchur(
      [[0, 1], [0, 0]],
      [[0], [1]],
      [[1, 0], [0, 1]],
      [[1]],
    );
    assertMatrixNear('K', result.K, [[1, Math.sqrt(3)]], 1e-8);
    assertMatrixNear('P', result.P, [[Math.sqrt(3), 1], [1, Math.sqrt(3)]], 1e-8);
    assertTrue('closed-loop stable', result.closedLoopStable);
    assertTrue(`CARE residual ${result.riccatiResidualNorm}`, result.riccatiResidualNorm < 1e-10);
  });

  record('solveLqr defaults to Hamiltonian CARE path', () => {
    const result = solveLqr([[0, 1], [-2, -3]], [[0], [1]], [[1, 0], [0, 1]], [[1]]);
    assertTrue('strategy', result.initialGainStrategy === 'hamiltonian-schur');
    assertTrue('closed-loop stable', result.closedLoopStable);
    assertTrue(`CARE residual ${result.riccatiResidualNorm}`, result.riccatiResidualNorm < 1e-10);
  });

  record('MIMO Hamiltonian CARE diagonal analytic solution', () => {
    const result = solveLqrMIMO(
      [[-1, 0], [0, -2]],
      [[1, 0], [0, 1]],
      [[1, 0], [0, 1]],
      [[1, 0], [0, 1]],
    );
    assertMatrixNear('K', result.K, [[Math.sqrt(2) - 1, 0], [0, Math.sqrt(5) - 2]], 1e-8);
    assertTrue('strategy', result.initialGainStrategy === 'hamiltonian-schur');
    assertTrue('closed-loop stable', result.closedLoopStable);
    assertTrue(`CARE residual ${result.riccatiResidualNorm}`, result.riccatiResidualNorm < 1e-10);
  });

  record('MIMO Hamiltonian CARE stabilizes spacecraft marginal plant', () => {
    const A = [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1], [0, 0, -1, 0]];
    const B = [[0, 0], [1, 0], [0, 0], [0, 1]];
    const result = solveCareHamiltonianSchur(A, B, matIdentity(4), matIdentity(2));
    assertTrue('K shape', result.K.length === 2 && result.K[0].length === 4);
    assertTrue('closed-loop stable', result.closedLoopStable);
    assertTrue(`CARE residual ${result.riccatiResidualNorm}`, result.riccatiResidualNorm < 1e-8);
    assertTrue('Lyapunov proof', analyzeLyapunov(result.Acl, matIdentity(4)).provenStable);
  });

  record('Hamiltonian CARE rejects non-positive R', () => {
    let threw = false;
    try {
      solveCareHamiltonianSchur([[0, 1], [0, 0]], [[0], [1]], matIdentity(2), [[0]]);
    } catch (err) {
      threw = /R must be positive definite/i.test(err.message);
    }
    assertTrue('positive-definite guard', threw);
  });

  record('MPC finite-horizon scalar Riccati derivation', () => {
    const result = finiteHorizonLqr([[1]], [[1]], [[1]], [[1]], 2, [[1]]);
    assertNear('K0', result.firstGain[0][0], 0.6, 1e-12);
    assertNear('P0', result.P[0][0][0], 1.6, 1e-10);
    const action = firstMpcAction([[1]], [[1]], [[1]], [[1]], 2, [[1]], [[1]]);
    assertNear('u0', action.u[0][0], -0.6, 1e-12);
  });

  record('MPC receding-horizon simulation converges', () => {
    const sim = simulateUnconstrainedMpc(
      [[1, 0.1], [0, 1]],
      [[0.005], [0.1]],
      [[1, 0], [0, 0.1]],
      [[0.01]],
      12,
      [[1], [0]],
      { steps: 80 },
    );
    assertTrue(`final state norm ${sim.finalStateNormInf}`, sim.finalStateNormInf < 0.05);
    assertTrue('positive total cost', sim.totalCost > 0);
  });

  record('Dynamic decoupler verifies selected-frequency inverse', () => {
    const sys = new MIMOStateSpace(
      [[-1, 0], [0, -1]],
      [[1, 0.5], [0.5, 1]],
      [[1, 0], [0, 1]],
      [[0, 0], [0, 0]],
    );
    const result = dynamicDecouplerAtFrequency(sys, 2);
    assertTrue(`off-diagonal residual ${result.offDiagonalNorm}`, result.offDiagonalNorm < 1e-8);
    assertTrue(`diagonal residual ${result.diagonalDeviation}`, result.diagonalDeviation < 1e-8);
  });

  record('Robust sensitivity identities hold across frequency', () => {
    const loop = new TransferFunction([1], [1, 1]);
    const controller = new TransferFunction([2], [1]);
    for (const omega of [0, 0.1, 1, 10]) {
      const point = sensitivityAt(loop, omega, controller);
      const sum = point.S.add(point.T);
      assertNear(`S+T real at ${omega}`, sum.re, 1, 1e-10);
      assertNear(`S+T imag at ${omega}`, sum.im, 0, 1e-10);
    }
    const dc = sensitivityAt(loop, 0, controller);
    assertNear('S(0)', dc.S.re, 0.5, 1e-12);
    assertNear('T(0)', dc.T.re, 0.5, 1e-12);
    assertNear('KS(0)', dc.KS.re, 1, 1e-12);
  });

  record('Robust sensitivity flags high-risk near-singular loop', () => {
    const nearSingularLoop = new TransferFunction([-0.9], [1]);
    const peaks = robustPeaks(nearSingularLoop, [0]);
    assertNear('Ms', peaks.Ms.peak, 10, 1e-10);
    assertTrue('risk high', peaks.risk === 'high');
    let threw = false;
    try {
      robustPeaks(nearSingularLoop, []);
    } catch (err) {
      threw = /non-empty array/i.test(err.message);
    }
    assertTrue('empty omega guard', threw);
  });

  record('Uncertainty envelope: nominal-only grid equals plain sensitivity', () => {
    const loop = new TransferFunction([1], [1, 1]);
    const env = uncertaintyEnvelope(loop, [0.1, 1, 10], { gainFactors: [1], phaseShiftsDeg: [0] });
    for (let k = 0; k < env.omegas.length; k++) {
      const ref = sensitivityAt(loop, env.omegas[k]);
      assertNear(`|S| nominal[${k}]`, env.nominal.S[k], ref.S.magnitude, 1e-12);
      assertNear(`|T| nominal[${k}]`, env.nominal.T[k], ref.T.magnitude, 1e-12);
      assertNear(`|S| worst[${k}]`, env.worst.S[k], ref.S.magnitude, 1e-12);
    }
  });

  record('Uncertainty envelope: worst ≥ nominal everywhere; ±20% gain ±15° phase', () => {
    const loop = new TransferFunction([1], [1, 1]);
    const env = uncertaintyEnvelope(loop, [0.1, 0.5, 1, 2, 5], {
      gainFactors: [0.8, 1.0, 1.2],
      phaseShiftsDeg: [-15, 0, 15],
    });
    for (let k = 0; k < env.omegas.length; k++) {
      assertTrue(`worst |S| ≥ nominal at ω=${env.omegas[k]}`,
        env.worst.S[k] + 1e-12 >= env.nominal.S[k]);
      assertTrue(`worst |T| ≥ nominal at ω=${env.omegas[k]}`,
        env.worst.T[k] + 1e-12 >= env.nominal.T[k]);
    }
    // Sanity: perturbed peak strictly larger than nominal peak.
    const nominal = uncertaintyEnvelope(loop, env.omegas, {
      gainFactors: [1], phaseShiftsDeg: [0],
    });
    assertTrue(`perturbed peak ${env.peaks.S.peak} > nominal ${nominal.peaks.S.peak}`,
      env.peaks.S.peak > nominal.peaks.S.peak);
  });

  record('Uncertainty envelope: gain+phase toward −1 drives |S| to infinity', () => {
    // L(s) = 2/(s+1) has L(0)=2 (real, positive). Perturbation k=0.5 with
    // θ=180° flips it to −1 exactly at ω=0, so the closed loop becomes
    // singular: |S(0)| = ∞. This locks the perturbation arithmetic.
    const loop = new TransferFunction([2], [1, 1]);
    const env = uncertaintyEnvelope(loop, [0, 0.5, 1, 5], {
      gainFactors: [0.5, 1, 2],
      phaseShiftsDeg: [-180, 0, 180],
    });
    assertTrue(`worst |S| at ω=0 = ${env.worst.S[0]} should be Infinity`,
      !Number.isFinite(env.worst.S[0]));
    assertTrue('peak overall is Infinity', !Number.isFinite(env.peaks.S.peak));
  });

  record('Uncertainty envelope: empty grid lists rejected', () => {
    const loop = new TransferFunction([1], [1, 1]);
    let threw = false;
    try {
      uncertaintyEnvelope(loop, [1], { gainFactors: [], phaseShiftsDeg: [0] });
    } catch (e) { threw = /gainFactors|non-empty/i.test(e.message); }
    assertTrue('empty gain grid guard', threw);
    threw = false;
    try {
      uncertaintyEnvelope(loop, [1], { gainFactors: [-1], phaseShiftsDeg: [0] });
    } catch (e) { threw = /positive|gainFactors/i.test(e.message); }
    assertTrue('non-positive gain guard', threw);
  });

  // Additional algebraic sanity: Acl should equal A - BK for a solved CARE.
  record('Hamiltonian CARE Acl algebra matches A - BK', () => {
    const A = [[0, 1], [0, 0]];
    const B = [[0], [1]];
    const result = solveCareHamiltonianSchur(A, B, matIdentity(2), [[1]]);
    const expectedAcl = matSub(A, matMul(B, result.K));
    assertMatrixNear('Acl', result.Acl, expectedAcl, 1e-12);
  });

  console.log(`Phase 10 math core verification passed: ${results.length}/${results.length}`);
} catch (err) {
  console.error(`[FAIL] ${err.message}`);
  process.exitCode = 1;
}
