/**
 * verify_phase11_dynamic_rga.mjs
 * Verification tests for CS-P11-04: Dynamic RGA Λ(jω)
 */

import {
  MIMOStateSpace,
  dynamicRGA,
  dynamicRGAMagnitude,
  dynamicRGADiagonal,
  rgaSteady,
} from '../js/control/mimo.js';

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`[PASS] ${label}`);
    passed++;
  } else {
    console.error(`[FAIL] ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared plants
// ──────────────────────────────────────────────────────────────────────────────

// 2×2 diagonal stable plant: G(0) = I  →  RGA = I at all ω (decoupled)
const diagPlant = new MIMOStateSpace(
  [[-1, 0], [0, -2]],
  [[1, 0], [0, 1]],
  [[1, 0], [0, 1]],
  [[0, 0], [0, 0]]
);

// 2×2 identity (D-only) plant: G(jω) = I for all ω
const identPlant = new MIMOStateSpace(
  [[0, 0], [0, 0]],
  [[0, 0], [0, 0]],
  [[0, 0], [0, 0]],
  [[1, 0], [0, 1]]
);

// 2×2 coupled plant: G(0) = [[2, 0.5], [0.5, 1]]
const coupledPlant = new MIMOStateSpace(
  [[-1, 0], [0, -1]],
  [[2, 0.5], [0.5, 1]],
  [[1, 0], [0, 1]],
  [[0, 0], [0, 0]]
);

// ──────────────────────────────────────────────────────────────────────────────
// Test 1: Low-frequency limit → should converge to static RGA
// ──────────────────────────────────────────────────────────────────────────────
{
  const result = dynamicRGA(diagPlant, [0.001]);
  const lam = result[0].lambda;
  const l00 = lam[0][0].magnitude; // expect ≈ 1
  const l11 = lam[1][1].magnitude; // expect ≈ 1
  assert(Math.abs(l00 - 1) < 0.01, 'Test 1a: Λ(j0.001)[0][0] ≈ 1 (low-freq limit)', `got ${l00}`);
  assert(Math.abs(l11 - 1) < 0.01, 'Test 1b: Λ(j0.001)[1][1] ≈ 1 (low-freq limit)', `got ${l11}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 2: Identity (D-only) plant → RGA = I at all frequencies
// ──────────────────────────────────────────────────────────────────────────────
{
  const result = dynamicRGA(identPlant, [100]);
  const lam = result[0].lambda;
  const l00 = lam[0][0].magnitude; // expect 1
  const l01 = lam[0][1].magnitude; // expect 0
  assert(Math.abs(l00 - 1) < 1e-10, 'Test 2a: Identity plant Λ(j100)[0][0] ≈ 1', `got ${l00}`);
  assert(Math.abs(l01) < 1e-10,     'Test 2b: Identity plant Λ(j100)[0][1] ≈ 0', `got ${l01}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 3: Column-sum property  Σ_i Λ_{ij}(jω) = 1  for each column j
// ──────────────────────────────────────────────────────────────────────────────
{
  const result = dynamicRGA(diagPlant, [1]);
  const lam = result[0].lambda;        // 2×2 array of Complex
  const p = lam.length;
  const m = lam[0].length;
  let allOk = true;
  for (let j = 0; j < m; j++) {
    let colSumRe = 0;
    let colSumIm = 0;
    for (let i = 0; i < p; i++) {
      colSumRe += lam[i][j].re;
      colSumIm += lam[i][j].im;
    }
    const dev = Math.hypot(colSumRe - 1, colSumIm);
    if (dev >= 0.01) {
      allOk = false;
      console.error(`  Column ${j} sum deviation: ${dev}`);
    }
  }
  assert(allOk, 'Test 3: Column sum Σ_i Λ_{ij}(j1) = 1 for each j');
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 4: Coupled 2×2 plant — low-freq dynamic RGA ≈ static RGA
// ──────────────────────────────────────────────────────────────────────────────
{
  const staticRga = rgaSteady(coupledPlant);          // 2×2 real array
  const dynResult = dynamicRGA(coupledPlant, [0.001]);
  const lam = dynResult[0].lambda;
  let maxDiff = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const diff = Math.abs(lam[i][j].re - staticRga[i][j]);
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  assert(maxDiff < 0.01, 'Test 4: Coupled plant dynamic RGA(j0.001) ≈ static RGA', `maxDiff=${maxDiff}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 5: Non-square plant should throw
// ──────────────────────────────────────────────────────────────────────────────
{
  // 2 outputs, 3 inputs  →  not square
  const nonsq = new MIMOStateSpace(
    [[-1, 0, 0], [0, -2, 0], [0, 0, -3]],
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[1, 0, 0], [0, 1, 0]],            // p=2, m=3
    [[0, 0, 0], [0, 0, 0]]
  );
  let threw = false;
  try {
    dynamicRGA(nonsq, [1]);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Test 5: Non-square plant throws error');
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 6: Diagonal monotonicity — decoupled plant diagonal RGA stays near 1
// ──────────────────────────────────────────────────────────────────────────────
{
  const omegas = [0.01, 0.1, 1, 10, 100];
  const diagResult = dynamicRGADiagonal(diagPlant, omegas);
  let minDiag = Infinity;
  for (const { diagonal } of diagResult) {
    for (const v of diagonal) {
      if (v < minDiag) minDiag = v;
    }
  }
  assert(minDiag > 0.9, 'Test 6: Diagonal 2×2 stable plant: min(|Λ_ii|) > 0.9 over ω∈[0.01,100]', `min=${minDiag}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
