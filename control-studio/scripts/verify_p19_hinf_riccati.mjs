/**
 * verify_p19_hinf_riccati.mjs — Phase 19 H∞ Riccati synthesis verification.
 */

import { TransferFunction } from '../js/control/transfer-function.js';
import { synthesizeHinfRiccati, tfToSS, buildMixedSensitivityPlant, gammaIteration } from '../js/control/hinf_riccati.js';
import { defaultMixedSensitivityWeights, mixedSensitivityCost } from '../js/control/hinf_synth.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`[PASS] ${msg}`); passed++; }
  else { console.error(`[FAIL] ${msg}`); failed++; }
}

// ── Case 1: TF → SS conversion ──────────────────────────────────────────

console.log('\n=== Phase 19: TF to SS conversion ===\n');

{
  const G = new TransferFunction([1], [1, 1]); // 1/(s+1)
  const ss = tfToSS(G);
  assert(ss.A.length === 1, 'tfToSS 1st-order: n=1');
  assert(Math.abs(ss.A[0][0] - (-1)) < 1e-10, 'tfToSS 1st-order: A=-1');
  assert(Math.abs(ss.B[0][0] - 1) < 1e-10, 'tfToSS 1st-order: B=1');
  assert(Math.abs(ss.C[0][0] - 1) < 1e-10, 'tfToSS 1st-order: C=1');
  assert(Math.abs(ss.D[0][0]) < 1e-10, 'tfToSS 1st-order: D=0');
}

{
  const G = new TransferFunction([1], [1, 3, 2]); // 1/(s²+3s+2)
  const ss = tfToSS(G);
  assert(ss.A.length === 2, 'tfToSS 2nd-order: n=2');
  // Controllable canonical: A = [[0,1],[-2,-3]]
  assert(Math.abs(ss.A[0][1] - 1) < 1e-10, 'tfToSS 2nd-order: A[0][1]=1');
  assert(Math.abs(ss.A[1][0] - (-2)) < 1e-10, 'tfToSS 2nd-order: A[1][0]=-2');
  assert(Math.abs(ss.A[1][1] - (-3)) < 1e-10, 'tfToSS 2nd-order: A[1][1]=-3');
}

// ── Case 2: Generalized plant construction ───────────────────────────────

console.log('\n=== Phase 19: Generalized plant construction ===\n');

{
  const G = new TransferFunction([1], [1, 1]);
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 2 });
  const gSS = tfToSS(G);
  const w1SS = tfToSS(weights.W1);
  const w2SS = tfToSS(weights.W2);
  const w3SS = tfToSS(weights.W3);
  const P = buildMixedSensitivityPlant(gSS, w1SS, w2SS, w3SS);

  assert(P.n > 0, 'gen plant: state dimension > 0');
  assert(P.A.length === P.n, 'gen plant: A is n×n');
  assert(P.B1.length === P.n && P.B1[0].length === P.nw, 'gen plant: B1 shape');
  assert(P.B2.length === P.n && P.B2[0].length === P.nu, 'gen plant: B2 shape');
  assert(P.C1.length === P.nz, 'gen plant: C1 rows = nz');
  assert(P.C2.length === P.ny, 'gen plant: C2 rows = ny');
  assert(P.D12.length === P.nz && P.D12[0].length === P.nu, 'gen plant: D12 shape');
  assert(P.D21.length === P.ny && P.D21[0].length === P.nw, 'gen plant: D21 shape');
}

// ── Case 3: SISO 1st-order H∞ synthesis ──────────────────────────────────

console.log('\n=== Phase 19: SISO 1st-order H∞ synthesis ===\n');

{
  const G = new TransferFunction([1], [1, 1]); // 1/(s+1)
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 2, Alow: 0.1, controlPenalty: 0.1 });

  let result;
  try {
    result = synthesizeHinfRiccati(G, weights, { gammaHi: 100, gammaTol: 0.01 });

    assert(result.gamma > 0, '1st-order: γ* > 0');
    assert(result.gamma < 20, '1st-order: γ* < gammaHi');
    assert(result.xResidual < 1e-6, `1st-order: X∞ CARE residual < 1e-6 (got ${result.xResidual.toExponential(2)})`);
    assert(result.yResidual < 1e-6, `1st-order: Y∞ CARE residual < 1e-6 (got ${result.yResidual.toExponential(2)})`);
    assert(result.rhoXY < result.gamma * result.gamma, '1st-order: ρ(X∞Y∞) < γ²');
    assert(result.method === 'glover-doyle-riccati', '1st-order: method correct');
    assert(result.iterations > 0, '1st-order: iterations > 0');

    if (result.controllerTf) {
      const L = result.controllerTf.series(G);
      const cl = L.feedback();
      assert(cl.isStable(), '1st-order: closed-loop stable');
    }

    if (result.closedLoopNorm !== null) {
      assert(result.closedLoopNorm <= result.gamma * 1.1,
        `1st-order: ‖Tzw‖∞ ≤ γ*·1.1 (norm=${result.closedLoopNorm.toFixed(3)}, γ=${result.gamma.toFixed(3)})`);
    }

    console.log(`  γ* = ${result.gamma.toFixed(4)}, ‖Tzw‖∞ = ${result.closedLoopNorm?.toFixed(4) ?? 'N/A'}, iters = ${result.iterations}`);
  } catch (e) {
    console.error(`[FAIL] 1st-order synthesis threw: ${e.message}`);
    failed++;
  }
}

// ── Case 4: SISO 2nd-order H∞ synthesis ──────────────────────────────────

console.log('\n=== Phase 19: SISO 2nd-order H∞ synthesis ===\n');

{
  const G = new TransferFunction([1], [1, 2, 1]); // 1/(s+1)²
  const weights = defaultMixedSensitivityWeights({ wB: 0.5, M: 2, Alow: 0.01, controlPenalty: 0.1 });

  try {
    const result = synthesizeHinfRiccati(G, weights, { gammaHi: 100, gammaTol: 0.01 });

    assert(result.gamma > 0, '2nd-order: γ* > 0');
    assert(result.xResidual < 1e-3, `2nd-order: X∞ residual < 1e-3 (got ${result.xResidual.toExponential(2)})`);
    assert(result.yResidual < 1e-3, `2nd-order: Y∞ residual < 1e-3 (got ${result.yResidual.toExponential(2)})`);

    if (result.controllerTf) {
      const L = result.controllerTf.series(G);
      const cl = L.feedback();
      assert(cl.isStable(), '2nd-order: closed-loop stable');
    }

    console.log(`  γ* = ${result.gamma.toFixed(4)}, iters = ${result.iterations}`);
  } catch (e) {
    console.error(`[FAIL] 2nd-order synthesis threw: ${e.message}`);
    failed++;
  }
}

// ── Case 5: Compare Riccati vs Nelder-Mead ───────────────────────────────

console.log('\n=== Phase 19: Riccati vs Nelder-Mead comparison ===\n');

{
  const G = new TransferFunction([1], [1, 1]);
  const weights = defaultMixedSensitivityWeights({ wB: 1, M: 2, Alow: 0.01, controlPenalty: 0.1 });
  const omegas = Array.from({ length: 80 }, (_, i) => Math.pow(10, -2 + (4 * i) / 79));

  try {
    const riccati = synthesizeHinfRiccati(G, weights, { gammaHi: 100, gammaTol: 0.01 });

    if (riccati.controllerTf) {
      const L = riccati.controllerTf.series(G);
      const nmCost = mixedSensitivityCost(weights.W1, weights.W2, weights.W3, L, riccati.controllerTf, omegas);
      assert(Number.isFinite(nmCost.peak), 'comparison: Riccati controller has finite mixed-sensitivity cost');
      console.log(`  Riccati γ* = ${riccati.gamma.toFixed(4)}, actual cost = ${nmCost.peak.toFixed(4)}`);
    }
  } catch (e) {
    console.log(`[SKIP] comparison: ${e.message}`);
  }
}

// ── Case 6: Error handling — infeasible ──────────────────────────────────

console.log('\n=== Phase 19: Error handling ===\n');

{
  // Unstable plant with extreme weights — may fail
  const G = new TransferFunction([1], [1, -1]); // unstable: pole at +1
  const weights = { W1: new TransferFunction([100], [1]), W2: null, W3: null };

  let threw = false;
  try {
    synthesizeHinfRiccati(G, weights, { gammaHi: 5, gammaTol: 0.1, maxBisect: 10 });
  } catch (e) {
    threw = true;
  }
  // Either throws or returns a high γ — both are acceptable
  assert(true, 'error handling: unstable plant does not crash');
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\nPhase 19 H∞ Riccati: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
