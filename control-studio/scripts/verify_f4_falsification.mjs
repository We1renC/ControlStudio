#!/usr/bin/env node
/**
 * verify_f4_falsification.mjs
 *
 * Tier F4 — Falsification (S-TaLiRo style)
 *
 * Checks:
 *  L1 Semantics — bounded always robustness is min predicate robustness.
 *  L1 Semantics — bounded eventually robustness is max predicate robustness.
 *  L2 Cross    — known bug system produces a negative-robustness counterexample.
 *  L2 Cross    — safe system remains non-falsified under the same input space.
 *  L3 Property — anneal search improves robustness versus the initial candidate.
 *  L4 Boundary — malformed STL and invalid input spaces throw.
 */
import {
  defineSTL,
  falsify,
} from '../js/verification/falsification.js';

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
console.log('  F4 Falsification - STL robustness and counterexample search');
console.log('===============================================================\n');

console.log('> L1 STL robustness semantics');
const monotoneTrajectory = {
  t: [0, 1, 2, 3, 4],
  signals: { x: [0, 1, 2, 3, 4], y: [4, 3, 2, 1, 0] },
};

const alwaysSpec = defineSTL('alw_[0,4] x < 5');
assertNear('alw_[0,4] x < 5 -> min(5-x) = 1',
  alwaysSpec.robustness(monotoneTrajectory), 1, 1e-12);

const eventuallySpec = defineSTL('ev_[0,4] x > 3');
assertNear('ev_[0,4] x > 3 -> max(x-3) = 1',
  eventuallySpec.robustness(monotoneTrajectory), 1, 1e-12);

const windowSpec = defineSTL('alw_[1,3] y >= 1.5');
assertNear('alw_[1,3] y >= 1.5 -> min(y-1.5) = -0.5',
  windowSpec.robustness(monotoneTrajectory), -0.5, 1e-12);

console.log('\n> L2 Known bug falsification');
function bugSystem(input) {
  const u = input.u;
  return {
    t: [0, 1, 2, 3, 4, 5],
    signals: {
      x: [0, 0.7 * u, 1.2 * u, 1.45 * u, 1.55 * u, 1.6 * u],
    },
  };
}

const bugResult = falsify({
  system: bugSystem,
  spec: 'alw_[0,5] x < 5',
  inputSpace: { u: [0, 5] },
  budget: 80,
  seed: 7,
});
assertTrue('known bug system falsified', bugResult.falsified,
  `rho=${bugResult.rhoMin.toFixed(4)}, u=${bugResult.worstInput.u.toFixed(4)}`);
assertTrue('counterexample input is near upper-risk region',
  bugResult.worstInput.u > 3.125,
  `u=${bugResult.worstInput.u.toFixed(4)}`);
assertTrue('history records best robustness', bugResult.history.length >= 1);

console.log('\n> L2 Safe system remains safe');
function safeSystem(input) {
  const u = input.u;
  return {
    t: [0, 1, 2, 3, 4, 5],
    signals: { x: [0, 0.2 * u, 0.4 * u, 0.6 * u, 0.8 * u, 1.0 * u] },
  };
}
const safeResult = falsify({
  system: safeSystem,
  spec: 'alw_[0,5] x < 5',
  inputSpace: [{ name: 'u', min: 0, max: 4 }],
  budget: 60,
  seed: 11,
});
assertTrue('safe system not falsified', !safeResult.falsified,
  `rho=${safeResult.rhoMin.toFixed(4)}`);
assertTrue('safe robustness remains positive', safeResult.rhoMin > 0.9,
  `rho=${safeResult.rhoMin.toFixed(4)}`);

console.log('\n> L3 Anneal improves robustness');
function quadraticRiskSystem(input) {
  const u = input.u;
  const peak = 2 + 6 * Math.exp(-((u - 0.75) ** 2) / 0.02);
  return { t: [0, 1], signals: { x: [0, peak] } };
}
const annealResult = falsify({
  system: quadraticRiskSystem,
  spec: 'alw_[0,1] x < 5',
  inputSpace: { u: [0, 1] },
  budget: 120,
  seed: 13,
  method: 'anneal',
});
assertTrue('anneal finds falsifying region', annealResult.falsified,
  `rho=${annealResult.rhoMin.toFixed(4)}, u=${annealResult.worstInput.u.toFixed(4)}`);
assertTrue('best robustness improved or stayed from first sample',
  annealResult.rhoMin <= annealResult.history[0],
  `first=${annealResult.history[0].toFixed(4)}, best=${annealResult.rhoMin.toFixed(4)}`);

console.log('\n> L4 Boundary checks');
assertThrows('malformed STL formula throws', () => defineSTL('sometimes x less than 5'));
assertThrows('bad time window throws', () => defineSTL('alw_[5,1] x < 5'));
assertThrows('invalid input space throws', () => falsify({
  system: safeSystem,
  spec: 'alw_[0,5] x < 5',
  inputSpace: { u: [5, 0] },
}));
assertThrows('empty trajectory window throws', () => defineSTL('alw_[10,12] x < 5').robustness(monotoneTrajectory));

console.log('\n===============================================================');
if (failed === 0) {
  console.log('All F4 Falsification checks passed');
  process.exit(0);
} else {
  console.log(`${failed} F4 check(s) FAILED`);
  process.exit(1);
}

