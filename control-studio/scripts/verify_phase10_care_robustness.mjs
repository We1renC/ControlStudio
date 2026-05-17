#!/usr/bin/env node
/**
 * verify_phase10_care_robustness.mjs
 *
 * Covers CS-P10-15 (Schur CARE jω-boundary case) and CS-P10-16 (Schur vs
 * Bass / Newton-Kleinman contrast on spacecraft sparse-B). Both items live
 * in CONTROL_SYSTEM_BACKLOG.md as P1 robustness gaps.
 *
 * The intent is not to make Schur work on every boundary case (a real Schur
 * decomposition is needed for that), but to lock down what *does* happen:
 *   - boundary plants must produce a friendly, actionable error (not NaN)
 *   - the spacecraft sparse-B case must succeed via Schur and fail via
 *     Newton-Kleinman + Bass with a message that points users at Schur.
 */
import {
  solveCareHamiltonianSchur,
  solveLqrMIMO,
  analyzeLyapunov,
} from '../js/control/state-feedback.js';
import { matIdentity, matSub, matMul } from '../js/math/matrix.js';

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
// CS-P10-15. Hamiltonian CARE on jω-boundary cases
// ============================================================================

record('CS-P10-15 jω-axis uncontrollable mode produces friendly Schur error', () => {
  // Block-diagonal: controllable stable mode + uncontrollable oscillator (±j)
  // ⇒ Hamiltonian has ±j eigenvalues (not strictly Re < 0), so the stable
  // invariant subspace can't be assembled. Want a clear error, not NaN.
  const A = [
    [-1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];
  const B = [[1], [0], [0]];
  const err = expectThrow(
    () => solveCareHamiltonianSchur(A, B, matIdentity(3), [[1]]),
    (e) => /stable eigenvalues|stabiliz|jω|boundary/i.test(e.message),
    'jω boundary',
  );
  // Sanity: error must NOT mention NaN or null pointer
  assertTrue(!/NaN|undefined|null/i.test(err.message), 'error leaks NaN/undefined');
  return { detail: `error message OK (len=${err.message.length})` };
});

record('CS-P10-15 fully unstabilizable plant produces friendly Schur error', () => {
  // A is unstable (+1, -1) but B only touches stable mode ⇒ unstabilizable.
  const A = [[1, 0], [0, -1]];
  const B = [[0], [1]];
  const err = expectThrow(
    () => solveCareHamiltonianSchur(A, B, matIdentity(2), [[1]]),
    (e) => /stable eigenvalues|stabiliz|boundary/i.test(e.message),
    'unstabilizable',
  );
  assertTrue(!/NaN/i.test(err.message), 'error leaks NaN');
  return { detail: 'error message contains stabilizability hint' };
});

record('CS-P10-15 well-conditioned plant near boundary still solves with usable residual', () => {
  // A near jω-axis: damping ratio ~0.05, eigenvalues ≈ -0.05 ± j.
  // Hamiltonian eigenvalues should split cleanly into stable / unstable.
  const A = [[0, 1], [-1, -0.1]];
  const B = [[0], [1]];
  const result = solveCareHamiltonianSchur(A, B, matIdentity(2), [[1]]);
  // Residual ≤ 1e-6 considered "usable" for boundary-adjacent plants.
  assertTrue(result.riccatiResidualNorm < 1e-6,
    `near-boundary residual ${result.riccatiResidualNorm} > 1e-6`);
  assertTrue(result.closedLoopStable, 'near-boundary closed-loop unstable');
  return { detail: `residual=${result.riccatiResidualNorm.toExponential(2)}` };
});

// ============================================================================
// CS-P10-16. Schur vs Newton-Kleinman/Bass contrast on spacecraft sparse-B
// ============================================================================

const SPACECRAFT = {
  A: [
    [0, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [0, 0, -1, 0],
  ],
  B: [
    [0, 0],
    [1, 0],
    [0, 0],
    [0, 1],
  ],
};

record('CS-P10-16 Schur succeeds on spacecraft sparse-B (residual + Lyapunov-stable)', () => {
  const { A, B } = SPACECRAFT;
  const result = solveCareHamiltonianSchur(A, B, matIdentity(4), matIdentity(2));
  assertTrue(result.riccatiResidualNorm < 1e-8,
    `CARE residual ${result.riccatiResidualNorm} > 1e-8`);
  assertTrue(result.closedLoopStable, 'spacecraft Acl not Lyapunov-stable');
  // Cross-check: A_cl eigenvalues all in LHP via independent analyzeLyapunov.
  const Acl = matSub(A, matMul(B, result.K));
  const proof = analyzeLyapunov(Acl, matIdentity(4));
  assertTrue(proof.provenStable, 'independent Lyapunov proof failed');
  return { detail: `residual=${result.riccatiResidualNorm.toExponential(2)}, Acl-stable` };
});

record('CS-P10-16 Newton-Kleinman fails on spacecraft sparse-B with Schur-recommending error', () => {
  const { A, B } = SPACECRAFT;
  const err = expectThrow(
    () => solveLqrMIMO(A, B, matIdentity(4), matIdentity(2), { method: 'kleinman' }),
    (e) => /Newton-Kleinman|Bass|stabilizing/i.test(e.message),
    'Newton-Kleinman spacecraft',
  );
  // The error must recommend Schur as the actionable fix.
  assertTrue(/Schur|Hamiltonian/i.test(err.message),
    `Kleinman error must point at Schur fallback, got: "${err.message}"`);
  return { detail: 'Kleinman error recommends Schur path' };
});

record('CS-P10-16 default path (Schur first) on spacecraft delivers same K as direct Schur', () => {
  const { A, B } = SPACECRAFT;
  // Default solveLqrMIMO tries Schur first; should match the direct Schur call.
  const direct = solveCareHamiltonianSchur(A, B, matIdentity(4), matIdentity(2));
  const auto = solveLqrMIMO(A, B, matIdentity(4), matIdentity(2));
  let worst = 0;
  for (let i = 0; i < direct.K.length; i++)
    for (let j = 0; j < direct.K[0].length; j++)
      worst = Math.max(worst, Math.abs(direct.K[i][j] - auto.K[i][j]));
  assertTrue(worst < 1e-12, `default vs direct Schur K diff = ${worst}`);
  assertTrue(auto.initialGainStrategy === 'hamiltonian-schur',
    `default strategy not Schur: ${auto.initialGainStrategy}`);
  return { detail: `max ΔK=${worst.toExponential(2)}` };
});

// ----- summary --------------------------------------------------------------

const total = records.length;
console.log('');
console.log(`Phase 10 CARE robustness verification: ${total - failed}/${total} passed`);
if (failed) process.exitCode = 1;
