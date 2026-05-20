#!/usr/bin/env node
// verify_p21_sysid_advanced.mjs — Phase 21 SysID Verification

import { generatePRBS, generateChirp, generateMultiSine } from '../js/control/sysid_signals.js';
import {
  identifyOE, identifyARX, identifyBJ,
  residualWhitenessTest, crossCorrelationTest,
  computeParameterCovariance, exportModelUncertainty,
} from '../js/control/sysid.js';
import { setSeed, randn } from '../js/math/rng.js';
import { computeSVD } from '../js/math/svd.js';
import { matMul, matTranspose } from '../js/math/matrix.js';
import { identifySubspace } from '../js/control/sysid_subspace.js';
import { realSchur } from '../js/math/realschur.js';

let failed = 0;
function ok(label, cond, info = '') {
  console.log(`${cond ? '[PASS]' : '[FAIL]'} ${label}${info ? ': ' + info : ''}`);
  if (!cond) failed++;
}
function near(label, a, b, tol = 1e-3) {
  ok(`${label} ≈ ${b.toFixed(4)}`, Math.abs(a - b) < tol, `got ${a.toFixed(4)}`);
}

console.log('\n=== Phase 21: Experiment Signal Design ===\n');

try {
  // PRBS
  const prbs = generatePRBS(100, 5, 2.0);
  ok('PRBS generates correct length', prbs.length === 100);
  ok('PRBS outputs expected amplitude', prbs.every(v => Math.abs(Math.abs(v) - 2.0) < 1e-6));
  
  // A PRBS sequence of register size 5 has period 2^5 - 1 = 31.
  // Verify ALL positions repeat with the correct period (full period check).
  {
    const prbs31 = generatePRBS(65, 5, 1.0); // 2 full periods + slack
    let allPeriodic = true;
    for (let i = 0; i < 31; i++) {
      if (prbs31[i] !== prbs31[i + 31]) { allPeriodic = false; break; }
    }
    ok('PRBS period-5 is exactly 31 (full-sequence check)', allPeriodic);
  }

  // Chirp
  const chirp = generateChirp(100, 0.1, 10, 0.1);
  ok('Chirp generates correct length', chirp.length === 100);
  ok('Chirp starts at 1', Math.abs(chirp[0] - 1.0) < 1e-6);
  ok('Chirp values are bounded by [-1, 1]', chirp.every(v => v >= -1.0 && v <= 1.0));

  // Multi-Sine
  const freqs = [1, 2, 3];
  const msine = generateMultiSine(100, freqs, null, 0.1);
  ok('MultiSine generates correct length', msine.length === 100);
  ok('MultiSine values are bounded by [-1, 1]', msine.every(v => v >= -1.0001 && v <= 1.0001));

} catch (e) {
  console.error(`[FAIL] Signal Design: ${e.message}`);
  failed++;
}

console.log('\n=== Phase 21: Output Error (OE) Model ===\n');

try {
  setSeed(101);
  const N = 800;
  const u = generatePRBS(N, 7, 1.0);
  const yTrue = new Array(N).fill(0);
  const yNoisy = new Array(N).fill(0);
  
  // True plant (OE structure): y(t) = [0.4 / (1 - 0.7 q^-1)] u(t-1)
  for (let k = 1; k < N; k++) {
    yTrue[k] = 0.7 * yTrue[k - 1] + 0.4 * u[k - 1];
    yNoisy[k] = yTrue[k] + 0.5 * randn(); // High measurement noise!
  }

  const oeModel = identifyOE(u, yNoisy, 1, 1, 1, 1.0);
  const arxModel = identifyARX(u, yNoisy, 1, 1, 1, 1.0);

  // OE should be unbiased for OE noise structure
  // N=800, σ_noise=0.5, SNR≈2 → Cramér-Rao std ≈ 0.018; 3σ bound ≈ 0.054 → use 0.05
  near('OE f_1 ≈ −0.7', oeModel.f[0], -0.7, 0.05);
  near('OE b_1 ≈  0.4', oeModel.b[0], 0.4, 0.05);
  
  // ARX will be biased because it assumes A(q) e(t) instead of just e(t)
  const arx_f1_bias = Math.abs(arxModel.a[1] - (-0.7));
  const oe_f1_bias = Math.abs(oeModel.f[0] - (-0.7));
  ok('OE parameter estimate has lower bias than ARX', oe_f1_bias < arx_f1_bias, `OE bias: ${oe_f1_bias.toFixed(3)}, ARX bias: ${arx_f1_bias.toFixed(3)}`);

} catch (e) {
  console.error(`[FAIL] Advanced Parametric Models (OE): ${e.message}`);
  failed++;
}

console.log('\n=== Phase 21: Subspace ID (SVD) ===\n');

try {
  // Random 4x3 matrix
  const A = [
    [ 1, 2, 3 ],
    [ 4, 5, 6 ],
    [ 7, 8, 9 ],
    [ 10, 11, 12 ]
  ];

  const { U, S, V } = computeSVD(A);
  
  ok('SVD computes correct dimensions', U.length === 4 && U[0].length === 3 && S.length === 3 && V.length === 3 && V[0].length === 3);
  
  // Reconstruct A: U * diag(S) * V^T
  const diagS = [
    [S[0], 0, 0],
    [0, S[1], 0],
    [0, 0, S[2]]
  ];
  const US = matMul(U, diagS);
  const Vt = matTranspose(V);
  const Recon = matMul(US, Vt);
  
  let maxErr = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      maxErr = Math.max(maxErr, Math.abs(A[i][j] - Recon[i][j]));
    }
  }
  
  ok('SVD accurately reconstructs original matrix', maxErr < 1e-10, `max error: ${maxErr.toExponential(2)}`);
  ok('Singular values are sorted in descending order', S[0] >= S[1] && S[1] >= S[2]);

} catch (e) {
  console.error(`[FAIL] Subspace ID (SVD): ${e.message}`);
  failed++;
}

// ── SVD rank-deficient matrix ─────────────────────────────────────────────
// A rank-1 matrix must yield S[1]=S[2]=0 and perfect reconstruction.
// Jacobi SVD must not return NaN or crash.
console.log('\n=== Phase 21: SVD Rank-Deficient Matrix ===\n');

try {
  // Rank-1 outer product: A = [1;2;3;4] * [1,2,3]
  const Arank1 = [[1,2,3],[2,4,6],[3,6,9],[4,8,12]];
  const { U: Ur, S: Sr, V: Vr } = computeSVD(Arank1);

  ok('SVD rank-1: S[0] > 0 (only nonzero singular value)', Sr[0] > 0,
    `S[0]=${Sr[0].toFixed(4)}`);
  ok('SVD rank-1: S[1] ≈ 0 (rank deficiency)',   Math.abs(Sr[1]) < 1e-8,
    `S[1]=${Sr[1].toExponential(2)}`);
  ok('SVD rank-1: S[2] ≈ 0 (rank deficiency)',   Math.abs(Sr[2]) < 1e-8,
    `S[2]=${Sr[2].toExponential(2)}`);

  // Reconstruction: U·diag(S)·Vᵀ must still recover A
  const diagSr = [[Sr[0],0,0],[0,Sr[1],0],[0,0,Sr[2]]];
  const Reconr  = matMul(matMul(Ur, diagSr), matTranspose(Vr));
  let maxErrR = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      maxErrR = Math.max(maxErrR, Math.abs(Arank1[i][j] - Reconr[i][j]));
  ok('SVD rank-1: reconstruction error < 1e-10', maxErrR < 1e-10,
    `max err=${maxErrR.toExponential(2)}`);

} catch (e) {
  console.error(`[FAIL] SVD rank-deficient: ${e.message}`);
  failed++;
}

console.log('\n=== Phase 21: Subspace ID (System Recovery) ===\n');

try {
  setSeed(42);
  const N = 500;
  
  // Create a 2nd order discrete system:
  // x(k+1) = [0.5, 0.2; -0.1, 0.8] x(k) + [1; 0.5] u(k)
  // y(k)   = [1, 0] x(k)
  // Eigenvalues of A: ~0.65 +/- 0.13j
  
  const A_true = [[0.5, 0.2], [-0.1, 0.8]];
  const B_true = [[1.0], [0.0]];
  const C_true = [[1.0, 0.0]];
  const D_true = [[0.0]];
  
  const u = generatePRBS(N, 8, 1.0);
  const y = new Array(N).fill(0);
  let x = [0, 0];
  
  for (let k = 0; k < N; k++) {
    // y = C*x + D*u
    y[k] = C_true[0][0] * x[0] + C_true[0][1] * x[1] + D_true[0][0] * u[k];
    
    // x_next = A*x + B*u
    const x0_next = A_true[0][0] * x[0] + A_true[0][1] * x[1] + B_true[0][0] * u[k];
    const x1_next = A_true[1][0] * x[0] + A_true[1][1] * x[1] + B_true[1][0] * u[k];
    x = [x0_next, x1_next];
  }
  
  // Add slight measurement noise
  for (let k = 0; k < N; k++) {
    y[k] += 0.01 * randn();
  }
  
  // Subspace ID: order=2, horizon=10
  const model = identifySubspace(u, y, 2, 10, 1.0);
  
  // Note: A, B, C, D are only identifiable up to a similarity transformation!
  // To verify, we should check the eigenvalues of A.
  const { eigenvalues } = realSchur(model.A);
  
  // True eigenvalues: (0.5+0.8)/2 +/- sqrt((0.5-0.8)^2/4 - 0.02)
  // = 0.65 +/- sqrt(0.0225 - 0.02) = 0.65 +/- sqrt(0.0025) = 0.65 +/- 0.05
  // Actually wait: lambda^2 - 1.3 lambda + (0.4 - (-0.02)) = lambda^2 - 1.3 lambda + 0.42 = 0
  // lambda = (1.3 +/- sqrt(1.69 - 1.68))/2 = (1.3 +/- 0.1)/2 => 0.7 and 0.6.
  
  const e1 = eigenvalues[0].re;
  const e2 = eigenvalues[1].re;
  const sortedEigs = [e1, e2].sort((a, b) => b - a);
  
  near('Identified A eigenvalue 1 ≈ 0.7', sortedEigs[0], 0.7, 0.02);
  near('Identified A eigenvalue 2 ≈ 0.6', sortedEigs[1], 0.6, 0.02);

} catch (e) {
  console.error(`[FAIL] Subspace ID (System Recovery): ${e.message}\n${e.stack}`);
  failed++;
}

// ── CS-P21-02: Box-Jenkins Model ──────────────────────────────────────────
console.log('\n=== Phase 21: Box-Jenkins (BJ) Model ===\n');

try {
  setSeed(77);
  const N = 1000;
  const u = generatePRBS(N, 8, 1.0);

  // True BJ plant: B/F = 0.5 / (1 − 0.7q⁻¹), noise: C/D = (1 + 0.3q⁻¹)/(1 + 0.2q⁻¹)
  // σ_e = 0.1 → SNR ≈ 40 → fitPercent (OE-based) > 80 % is achievable
  const yTrue = new Array(N).fill(0);
  const e     = Array.from({ length: N }, () => 0.1 * randn());
  const eFilt = new Array(N).fill(0); // C/D filtered noise
  for (let k = 0; k < N; k++) {
    yTrue[k] = 0.7 * (yTrue[k - 1] ?? 0) + 0.5 * (u[k - 1] ?? 0);
    eFilt[k] = e[k] + 0.3 * (e[k - 1] ?? 0) - 0.2 * (eFilt[k - 1] ?? 0);
  }
  const yBJ = yTrue.map((v, k) => v + eFilt[k]);

  const bjModel = identifyBJ(u, yBJ, 1, 1, 1, 1, 1, 1.0, { maxIter: 40 });

  // BJ should recover process model without noise bias.
  // N=1000, σ_e=0.1, SNR≈40 → parameter std < 0.01; 4σ bound = 0.04.
  near('BJ f_1 ≈ −0.7', bjModel.f[0], -0.7, 0.04);
  near('BJ b_1 ≈  0.5', bjModel.b[0],  0.5, 0.04);
  ok('BJ fitPercent > 80', bjModel.fitPercent > 80, `got ${bjModel.fitPercent.toFixed(1)}%`);
  ok('BJ aic is finite', Number.isFinite(bjModel.aic));
  ok('BJ nc=0,nd=0 degenerates to OE', (() => {
    const m = identifyBJ(u, yBJ, 1, 1, 0, 0, 1, 1.0);
    return Array.isArray(m.c) && m.c.length === 0;
  })());

} catch (e) {
  console.error(`[FAIL] BJ model: ${e.message}\n${e.stack}`);
  failed++;
}

// ── OE / BJ near-unit-circle filter stability ─────────────────────────────
// When the true pole is at 0.99 (integrator-like), the OE/BJ simulation
// loop must not blow up to NaN/Inf — numerical stability of the IIR filter.
console.log('\n=== Phase 21: OE/BJ Near-Unit-Circle Filter Stability ===\n');

try {
  setSeed(33);
  const N_stab = 500;
  const u_stab = generatePRBS(N_stab, 7, 1.0);

  // True process: pole at 0.99, very small gain — slow integrator
  const y_stab = new Array(N_stab).fill(0);
  for (let k = 1; k < N_stab; k++)
    y_stab[k] = 0.99 * y_stab[k - 1] + 0.01 * u_stab[k - 1] + 0.01 * randn();

  const oeStab = identifyOE(u_stab, y_stab, 1, 1, 1, 1.0, { maxIter: 30 });

  ok('OE near-unit-circle: completes without error', true);
  ok('OE near-unit-circle: all yhat are finite',
    oeStab.yhat.every(v => Number.isFinite(v)));
  ok('OE near-unit-circle: fitPercent is non-negative and finite',
    Number.isFinite(oeStab.fitPercent) && oeStab.fitPercent >= 0);
  // Pole estimate should be roughly in [0.85, 1.05] — loose because SNR is low
  ok('OE near-unit-circle: identified pole in plausible range',
    Math.abs(oeStab.f[0] + 0.99) < 0.10,
    `f[0]=${oeStab.f[0].toFixed(4)}`);

} catch (e) {
  console.error(`[FAIL] OE near-unit-circle: ${e.message}`);
  failed++;
}

// ── CS-P21-04: Residual Validation + Uncertainty Export ───────────────────
console.log('\n=== Phase 21: Residual Validation ===\n');

try {
  setSeed(99);
  const N = 500;
  const u = generatePRBS(N, 7, 1.0);
  // Equation-error ARX(1,1): y[k] = 0.7·y[k−1] + 0.4·u[k−1] + e[k], e ~ N(0, 0.09)
  // Noise is injected recursively → equation error e[k] is iid white → ARX LS
  // produces white residuals when the true order is fitted.
  const yNoisy = new Array(N).fill(0);
  for (let k = 1; k < N; k++) yNoisy[k] = 0.7 * yNoisy[k - 1] + 0.4 * u[k - 1] + 0.3 * randn();

  // Equation-error ARX(1,1): noise injected at each step → true equation error
  // is white, so ARX residuals are provably white under correct identification.
  // (Additive measurement noise would produce colored MA(1) equation error.)
  const model = identifyARX(u, yNoisy, 1, 1, 1, 1.0);

  // Whiteness test on residuals
  const wt = residualWhitenessTest(model.residual.filter(Number.isFinite), 20);
  ok('Whiteness: bound95 ≈ 1.96/√N', Math.abs(wt.bound95 - 1.96 / Math.sqrt(N)) < 1e-6);
  ok('Whiteness: autocorr has 20 values', wt.autocorr.length === 20);
  // Formal Ljung-Box test: Q < χ²(20, 0.95) ≈ 31.41 at 5 % significance
  ok('Whiteness: ljungBoxCritical exposed', Number.isFinite(wt.ljungBoxCritical));
  ok('Whiteness: Ljung-Box Q < χ²(20,0.95)',
    wt.ljungBox < wt.ljungBoxCritical,
    `Q=${wt.ljungBox.toFixed(2)}, critical=${wt.ljungBoxCritical.toFixed(2)}`);

  // Cross-correlation test
  const cc = crossCorrelationTest(model.residual.filter(Number.isFinite), u.slice(0, N), 20);
  ok('CrossCorr: lags array length 41', cc.lags.length === 41);
  // Portmanteau test on past-input lags: Q_cc = N·Σr²(−j) < χ²(nlags, 0.95)
  ok('CrossCorr: portmanteau fields exposed',
    Number.isFinite(cc.portmanteau) && Number.isFinite(cc.portmanteauCritical));
  ok('CrossCorr: ARX residuals pass portmanteau Q_cc < χ²(20,0.95)',
    cc.portmanteau < cc.portmanteauCritical,
    `Q_cc=${cc.portmanteau.toFixed(2)}, critical=${cc.portmanteauCritical.toFixed(2)}`);

  // Parameter covariance
  const { Phi } = (() => {
    // Rebuild regressor for ARX(1,1,nk=1)
    const na = 1, nb = 1, nk = 1;
    const rows = [];
    for (let k = 1; k < N; k++) rows.push([-yNoisy[k - 1], u[k - nk]]);
    return { Phi: rows };
  })();
  const covResult = computeParameterCovariance(Phi, model.mse);
  ok('ParamCov: cov is 2×2', covResult.cov.length === 2 && covResult.cov[0].length === 2);
  ok('ParamCov: stderr is positive', covResult.stderr.every(s => s > 0));
  ok('ParamCov: stderr(a1) < 0.05 (well-identified)', covResult.stderr[0] < 0.05,
    `got ${covResult.stderr[0].toFixed(4)}`);

  // Uncertainty export
  // ARX(1,1): num=[0, 0.4], den=[1, -0.7]  (approx true values)
  const numEst = [0, model.b[1]];
  const denEst = [1, model.a[1]];
  const unc = exportModelUncertainty(numEst, denEst, covResult.cov, 150, 50);
  ok('Uncertainty: gainVariation is finite and ≥ 0', Number.isFinite(unc.gainVariation) && unc.gainVariation >= 0);
  ok('Uncertainty: phaseVariation in [0, 180]', unc.phaseVariation >= 0 && unc.phaseVariation <= 180);
  ok('Uncertainty: freqNorm has 50 points', unc.freqNorm.length === 50);
  ok('Uncertainty: upperMagDB ≥ nominalMagDB at all freqs',
    unc.upperMagDB.every((u, i) => u >= unc.nominalMagDB[i] - 1e-6));
  ok('Uncertainty: gainVariation < 1 (reasonable model)',
    unc.gainVariation < 1, `got ${unc.gainVariation.toFixed(3)}`);

} catch (e) {
  console.error(`[FAIL] Residual validation / uncertainty: ${e.message}\n${e.stack}`);
  failed++;
}

if (failed === 0) {
  console.log('\nP21 Signal Design: all checks passed');
} else {
  console.error(`\nP21 checks failed: ${failed}`);
  process.exit(1);
}
