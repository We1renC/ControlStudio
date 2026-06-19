#!/usr/bin/env node
/**
 * verify_passivity_kyp.mjs — Zero-Flaw Loop 1 verification for
 * passivity / KYP / port-Hamiltonian / IDA-PBC baseline.
 */

import {
  checkPositiveReal,
  storageFunctionQuadratic,
  buildLinearPortHamiltonian,
  checkEnergyBalance,
  designIDAPBC,
  passivityShortageExcess,
} from '../js/control/passivity.js';
import { matMul, matIdentity } from '../js/math/matrix.js';

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

// ── Case 1: Strictly positive real plant G(s) = 1/(s+1) ────────────────────
// State-space: A=-1, B=1, C=1, D=ε (small positive feedthrough).
{
  const A = [[-1]];
  const B = [[1]];
  const C = [[1]];
  const D = [[0.5]];
  const r = checkPositiveReal(A, B, C, D);
  ok('PR: 1/(s+1)+0.5 feasibility', r.feasible);
  ok('PR: D + D^T > 0 (SPR candidate)', r.directFeedThrough > 0);
}

// ── Case 2: Non-passive plant G(s) = (s-2)/(s+1) should be infeasible ─────
{
  const A = [[-1]];
  const B = [[1]];
  const C = [[-3]]; // = -(2 - (-1)) = -3 to produce y = -3 x + 1*u for tf (s-2)/(s+1)
  const D = [[1]];
  const r = checkPositiveReal(A, B, C, D);
  ok('PR: non-minimum-phase plant correctly rejected', !r.feasible || !r.strictlyPositiveReal);
}

// ── Case 3: Storage function evaluates to non-negative ────────────────────
{
  const A = [[-2, 0], [0, -1]];
  const sf = storageFunctionQuadratic(A);
  ok('storage: P is positive definite (V > 0 at x ≠ 0)', sf.evaluate([1, 0]) > 0 && sf.evaluate([0, 1]) > 0);
  ok('storage: V(0) = 0', Math.abs(sf.evaluate([0, 0])) < 1e-12);
}

// ── Case 4: Build a port-Hamiltonian RLC: capacitor + inductor + resistor ─
// State x = [q; phi]^T (charge, flux). J = [0 1; -1 0], R = diag(0, R_load),
// Q = diag(1/C, 1/L). g = [0;1] for voltage input on inductor.
{
  const J = [[0, 1], [-1, 0]];
  const R = [[0, 0], [0, 0.5]];
  const Q = [[1.0, 0], [0, 2.0]];      // 1/C = 1, 1/L = 2
  const g = [[0], [1]];
  const pch = buildLinearPortHamiltonian(J, R, Q, g);
  ok('PCH: constructs without throwing', !!pch);
  ok('PCH: A = (J-R)Q is 2x2', pch.A.length === 2 && pch.A[0].length === 2);
  // A should be [[0, 1*(2)],[ -(1)*1, -0.5*(2)]] = [[0,2],[-1,-1]] for these values
  ok('PCH: A[0][1] = 2 (interconnection × 1/L)', Math.abs(pch.A[0][1] - 2.0) < 1e-12);
  ok('PCH: A[1][0] = -1 (interconnection × 1/C)', Math.abs(pch.A[1][0] - (-1.0)) < 1e-12);

  // Simulate energy balance with zero input — energy must non-increase.
  const dt = 0.01;
  const T = 2.0;
  const N = Math.round(T / dt) + 1;
  const t = new Array(N);
  const x = new Array(N);
  const u = new Array(N);
  let xv = [1, 0];
  for (let k = 0; k < N; k++) {
    t[k] = k * dt;
    x[k] = xv.slice();
    u[k] = [0];
    // forward Euler with the PCH A
    const xn = [
      xv[0] + dt * (pch.A[0][0] * xv[0] + pch.A[0][1] * xv[1]),
      xv[1] + dt * (pch.A[1][0] * xv[0] + pch.A[1][1] * xv[1]),
    ];
    xv = xn;
  }
  const balance = checkEnergyBalance(pch, { t, x, u });
  ok('PCH: energy balance final ≤ initial', balance.finalEnergy <= balance.initialEnergy + 1e-3);
  ok('PCH: worst dissipation-inequality violation ≤ 1e-2', balance.worstViolation <= 1e-2,
     `worst=${balance.worstViolation.toExponential(2)}`);
}

// ── Case 5: IDA-PBC reshaping a double integrator to a damped oscillator ──
{
  // Plant: ẋ1 = x2, ẋ2 = u  ⇒ PCH-equivalent with J = [[0,1],[-1,0]], R = 0,
  // Q = I, g = [0;1].
  const J = [[0, 1], [-1, 0]];
  const R = [[0, 0], [0, 0]];
  const Q = [[1, 0], [0, 1]];
  const g = [[0], [1]];
  const pch = buildLinearPortHamiltonian(J, R, Q, g);

  // Desired: same J, add damping R_d = diag(0, 1), shape stiffness Q_d = diag(4, 1).
  const Jd = J;
  const Rd = [[0, 0], [0, 1]];
  const Qd = [[4, 0], [0, 1]];
  const design = designIDAPBC(pch, { Jd, Rd, Qd });
  ok('IDA-PBC: matching equation residual ≤ 1e-12', design.matchingResidual < 1e-12,
     `residual=${design.matchingResidual.toExponential(2)}`);
  // closed-loop A should be (J_d - R_d) Q_d
  // = [[0,1],[-1,-1]] * diag(4,1) = [[0,1],[-4,-1]]
  const Ad = design.Aclosed;
  ok('IDA-PBC: closed-loop A[1][0] = -4', Math.abs(Ad[1][0] - (-4)) < 1e-12);
  ok('IDA-PBC: closed-loop A[1][1] = -1', Math.abs(Ad[1][1] - (-1)) < 1e-12);
}

// ── Case 6: Passivity excess for an obviously SPR plant ───────────────────
{
  const A = [[-1]];
  const B = [[1]];
  const C = [[1]];
  const D = [[0.1]];
  const r = passivityShortageExcess(A, B, C, D, { grid: 21, range: 1 });
  ok('passivity index: SPR plant has non-negative excess', r.excess >= 0,
     `excess=${r.excess.toExponential(2)}`);
}

console.log('');
console.log(`Passivity / KYP / PCH summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
