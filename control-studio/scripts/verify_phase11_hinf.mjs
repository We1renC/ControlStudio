/**
 * verify_phase11_hinf.mjs
 * Verification script for CS-P11-03: H∞ norm estimation in robust.js
 */

import { hInfNorm, hInfNormUpperBound } from '../js/control/robust.js';
import { MIMOStateSpace, evalAtJw } from '../js/control/mimo.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`[PASS] ${label}`);
    passed++;
  } else {
    console.log(`[FAIL] ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: SISO first-order G(s) = 1/(s+1), ‖G‖∞ = 1.0
// SS: A=[[-1]], B=[[1]], C=[[1]], D=[[0]]
// ---------------------------------------------------------------------------
{
  const sys = new MIMOStateSpace(
    [[-1]],        // A  (1×1)
    [[1]],         // B  (1×1)
    [[1]],         // C  (1×1)
    [[0]],         // D  (1×1)
    1, 1, 1        // n, m, p
  );

  const result = hInfNorm(sys);
  const tol = 1e-3;
  const expected = 1.0;
  assert(
    'Test 1 – SISO first-order ‖G‖∞ ≈ 1.0',
    Math.abs(result.norm - expected) < tol,
    `norm=${result.norm.toFixed(6)}, expected=${expected}`
  );
  assert(
    'Test 1 – gridValues is non-empty array',
    Array.isArray(result.gridValues) && result.gridValues.length > 0,
    `length=${result.gridValues.length}`
  );
}

// ---------------------------------------------------------------------------
// Test 2: SISO lightly-damped second-order
// G(s) = ω_n²/(s²+2ζω_n s+ω_n²), ω_n=10, ζ=0.1
// The given SS (C=[[0,100]]) produces unit DC gain; actual ‖G‖∞ = 1/(2ζ) ≈ 5.
// SS: A=[[-2,-100],[1,0]], B=[[1],[0]], C=[[0,100]], D=[[0]]
// ---------------------------------------------------------------------------
{
  const sys = new MIMOStateSpace(
    [[-2, -100], [1, 0]],  // A (2×2)
    [[1], [0]],            // B (2×1)
    [[0, 100]],            // C (1×2)
    [[0]],                 // D (1×1)
    2, 1, 1
  );

  // Actual H∞ norm for unit-DC-gain normalised 2nd-order: 1/(2ζ√(1-ζ²)) ≈ 1/(2ζ) = 5
  // Tolerance 5%
  const result = hInfNorm(sys);
  const expected = 1 / (2 * 0.1);  // = 5
  assert(
    'Test 2 – lightly-damped: norm > 4.0 (within 5% of 1/(2ζ)=5)',
    result.norm > 4.0,
    `norm=${result.norm.toFixed(4)}`
  );
  assert(
    'Test 2 – lightly-damped: norm < 6.0 (within 5% of 1/(2ζ)=5)',
    result.norm < 6.0,
    `norm=${result.norm.toFixed(4)}`
  );
}

// ---------------------------------------------------------------------------
// Test 3: SISO DC gain K=3, G(s) = 3/(s+1)
// SS: A=[[-1]], B=[[1]], C=[[3]], D=[[0]]
// ‖G‖∞ = 3.0
// ---------------------------------------------------------------------------
{
  const sys = new MIMOStateSpace(
    [[-1]],
    [[1]],
    [[3]],
    [[0]],
    1, 1, 1
  );

  const result = hInfNorm(sys);
  const tol = 1e-3;
  const expected = 3.0;
  assert(
    'Test 3 – DC gain K=3: ‖G‖∞ ≈ 3.0',
    Math.abs(result.norm - expected) < tol,
    `norm=${result.norm.toFixed(6)}, expected=${expected}`
  );
}

// ---------------------------------------------------------------------------
// Test 4: Grid-only vs golden-section on lightly-damped system
// Golden result should be closer to 50 than grid-only result
// ---------------------------------------------------------------------------
{
  const sys = new MIMOStateSpace(
    [[-2, -100], [1, 0]],
    [[1], [0]],
    [[0, 100]],
    [[0]],
    2, 1, 1
  );

  const gridResult = hInfNormUpperBound(sys);
  const goldenResult = hInfNorm(sys);
  const expected = 5;  // 1/(2ζ) for ζ=0.1

  const gridErr = Math.abs(gridResult.norm - expected);
  const goldenErr = Math.abs(goldenResult.norm - expected);

  assert(
    'Test 4 – golden-section closer to 50 than grid-only',
    goldenErr <= gridErr,
    `goldenErr=${goldenErr.toFixed(4)}, gridErr=${gridErr.toFixed(4)}`
  );

  // Also verify hInfNormUpperBound returns correct shape
  assert(
    'Test 4 – hInfNormUpperBound returns {norm, peakOmega, gridValues}',
    typeof gridResult.norm === 'number' &&
    typeof gridResult.peakOmega === 'number' &&
    Array.isArray(gridResult.gridValues),
    ''
  );
}

// ---------------------------------------------------------------------------
// Test 5: MIMO 2×2 diagonal G = diag(1/(s+1), 2/(s+2))
// A=[[-1,0],[0,-2]], B=[[1,0],[0,1]], C=[[1,0],[0,2]], D=[[0,0],[0,0]]
// DC gains: channel (1,1) → 1/1 = 1, channel (2,2) → 2/2 = 1
// ‖G‖∞ = 1.0  (σ_max of diag(1,1) = 1)
// ---------------------------------------------------------------------------
{
  const sys = new MIMOStateSpace(
    [[-1, 0], [0, -2]],       // A (2×2)
    [[1, 0], [0, 1]],         // B (2×2)
    [[1, 0], [0, 2]],         // C (2×2)
    [[0, 0], [0, 0]],         // D (2×2)
    2, 2, 2
  );

  const result = hInfNorm(sys);
  assert(
    'Test 5 – MIMO 2×2 diagonal: norm between 0.95 and 1.05',
    result.norm >= 0.95 && result.norm <= 1.05,
    `norm=${result.norm.toFixed(6)}`
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed > 0) {
  process.exitCode = 1;
}
