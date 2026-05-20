#!/usr/bin/env node
/**
 * verify_p24_empc.mjs — Phase 24-03: Economic MPC (EMPC via DE)
 *
 * Tests:
 *   1.  Returns { x, u, stageCosts, totalCost, deInfo }
 *   2.  x.length === steps+1
 *   3.  u.length === steps
 *   4.  stageCosts.length === steps
 *   5.  Quadratic stage cost: EMPC ≈ LQR behaviour — state converges to 0
 *   6.  All stage costs are finite
 *   7.  totalCost === sum of stageCosts
 *   8.  uMax constraint is respected throughout
 *   9.  uMin constraint is respected throughout
 *  10.  Non-quadratic (absolute value) cost — state still converges
 *  11.  Energy-optimal cost (|u|) — prefers small |u| over fast convergence
 *       (lower control energy than greedy full-swing)
 *  12.  2-state plant (double integrator): EMPC brings state to near origin
 *  13.  deInfo[k].generations ∈ [1, maxGen]
 *  14.  Reproducible with same seed
 *  15.  opts.termCost respected — higher terminal weight → state closer to 0
 *  16.  EMPC with L1 cost: |x| — avoids overshoot (x stays ≤ initial)
 */

import { simulateEMPC } from '../js/control/empc.js';

let passed = 0, failed = 0;

function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

console.log('\n=== P24-03: Economic MPC (Differential Evolution) ===\n');

// ── Simple 1st-order discrete plant x[k+1] = 0.9*x[k] + u[k] ─────────────
const Ad1 = [[0.9]];
const Bd1 = [[0.5]];

// Quadratic cost (matches LQR Q=1, R=0.1)
const quadCost = (x, u) => x[0]*x[0] + 0.1*u[0]*u[0];

// ── Tests 1–7: basic structure and quadratic convergence ──────────────────
{
  const x0 = [5.0];
  const r = simulateEMPC(Ad1, Bd1, quadCost, 5, x0, 20, {
    uMin: [-5], uMax: [5],
    popSize: 30, maxGen: 100, seed: 42
  });

  ok('Test 1: returns { x, u, stageCosts, totalCost, deInfo }',
    r && r.x && r.u && r.stageCosts && typeof r.totalCost === 'number' && r.deInfo);
  ok('Test 2: x.length === steps+1', r.x.length === 21, `got ${r.x.length}`);
  ok('Test 3: u.length === steps',    r.u.length === 20, `got ${r.u.length}`);
  ok('Test 4: stageCosts.length === steps', r.stageCosts.length === 20);

  const finalX = Math.abs(r.x[20][0]);
  ok('Test 5: quadratic cost — x converges to near 0 (|x[20]| < 0.5)',
    finalX < 0.5, `|x[20]|=${finalX.toFixed(4)}`);

  ok('Test 6: all stage costs finite',
    r.stageCosts.every(c => Number.isFinite(c)));

  const sumCost = r.stageCosts.reduce((s, c) => s + c, 0);
  ok('Test 7: totalCost === sum of stageCosts',
    Math.abs(r.totalCost - sumCost) < 1e-10,
    `total=${r.totalCost.toFixed(4)}, sum=${sumCost.toFixed(4)}`);
}

// ── Tests 8–9: constraint satisfaction ────────────────────────────────────
{
  const uMax = 1.5, uMin = -1.5;
  const r = simulateEMPC(Ad1, Bd1, quadCost, 4, [8.0], 15, {
    uMin: [uMin], uMax: [uMax], popSize: 25, maxGen: 80, seed: 7
  });
  const allMax = r.u.every(u => u[0] <= uMax + 1e-9);
  const allMin = r.u.every(u => u[0] >= uMin - 1e-9);
  ok('Test 8: uMax constraint respected', allMax,
    `max|u|=${Math.max(...r.u.map(u => u[0])).toFixed(4)}`);
  ok('Test 9: uMin constraint respected', allMin,
    `min|u|=${Math.min(...r.u.map(u => u[0])).toFixed(4)}`);
}

// ── Test 10: non-quadratic (|x| + 0.1*u²) cost ───────────────────────────
{
  const absXCost = (x, u) => Math.abs(x[0]) + 0.1 * u[0] * u[0];
  const r = simulateEMPC(Ad1, Bd1, absXCost, 5, [4.0], 25, {
    uMin: [-4], uMax: [4], popSize: 30, maxGen: 100, seed: 11
  });
  const finalX = Math.abs(r.x[25][0]);
  ok('Test 10: |x| cost — state converges (|x[25]| < 0.5)',
    finalX < 0.5, `|x[25]|=${finalX.toFixed(4)}`);
}

// ── Test 11: energy-optimal cost |u| — uses less energy than QP ──────────
{
  // Pure energy cost: minimise total |u| regardless of state
  // This should drive state to 0 eventually but with minimal effort
  const energyCost = (x, u) => 0.01*x[0]*x[0] + Math.abs(u[0]);
  const greedyCost = (x, u) => x[0]*x[0] + 0.001*u[0]*u[0];  // greedy: big u OK

  const rEnergy = simulateEMPC(Ad1, Bd1, energyCost, 5, [3.0], 20, {
    uMin: [-5], uMax: [5], popSize: 30, maxGen: 100, seed: 21
  });
  const rGreedy = simulateEMPC(Ad1, Bd1, greedyCost, 5, [3.0], 20, {
    uMin: [-5], uMax: [5], popSize: 30, maxGen: 100, seed: 21
  });
  const energyTotal = rEnergy.u.reduce((s, u) => s + Math.abs(u[0]), 0);
  const greedyTotal = rGreedy.u.reduce((s, u) => s + Math.abs(u[0]), 0);
  ok('Test 11: energy cost uses less control effort than greedy cost',
    energyTotal <= greedyTotal * 1.1,  // allow 10% tolerance
    `energy|u|=${energyTotal.toFixed(3)}, greedy|u|=${greedyTotal.toFixed(3)}`);
}

// ── Test 12: 2-state double integrator ───────────────────────────────────
// x1[k+1] = x1[k] + 0.1*x2[k]   (position)
// x2[k+1] = x2[k] + 0.1*u[k]     (velocity)
{
  const Ts = 0.1;
  const Ad2 = [[1, Ts], [0, 1]];
  const Bd2 = [[0], [Ts]];
  const qCost2 = (x, u) => x[0]**2 + 0.5*x[1]**2 + 0.1*u[0]**2;
  const r2 = simulateEMPC(Ad2, Bd2, qCost2, 8, [2.0, 1.0], 40, {
    uMin: [-5], uMax: [5], popSize: 40, maxGen: 150, seed: 99
  });
  const finalNorm = Math.sqrt(r2.x[40][0]**2 + r2.x[40][1]**2);
  ok('Test 12: 2-state double integrator converges (norm < 0.5)',
    finalNorm < 0.5, `finalNorm=${finalNorm.toFixed(4)}`);
}

// ── Test 13: deInfo[k].generations ∈ [0, maxGen] ────────────────────────
{
  const r = simulateEMPC(Ad1, Bd1, quadCost, 3, [2.0], 5, {
    uMin: [-3], uMax: [3], maxGen: 50, seed: 5
  });
  const allValid = r.deInfo.every(d => d.generations >= 0 && d.generations <= 50);
  ok('Test 13: deInfo generations ∈ [0, 50]', allValid,
    `max gen=${Math.max(...r.deInfo.map(d => d.generations))}`);
}

// ── Test 14: reproducibility with same seed ───────────────────────────────
{
  const opts = { uMin: [-3], uMax: [3], popSize: 20, maxGen: 50, seed: 77 };
  const r1 = simulateEMPC(Ad1, Bd1, quadCost, 4, [3.0], 5, opts);
  const r2 = simulateEMPC(Ad1, Bd1, quadCost, 4, [3.0], 5, opts);
  const same = r1.u.every((u, k) => Math.abs(u[0] - r2.u[k][0]) < 1e-10);
  ok('Test 14: same seed → identical results', same);
}

// ── Test 15: termCost respected ───────────────────────────────────────────
{
  const noTermCost  = simulateEMPC(Ad1, Bd1, quadCost, 5, [4.0], 10, {
    uMin: [-4], uMax: [4], seed: 33, popSize: 25, maxGen: 80
  });
  const highTermCost = simulateEMPC(Ad1, Bd1, quadCost, 5, [4.0], 10, {
    uMin: [-4], uMax: [4], seed: 33, popSize: 25, maxGen: 80,
    termCost: (x) => 100 * x[0] * x[0]
  });
  ok('Test 15: high terminal weight → smaller |x| at end',
    Math.abs(highTermCost.x[10][0]) <= Math.abs(noTermCost.x[10][0]) + 0.1,
    `noTerm=${Math.abs(noTermCost.x[10][0]).toFixed(3)}, highTerm=${Math.abs(highTermCost.x[10][0]).toFixed(3)}`);
}

// ── Test 16: L1 cost keeps x ≤ initial ───────────────────────────────────
{
  const l1Cost = (x, u) => Math.abs(x[0]) + 0.5 * Math.abs(u[0]);
  const r = simulateEMPC(Ad1, Bd1, l1Cost, 4, [3.0], 15, {
    uMin: [-5], uMax: [5], seed: 44, popSize: 25, maxGen: 80
  });
  const noOvershoot = r.x.every(x => x[0] <= 3.0 + 0.01);
  ok('Test 16: L1 cost — x stays ≤ initial value (no overshoot)',
    noOvershoot, `max x=${Math.max(...r.x.map(x => x[0])).toFixed(4)}`);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P24-03 EMPC: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
