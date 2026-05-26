#!/usr/bin/env node
/**
 * verify_a5_a7_tier_a.mjs - Functional Roadmap A5/A6/A7 verification.
 */

import {
  computeRelativeDegree,
  designIOLinearization,
  designFullStateLinearization,
  simulateIOLinearized,
} from '../js/control/feedback_linearization.js';
import {
  designClegg,
  designFORE,
  simulateResetSys,
  analyzeHbeta,
  compareResetPhaseMargin,
} from '../js/control/reset_control.js';
import {
  computeMOAS,
  designReferenceGov,
  stepRG,
  simulateReferenceGov,
} from '../js/control/reference_governor.js';

let passed = 0;
let failed = 0;

function ok(msg, cond, detail = '') {
  if (cond) {
    console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`);
    failed++;
  }
}

function norm(x) {
  return Math.sqrt(x.reduce((sum, value) => sum + value * value, 0));
}

console.log('\n=== Tier A5: Feedback Linearization ===\n');

// A5-1: pendulum-like nonlinear plant linearizes to assignable poles.
{
  const model = {
    n: 2,
    f: (x) => [x[1], Math.sin(x[0])],
    g: () => [0, 1],
    h: (x) => x[0],
  };
  const rel = computeRelativeDegree({ ...model, samplePoint: [0.4, 0.1] });
  ok('A5-1: pendulum output has relative degree 2', rel.r === 2, `r=${rel.r}, beta=${rel.beta.toFixed(4)}`);
  const design = designIOLinearization(model, [-2, -3], { samplePoint: [0.4, 0.1] });
  const sim = simulateIOLinearized(model, design, { x0: [0.8, 0.0], T: 5, dt: 0.001 });
  ok('A5-1: feedback-linearized pendulum converges with selected poles',
    norm(sim.x.at(-1)) < 0.002,
    `||x(T)||=${norm(sim.x.at(-1)).toExponential(3)}`);
}

// A5-2: zero dynamics warning for an unstable Van der Pol-style internal mode.
{
  const model = {
    n: 2,
    f: (x) => [x[0], x[1]],
    g: () => [0, 1],
    h: (x) => x[1],
    zeroDynamics: { eigenvalues: [1] },
  };
  const design = designIOLinearization(model, [-2], { samplePoint: [0.2, 0.3] });
  ok('A5-2: non-minimum-phase zero dynamics are flagged',
    design.isMinPhase === false,
    `isMinPhase=${design.isMinPhase}`);
}

// A5-3: full-state linearization reports controllability when r=n.
{
  const model = {
    n: 2,
    f: (x) => [x[1], -x[0] + x[0] ** 3],
    g: () => [0, 1],
    h: (x) => x[0],
  };
  const full = designFullStateLinearization(model, [-3, -4], { samplePoint: [0.3, -0.2] });
  ok('A5-3: full-state diffeomorphism is controllable for r=n',
    full.controllable && full.relativeDegree === 2,
    `r=${full.relativeDegree}`);
  ok('A5-3: companion-form B places input in final derivative',
    full.AB.B[0][0] === 0 && full.AB.B[1][0] === 1);
}

console.log('\n=== Tier A6: Reset Control ===\n');

// A6-1: Clegg describing-function phase lead improves PM by more than 5 deg.
{
  const clegg = designClegg({ ki: 1 });
  const pm = compareResetPhaseMargin(clegg, 35);
  ok('A6-1: reset version improves phase margin >= 5 deg',
    pm.improvement >= 5 && pm.resetPM > pm.linearPM,
    `improvement=${pm.improvement.toFixed(1)} deg`);
}

// A6-2: reset events occur and trade off with performance.
{
  const t = Array.from({ length: 2000 }, (_, k) => k * 0.002);
  const slow = simulateResetSys({ a: -1, b: 1 }, designFORE({ pole: 0.5, gain: 0.5 }), (time) => Math.sin(2 * time), t);
  const fast = simulateResetSys({ a: -1, b: 1 }, designFORE({ pole: 0.1, gain: 5.0 }), (time) => Math.sin(2 * time), t);
  const slowRms = Math.sqrt(slow.e.reduce((s, v) => s + v * v, 0) / slow.e.length);
  const fastRms = Math.sqrt(fast.e.reduce((s, v) => s + v * v, 0) / fast.e.length);
  ok('A6-2: reset events are recorded',
    slow.resetEvents.length > 0 && fast.resetEvents.length > 0,
    `slow=${slow.resetEvents.length}, fast=${fast.resetEvents.length}`);
  ok('A6-2: reset tuning produces a measurable performance trade-off',
    Math.abs(slowRms - fastRms) > 0.01,
    `slowRms=${slowRms.toFixed(4)}, fastRms=${fastRms.toFixed(4)}`);
}

// A6-3: H-beta feasibility agrees on deterministic stable/unstable plants.
{
  const clegg = designClegg({ ki: 1 });
  const stable = analyzeHbeta(clegg, { poles: [-1, -2], crossover: 1 });
  const unstable = analyzeHbeta(clegg, { poles: [-1, 0.2], crossover: 1 });
  ok('A6-3: H-beta feasible for stable plant with reset phase lead', stable.feasible === true);
  ok('A6-3: H-beta infeasible when plant has unstable pole', unstable.feasible === false);
}

console.log('\n=== Tier A7: Reference Governor ===\n');

// A7-1: MOAS object is convex and boundary admissibility is invariant.
{
  const plant = { a: 0.8, b: 0.2 };
  const constraints = { xMin: -1, xMax: 1, uMin: -1, uMax: 1 };
  const moas = computeMOAS(plant, null, constraints, 30);
  const gov = designReferenceGov({ plant, constraints, horizon: 30, v0: 0 });
  const out = stepRG(gov, 1.0, 1.0);
  ok('A7-1: MOAS is represented as convex half-space constraints',
    moas.isConvex && moas.Hx.length > 0 && moas.Hx.length === moas.hx.length);
  ok('A7-1: boundary state remains admissible',
    out.admissible && out.v_modified <= 1 + 1e-12,
    `v=${out.v_modified.toFixed(4)}, kappa=${out.kappa.toFixed(4)}`);
}

// A7-2: kappa tends to 1 for unconstrained feasible target.
{
  const gov = designReferenceGov({
    plant: { a: 0.5, b: 0.5 },
    constraints: { xMin: -10, xMax: 10, uMin: -10, uMax: 10 },
    horizon: 10,
    v0: 0,
  });
  const out = stepRG(gov, 0, 0.7);
  ok('A7-2: unconstrained target passes through with kappa approximately 1',
    Math.abs(out.kappa - 1) < 1e-9 && Math.abs(out.v_modified - 0.7) < 1e-9,
    `kappa=${out.kappa}`);
}

// A7-3: Monte Carlo constraint satisfaction.
{
  let violations = 0;
  for (let i = 0; i < 100; i++) {
    const x0 = -0.8 + 1.6 * ((i * 37) % 100) / 99;
    const target = -2 + 4 * ((i * 53) % 100) / 99;
    const gov = designReferenceGov({
      plant: { a: 0.7, b: 0.3 },
      constraints: { xMin: -1, xMax: 1, uMin: -1, uMax: 1 },
      horizon: 25,
      v0: 0,
    });
    const sim = simulateReferenceGov(gov, [target, target, target, target, target], x0);
    if (sim.x.some((value) => value < -1 - 1e-10 || value > 1 + 1e-10)) violations++;
    if (sim.v.some((value) => value < -1 - 1e-10 || value > 1 + 1e-10)) violations++;
  }
  ok('A7-3: deterministic Monte Carlo satisfies all constraints', violations === 0, `violations=${violations}`);
}

console.log(`\n${'-'.repeat(55)}`);
console.log(`A5/A6/A7 Tier A verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed.');
