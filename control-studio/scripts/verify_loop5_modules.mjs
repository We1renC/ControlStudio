#!/usr/bin/env node
/**
 * verify_loop5_modules.mjs — Zero-Flaw Loop 5 verification:
 *   - Manipulator dynamics + computed-torque control
 *   - Spectral factorization Φ(s) = Ψ(−s)Ψ(s)
 *   - Iterative Feedback Tuning (Hjalmarsson-Gevers)
 */

import {
  forwardDynamics, inverseDynamics, computedTorqueStep, twoLinkPlanarModel,
} from '../js/control/manipulator_dynamics.js';
import { spectralFactor } from '../js/control/spectral_factorization.js';
import { iterativeFeedbackTuning } from '../js/control/ift.js';
import { TransferFunction } from '../js/control/transfer-function.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else      { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}

// ── 2-DOF manipulator forward/inverse consistency ─────────────────────────
{
  const model = twoLinkPlanarModel();
  const q = [0.5, -0.3];
  const qd = [0.1, 0.2];
  const qdd = [0.3, -0.1];
  const tau = inverseDynamics(model, q, qd, qdd);
  ok('manip: inverse dynamics returns 2-vector', tau.length === 2);
  const qddRecov = forwardDynamics(model, q, qd, tau);
  let resid = 0;
  for (let i = 0; i < 2; i++) resid = Math.max(resid, Math.abs(qddRecov[i] - qdd[i]));
  ok('manip: inverse → forward consistency (residual < 1e-9)', resid < 1e-9,
     `||q̈ recov − q̈||∞ = ${resid.toExponential(2)}`);

  // Computed-torque tracking step
  const desired = { qd: [1.0, -0.5], qdDot: [0, 0], qdDDot: [0, 0] };
  const gains = { Kp: [[100, 0], [0, 100]], Kv: [[20, 0], [0, 20]] };
  const tauCT = computedTorqueStep(model, q, qd, desired, gains);
  ok('CT: torque has length 2 and finite', tauCT.length === 2 && tauCT.every(Number.isFinite));

  // Closed-loop simulation: track step to qd over 2 seconds
  const Ts = 1e-3, T = 2.0, N = Math.round(T / Ts);
  let qSim = [0, 0], qdSim = [0, 0];
  let tracked = false;
  for (let k = 0; k < N; k++) {
    const taus = computedTorqueStep(model, qSim, qdSim, desired, gains);
    const qdds = forwardDynamics(model, qSim, qdSim, taus);
    for (let i = 0; i < 2; i++) {
      qdSim[i] += Ts * qdds[i];
      qSim[i] += Ts * qdSim[i];
    }
  }
  const errFinal = Math.hypot(qSim[0] - desired.qd[0], qSim[1] - desired.qd[1]);
  ok('CT: closed-loop tracking error < 1e-4 after 2 s',
     errFinal < 1e-4, `||e||₂=${errFinal.toExponential(2)}`);
}

// ── Spectral factorization Φ(s) = 1/(s² + 1)·(−s² + 1)? Let's use a stable example ─
{
  // Take Ψ(s) = (s + 2) / (s + 1). Then Φ(s) = Ψ(−s)Ψ(s) = (−s + 2)(s + 2) / ((−s + 1)(s + 1))
  //                                          = (4 − s²) / (1 − s²) = (−s² + 4)/(−s² + 1)
  // descending: num = [-1, 0, 4], den = [-1, 0, 1]
  const Phi = new TransferFunction([-1, 0, 4], [-1, 0, 1]);
  const { Psi, gain } = spectralFactor(Phi);
  ok('SF: Ψ produced finite gain K', gain > 0 && Number.isFinite(gain));
  // Verify |Ψ(jω)|² · |Ψ(−jω is conjugate)|² = Φ(jω) at several ω
  const omegas = [0.5, 1.0, 2.0, 5.0];
  let worst = 0;
  for (const w of omegas) {
    const sJW = { re: 0, im: w };
    const phi = evalRatio(Phi.num, Phi.den, sJW);
    const psi = evalRatio(Psi.num, Psi.den, sJW);
    const psiMag2 = psi.re * psi.re + psi.im * psi.im;
    const phiMag = Math.abs(phi.re);
    const rel = Math.abs(phiMag - psiMag2) / Math.max(phiMag, 1e-9);
    if (rel > worst) worst = rel;
  }
  ok('SF: |Ψ(jω)|² matches Φ(jω) within 5%', worst < 5e-2, `worst rel = ${(worst*100).toFixed(2)}%`);
}

// ── IFT convergence on toy quadratic ─────────────────────────────────────
{
  // Plant simulator: y(theta) = theta · ref (linear gain plant)
  // Reference y_d = 1.5 · ref. Optimal theta* = 1.5.
  const N = 100;
  const ref = new Array(N).fill(0).map((_, i) => Math.sin(0.1 * i));
  const simulate = (theta) => {
    const y = ref.map((v) => theta * v);
    const yd = ref.map((v) => 1.5 * v);
    return { y, yd };
  };
  const result = iterativeFeedbackTuning(simulate, 0.5, { iterations: 50, stepSize: 1.0 });
  ok('IFT: converges close to optimum θ* = 1.5', Math.abs(result.theta - 1.5) < 1e-3,
     `θ_final=${result.theta.toFixed(5)}`);
  // J monotonically decreases (allowing small noise)
  let monotone = true;
  for (let i = 1; i < result.history.length; i++) {
    if (result.history[i].J > result.history[i - 1].J + 1e-9) { monotone = false; break; }
  }
  ok('IFT: cost J is non-increasing', monotone);
}

function evalRatio(num, den, s) {
  // Evaluate ratio of polynomials at complex s.
  const cn = polyEval(num, s);
  const cd = polyEval(den, s);
  const denMag = cd.re * cd.re + cd.im * cd.im;
  return {
    re: (cn.re * cd.re + cn.im * cd.im) / denMag,
    im: (cn.im * cd.re - cn.re * cd.im) / denMag,
  };
}

function polyEval(p, s) {
  let acc = { re: 0, im: 0 };
  for (const c of p) {
    const prevRe = acc.re, prevIm = acc.im;
    acc.re = prevRe * s.re - prevIm * s.im + c;
    acc.im = prevRe * s.im + prevIm * s.re;
  }
  return acc;
}

console.log('');
console.log(`Loop 5 modules summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
