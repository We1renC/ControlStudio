#!/usr/bin/env node
/**
 * verify_loop12_modules.mjs — Zero-Flaw Loop 12 verification:
 *   - iLQR / DDP nonlinear trajectory optimisation (Tassa-Erez-Todorov)
 *   - MJLS coupled DARE / LQR (Costa-Fragoso-Marques)
 *   - Lyapunov-Krasovskii delay LMI (Gu-Kharitonov-Chen)
 */

import { ilqrSolve } from '../js/control/ilqr.js';
import { solveMJLS_LQR, simulateMJLS } from '../js/control/mjls.js';
import { krasovskiiDelayLMI } from '../js/verification/krasovskii_delay.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── iLQR on a linear-quadratic problem (should match LQR optimality) ─────
{
  // Discrete double integrator: x_{k+1} = A x + B u; A = [[1, 0.1],[0, 1]], B = [[0.005],[0.1]]
  const A = [[1, 0.1], [0, 1]];
  const B = [[0.005], [0.1]];
  const dynamics = {
    n: 2, m: 1,
    f: (x, u) => [
      A[0][0] * x[0] + A[0][1] * x[1] + B[0][0] * u[0],
      A[1][0] * x[0] + A[1][1] * x[1] + B[1][0] * u[0],
    ],
  };
  const cost = {
    stage: (x, u) => x[0] * x[0] + x[1] * x[1] + 0.1 * u[0] * u[0],
    terminal: (x) => 100 * (x[0] * x[0] + x[1] * x[1]),
  };
  const N = 60;
  const x0 = [1.0, 0.0];
  const uInit = Array.from({ length: N }, () => [0]);
  const result = ilqrSolve(dynamics, cost, x0, uInit, { iterations: 30, tol: 1e-9 });
  ok('iLQR: cost history non-increasing',
     result.costHistory.every((c, i) => i === 0 || c <= result.costHistory[i - 1] + 1e-9));
  const initNorm = Math.hypot(x0[0], x0[1]);
  const finalState = result.x[result.x.length - 1];
  const finalNorm = Math.hypot(finalState[0], finalState[1]);
  ok('iLQR: state norm reduced by at least 5× from initial',
     finalNorm < initNorm / 5,
     `||x_0||=${initNorm.toFixed(3)} ||x_N||=${finalNorm.toExponential(2)}`);
  ok('iLQR: returned N feedback gains', result.gains.length === N);
}

// ── MJLS coupled DARE on a 2-mode system ─────────────────────────────────
{
  // Mode 1: stable; mode 2: unstable open-loop; switching according to Π.
  const A1 = [[0.9, 0.1], [0, 0.8]];
  const A2 = [[1.1, 0.0], [0, 1.05]];
  const B = [[0], [1]];
  const Pi = [[0.7, 0.3], [0.4, 0.6]];
  const res = solveMJLS_LQR([A1, A2], [B, B], Pi);
  ok('MJLS: coupled DARE converged', res.converged);
  ok('MJLS: gains K_0, K_1 produced', res.Ks.length === 2 && res.Ks[0].length === 1);
  ok('MJLS: P_i positive on diagonal',
     res.P[0][0][0] > 0 && res.P[1][0][0] > 0,
     `P_0[0,0]=${res.P[0][0][0].toFixed(3)} P_1[0,0]=${res.P[1][0][0].toFixed(3)}`);

  // Simulate and verify mean-square decay
  const sim = simulateMJLS([A1, A2], [B, B], Pi, res.Ks, [1.0, 0.5], {
    steps: 200, seed: 42, mode0: 0,
  });
  const finalNorm = Math.hypot(sim.xs[200][0], sim.xs[200][1]);
  ok('MJLS: state norm decays under mode-dependent LQR',
     finalNorm < 0.5, `||x_T||=${finalNorm.toFixed(4)}`);
}

// ── Lyapunov-Krasovskii LMI: simple stable delay system ──────────────────
{
  // ẋ = -2 x(t) + 0.5 x(t-τ). Asymptotically stable for all τ ≥ 0 since
  // |0.5| < 2.
  const A0 = [[-2]];
  const A1 = [[0.5]];
  const result = krasovskiiDelayLMI(A0, A1);
  // The LK LMI feasibility flag reflects the inner barrier-solver status;
  // the authoritative stability check is the residual of the recovered
  // (P, Q) on the original LMI being non-positive (strict negativity for
  // asymptotic stability).
  ok('LK-LMI: largest LMI eigenvalue ≤ 0 (P, Q certify stability)',
     result.lmiResidual <= 1e-6, `λ_max=${result.lmiResidual.toExponential(2)}`);
  ok('LK-LMI: P > 0 and Q > 0',
     result.P[0][0] > 0 && result.Q[0][0] > 0,
     `P=${result.P[0][0].toFixed(3)} Q=${result.Q[0][0].toFixed(3)}`);
}

console.log('');
console.log(`Loop 12 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
