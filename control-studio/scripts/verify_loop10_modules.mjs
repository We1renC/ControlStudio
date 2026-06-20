#!/usr/bin/env node
/**
 * verify_loop10_modules.mjs — Zero-Flaw Loop 10 verification:
 *   - Approximate Dynamic Programming / policy iteration LQR (Bradtke)
 *   - Wasserstein distributionally robust optimisation (Mohajerin Esfahani-Kuhn)
 *   - Unknown Input Observer (Darouach-Zasadzinski) for FDI
 */

import { policyIterationLQR, qFunctionLeastSquares } from '../js/control/adp_lqr.js';
import { solveDAREHamiltonianSign } from '../js/control/state-feedback.js';
import {
  matAdd, matMul, matSub, matTranspose,
} from '../js/math/matrix.js';
import {
  wassersteinUpperBound, dro1DGaussianMean, solveDROQuadraticScalar,
} from '../js/control/distributionally_robust.js';
import { designUIO } from '../js/estimation/unknown_input_observer.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

function maxAbsMatrix(A) {
  let m = 0;
  for (const row of A) for (const v of row) m = Math.max(m, Math.abs(v));
  return m;
}

// ── ADP policy iteration converges to discrete LQR optimal K* ────────────
{
  // Discrete double integrator with Ts = 0.1: A = [[1, 0.1],[0, 1]], B = [[0.005],[0.1]]
  const A = [[1, 0.1], [0, 1]];
  const B = [[0.005], [0.1]];
  const Q = [[1, 0], [0, 1]];
  const R = [[0.1]];
  const K0 = [[5, 5]]; // stabilising initial gain
  const result = policyIterationLQR(A, B, Q, R, K0, { maxIter: 30, tol: 1e-9 });
  const dare = solveDAREHamiltonianSign(A, B, Q, R);
  ok('ADP-PI: converged within budget', result.history.length < 30);
  ok('ADP-PI: final K is 1×2', result.K.length === 1 && result.K[0].length === 2);
  const kErr = maxAbsMatrix(matSub(result.K, dare.K));
  ok('ADP-PI: K matches DARE/LQR optimum',
     kErr < 1e-8,
     `max|ΔK|=${kErr.toExponential(2)}`);
  ok('ADP-PI: DARE residual for cross-check is zero',
     dare.dareResidualNorm < 1e-10,
     `res=${dare.dareResidualNorm.toExponential(2)}`);
  // Sanity: closed-loop eigenvalues are inside unit circle.
  const Acl = [
    [A[0][0] - B[0][0] * result.K[0][0], A[0][1] - B[0][0] * result.K[0][1]],
    [A[1][0] - B[1][0] * result.K[0][0], A[1][1] - B[1][0] * result.K[0][1]],
  ];
  // discrete stability: |trace| < 1 + det (Jury criterion)
  const tr = Acl[0][0] + Acl[1][1];
  const det = Acl[0][0] * Acl[1][1] - Acl[0][1] * Acl[1][0];
  ok('ADP-PI: closed-loop satisfies Jury (|tr| < 1 + det, det < 1)',
     Math.abs(tr) < 1 + det && det < 1,
     `tr=${tr.toFixed(3)} det=${det.toFixed(3)}`);
}

// ── Q-function LSTD recovery on synthetic data ────────────────────────────
{
  // Use the LQR fixture above; collect (x_k, u_k, x_{k+1}) under the optimal policy
  // and confirm the LS-recovered H matches the analytic H^K* up to tolerance.
  const A = [[1, 0.1], [0, 1]];
  const B = [[0.005], [0.1]];
  const Q = [[1, 0], [0, 1]];
  const R = [[0.1]];
  const K0 = [[5, 5]];
  const { K } = policyIterationLQR(A, B, Q, R, K0);
  const { P } = solveDAREHamiltonianSign(A, B, Q, R);
  // Generate deterministic off-policy excitation tuples. On-policy-only data
  // is rank-deficient for identifying the full Q(x,u) quadratic form.
  const data = [];
  for (const x0 of [-1, -0.5, 0, 0.5, 1]) {
    for (const x1 of [-1, -0.25, 0.25, 1]) {
      for (const excitation of [-0.75, 0, 0.75]) {
        const x = [x0, x1];
        const u = [-(K[0][0] * x[0] + K[0][1] * x[1]) + excitation];
        const xNext = [
          A[0][0] * x[0] + A[0][1] * x[1] + B[0][0] * u[0],
          A[1][0] * x[0] + A[1][1] * x[1] + B[1][0] * u[0],
        ];
        const uNext = [-(K[0][0] * xNext[0] + K[0][1] * xNext[1])];
        data.push({ x, u, xNext, uNext });
      }
    }
  }
  const H = qFunctionLeastSquares(data, Q, R);
  ok('LSTD-Q: H is 3×3 symmetric', H.length === 3 && Math.abs(H[0][1] - H[1][0]) < 1e-6);
  const Hxx = matAdd(Q, matMul(matTranspose(A), matMul(P, A)));
  const Hxu = matMul(matTranspose(A), matMul(P, B));
  const Hux = matMul(matTranspose(B), matMul(P, A));
  const Huu = matAdd(R, matMul(matTranspose(B), matMul(P, B)));
  const Href = [
    Hxx[0].concat(Hxu[0]),
    Hxx[1].concat(Hxu[1]),
    Hux[0].concat(Huu[0]),
  ];
  const hErr = maxAbsMatrix(matSub(H, Href));
  ok('LSTD-Q: recovered H matches analytic DARE Q-function',
     hErr < 5e-8,
     `max|ΔH|=${hErr.toExponential(2)}`);
  ok('LSTD-Q: deterministic off-policy data count is sufficient',
     data.length === 60,
     `N=${data.length}`);
  ok('LSTD-Q: H[0][0], H[1][1], H[2][2] all positive',
     H[0][0] > 0 && H[1][1] > 0 && H[2][2] > 0,
     `H_diag=[${H[0][0].toFixed(3)}, ${H[1][1].toFixed(3)}, ${H[2][2].toFixed(3)}]`);
}

// ── Wasserstein DRO scalar quadratic ──────────────────────────────────────
{
  const samples = Array.from(
    { length: 100 },
    (_, i) => Math.sin(i * 0.13) + 0.05 * Math.cos(i * 0.37),
  );
  const dro = solveDROQuadraticScalar(samples, 0.2);
  ok('DRO: optimal scalar matches empirical mean',
     Math.abs(dro.optimal - samples.reduce((s, v) => s + v, 0) / samples.length) < 1e-12);
  ok('DRO: worst-case value > nominal value',
     dro.worstCaseValue > dro.nominalValue,
     `nominal=${dro.nominalValue.toFixed(4)} worst=${dro.worstCaseValue.toFixed(4)}`);
  ok('DRO: worst-case adds exactly ε² penalty',
     Math.abs(dro.worstCaseValue - dro.nominalValue - 0.04) < 1e-12);
}

// ── Wasserstein upper-bound sanity ────────────────────────────────────────
{
  const losses = [1, 2, 3, 4, 5];
  const ub = wassersteinUpperBound(losses, 0.1, 2);
  ok('Wasserstein UB: empirical mean 3 + ε·L = 3.2',
     Math.abs(ub - 3.2) < 1e-12, `ub=${ub.toFixed(4)}`);
}

// ── DRO 1-D Gaussian mean ambiguity ──────────────────────────────────────
{
  const samples = [1, 2, 3, 4, 5];
  const r = dro1DGaussianMean(samples, 0.5);
  ok('DRO Gaussian mean: μ̂ = 3', Math.abs(r.mean - 3) < 1e-12);
  ok('DRO Gaussian mean: μ_lo = 2.5, μ_hi = 3.5',
     Math.abs(r.worstCaseMeanLo - 2.5) < 1e-12 && Math.abs(r.worstCaseMeanHi - 3.5) < 1e-12);
}

// ── UIO existence and design on a 2-state plant with scalar disturbance ──
{
  // Plant: ẋ = A x + B u + E d, y = C x
  // A unstable so an observer is required; (C E) full rank so UIO exists.
  const A = [[0, 1], [-1, -0.5]];
  const B = [[0], [1]];
  const C = [[1, 0]];
  const E = [[0], [1]];           // disturbance enters x_2 channel
  // rank(CE) = rank([[0]]) = 0 — full-rank requirement fails here. Let's use C that sees both.
  const C2 = [[1, 0], [0, 1]];
  const E2 = [[0], [1]];
  const uio = designUIO(A, B, C2, E2);
  ok('UIO: H is n×p', uio.H.length === 2 && uio.H[0].length === 2);
  ok('UIO: T = I - H C, well-formed n×n', uio.T.length === 2 && uio.T[0].length === 2);
  ok('UIO: F is n×n', uio.F.length === 2 && uio.F[0].length === 2);
  // F is the decoupled error dynamics A_1 - K_1 C from LQE design — must be Hurwitz.
  const tr = uio.F[0][0] + uio.F[1][1];
  const det = uio.F[0][0] * uio.F[1][1] - uio.F[0][1] * uio.F[1][0];
  ok('UIO: F is Hurwitz (trace < 0, det > 0)',
     tr < 0 && det > 0,
     `tr=${tr.toFixed(3)} det=${det.toFixed(3)}`);
  // T E should be the zero matrix — disturbance is decoupled.
  let zeroOk = true;
  for (let i = 0; i < 2; i++) {
    const te = uio.T[i][0] * E2[0][0] + uio.T[i][1] * E2[1][0];
    if (Math.abs(te) > 1e-9) zeroOk = false;
  }
  ok('UIO: T·E ≈ 0 (disturbance decoupled)', zeroOk);
}

console.log('');
console.log(`Loop 10 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
