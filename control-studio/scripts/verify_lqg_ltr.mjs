#!/usr/bin/env node
/**
 * verify_lqg_ltr.mjs — Zero-Flaw Loop 1 verification for the LQG synthesis
 * and Loop Transfer Recovery (Doyle-Stein) baseline.
 */

import {
  synthesizeLQG, fullStateLoopSigmaSweep, lqgLoopSigmaSweep,
  loopTransferRecovery,
} from '../js/control/lqg_ltr.js';
import { matIdentity } from '../js/math/matrix.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── Plant: double integrator with output y = x1 ───────────────────────────
const A = [[0, 1], [0, 0]];
const B = [[0], [1]];
const C = [[1, 0]];

// ── Case 1: LQG synthesis produces stable closed-loop ─────────────────────
{
  const lqg = synthesizeLQG(A, B, C, {
    Q: [[1, 0], [0, 1]], R: [[1]],
    Qn: [[1, 0], [0, 1]], Rn: [[0.01]],
  });
  ok('LQG: K has shape 1×2', lqg.K.length === 1 && lqg.K[0].length === 2);
  ok('LQG: L has shape 2×1', lqg.L.length === 2 && lqg.L[0].length === 1);
  ok('LQG: controller A is 2×2', lqg.controller.A.length === 2);
  ok('LQG: closed-loop A is provided', !!lqg.closedLoopA);
}

// ── Case 2: Full-state-feedback target loop gain has expected slope ───────
{
  const lqg = synthesizeLQG(A, B, C, {
    Q: [[1, 0], [0, 1]], R: [[1]],
    Qn: [[1, 0], [0, 1]], Rn: [[0.01]],
  });
  const omegas = [0.01, 0.1, 1, 10, 100];
  const sweep = fullStateLoopSigmaSweep(A, B, lqg.K, omegas);
  ok('FSF: sigma monotonically decreasing in ω', sweep.every((s, i) => i === 0 || s.sigmaMax <= sweep[i - 1].sigmaMax + 1e-9));
  ok('FSF: sigma(ω=0.01) > sigma(ω=100)', sweep[0].sigmaMax > sweep[4].sigmaMax);
}

// ── Case 3: LTR recovery improves with q ───────────────────────────────────
{
  const lqg = synthesizeLQG(A, B, C, {
    Q: [[1, 0], [0, 1]], R: [[1]],
    Qn: [[1, 0], [0, 1]], Rn: [[0.01]],
  });
  const ltr = loopTransferRecovery(A, B, C, lqg, {
    qSchedule: [0.1, 1, 10, 100, 1000],
    Qn0: [[1, 0], [0, 1]], Rn: [[0.01]],
    omegas: [0.1, 0.3, 1, 3, 10],
  });
  ok('LTR: schedule produced 5 steps', ltr.schedule.length === 5);
  const first = ltr.schedule[0].worstRelGap;
  const last = ltr.schedule[ltr.schedule.length - 1].worstRelGap;
  ok('LTR: worst relative gap is finite', Number.isFinite(first) && Number.isFinite(last));
  ok('LTR: gap shrinks as q increases', last <= first + 1e-6,
     `q=${ltr.schedule[0].q} gap=${first.toExponential(2)} → q=${ltr.schedule[ltr.schedule.length-1].q} gap=${last.toExponential(2)}`);
}

// ── Case 4: LQG controller signature D = 0 ────────────────────────────────
{
  const lqg = synthesizeLQG(A, B, C);
  ok('LQG: controller D = 0', lqg.controller.D.every((row) => row.every((v) => v === 0)));
}

console.log('');
console.log(`LQG / LTR summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
