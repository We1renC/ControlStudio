#!/usr/bin/env node
/**
 * Verification for remaining Functional Roadmap E/F/G baseline APIs.
 */

import { generalizedEigenvalues } from '../js/math/qz_descriptor.js';
import { arnoldi, gmres } from '../js/math/krylov.js';
import { doubleIntegratorCircleCBF, sosCbfFeasibility } from '../js/verification/cbf.js';
import { checkCTL, checkLTL } from '../js/verification/formal.js';
import { estimateNormalTail, naiveNormalTail } from '../js/verification/importance_sampling.js';
import { tightenChanceConstraint, estimateViolationRate } from '../js/control/stochastic_mpc.js';
import { solveConsensusDMPC } from '../js/control/distributed_mpc.js';
import { solveHybridMPC } from '../js/control/hybrid_mpc.js';
import { compareWarmCold, shiftAndExtend, simulateWarmStart } from '../js/control/nmpc_warmstart.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function verifyE() {
  const eig = generalizedEigenvalues([[1, 0], [0, 1]], [[2, 0], [0, 3]]).map((v) => v.re).sort((a, b) => a - b);
  assert(Math.abs(eig[0] - 2) < 1e-12 && Math.abs(eig[1] - 3) < 1e-12, `E3 regular pencil mismatch: ${eig}`);
  const desc = generalizedEigenvalues([[1, 0], [0, 0]], [[2, 0], [0, 1]]);
  assert(desc.some((v) => v.infinite), 'E3 singular descriptor pencil should include infinite eigenvalue');

  const A = [[4, 1], [1, 3]];
  const b = [1, 2];
  const gm = gmres(A, b, { restart: 2, maxIter: 20, tol: 1e-10 });
  assert(gm.residualNorm < 1e-8, `E6 GMRES residual too high: ${gm.residualNorm}`);
  const ar = arnoldi(A, b, 2);
  const orth = ar.V[0].reduce((sum, value, i) => sum + value * ar.V[1][i], 0);
  assert(Math.abs(orth) < 1e-10, `E6 Arnoldi basis not orthogonal: ${orth}`);
}

function verifyF() {
  const cbf = doubleIntegratorCircleCBF({ center: [0, 0], radius: 1, alpha0: 3, alpha1: 4 });
  let state = [1.2, 0, -0.25, 0];
  const dt = 0.01;
  for (let k = 0; k < 120; k++) {
    const r = cbf.filter(state, [-2, 0]);
    state = [
      state[0] + dt * state[2],
      state[1] + dt * state[3],
      state[2] + dt * r.u[0],
      state[3] + dt * r.u[1],
    ];
    const h = state[0] * state[0] + state[1] * state[1] - 1;
    assert(h > -1e-3, `F2 CBF let trajectory enter unsafe set at step ${k}: ${h}`);
  }
  assert(sosCbfFeasibility({ polynomialDegree: 2, constraints: [true] }).feasible, 'F2 SOS feasibility baseline failed');

  const ok = checkLTL([{ p: true }, { q: true }], 'G(p -> F(q))');
  assert(ok.satisfied, 'F3 response formula should hold');
  const bad = checkLTL([{ p: true }, {}], 'G(p -> F(q))');
  assert(!bad.satisfied && bad.counterexample.length > 0, 'F3 response counterexample missing');
  const ctl = checkCTL({ initial: 0, labels: [{}, { unsafe: true }], edges: [[1], []] }, 'AG(!unsafe)');
  assert(!ctl.satisfied && ctl.counterexampleNode === 1, 'F3 CTL unsafe counterexample missing');

  const is = estimateNormalTail({ threshold: 5, samples: 50000, proposalMean: 5, seed: 2 });
  const naive = naiveNormalTail({ threshold: 5, samples: 50000, seed: 2 });
  const analytic = 2.866515718791933e-7;
  assert(Math.abs(is.estimate - analytic) / analytic < 0.25, `F5 IS tail estimate inaccurate: ${is.estimate}`);
  assert(naive.variance / is.variance > 100, `F5 variance reduction too small: ${naive.variance / is.variance}`);
}

function verifyG() {
  const constraint = tightenChanceConstraint({ a: [1], b: -2, Sigma: [[0.25]], epsilon: 0.05 });
  assert(constraint.backoff > 0.8 && constraint.backoff < 0.9, `G1 chance backoff unexpected: ${constraint.backoff}`);
  const rate = estimateViolationRate({ mean: [2 - constraint.backoff], Sigma: [[0.25]], constraint: { a: [1], b: -2 }, samples: 10000, seed: 4 });
  assert(rate.rate <= 0.06, `G1 Monte Carlo violation too high: ${rate.rate}`);

  const dmpc = solveConsensusDMPC({ localTargets: [1, 3], rho: 1.5, maxIter: 80 });
  assert(Math.abs(dmpc.consensus - 2) < 1e-6 && dmpc.converged, `G3 DMPC consensus failed: ${dmpc.consensus}`);

  const hmpc = solveHybridMPC({
    modes: [{ A: [[1]], B: [[0.1]] }, { A: [[1]], B: [[1]] }],
    x0: [0],
    ref: [2],
    horizon: 2,
    inputs: [[1]],
    Q: 1,
    R: 0,
  });
  assert(hmpc.status === 'optimal' && hmpc.modeSeq.every((i) => i === 1), `G4 hybrid MPC mode sequence wrong: ${hmpc.modeSeq}`);

  const shifted = shiftAndExtend([[1], [2], [3]]);
  assert(JSON.stringify(shifted) === JSON.stringify([[2], [3], [3]]), `G5 shift-and-extend wrong: ${JSON.stringify(shifted)}`);
  const sim = simulateWarmStart({ x0: [0], controlSequence: [[1], [2]], plant: (x, u, dt) => [x[0] + dt * u[0]] });
  assert(sim.states.at(-1)[0] === 4, `G5 warm-start simulation wrong: ${sim.states.at(-1)[0]}`);
  const cmp = compareWarmCold({ coldIterations: [12, 10, 11], warmIterations: [5, 4, 5] });
  assert(cmp.reduction > 0.5, `G5 warm-start reduction too small: ${cmp.reduction}`);
}

verifyE();
verifyF();
verifyG();

console.log('PASS: E/F/G remaining roadmap verification');
