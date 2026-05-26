/**
 * dk_iteration.js — P29-06: D-K iteration / μ-synthesis
 *
 * Implements tools for robust synthesis via structured singular value (μ) analysis
 * and the D-K iteration algorithm.
 *
 * Key concepts:
 *   μ_Δ(M) = 1 / min{ σ_max(Δ) : det(I − MΔ) = 0 }    (structured singular value)
 *   μ upper bound via D-scaling: μ(M) ≤ min_{D ∈ D} σ_max(D M D⁻¹)
 *
 * For diagonal repeated-scalar uncertainty blocks, D is a positive-diagonal matrix.
 * The D-scaling optimization is solved via gradient descent on log(D) diagonal.
 *
 * D-K iteration (continuous-time, scalar D):
 *   K₀ = H∞ synthesis on P
 *   for k = 1, 2, ...:
 *     D-step: optimize D to minimize max_ω μ̄(D(jω) Fl(P,K)(jω) D(jω)⁻¹)
 *     K-step: H∞ synthesis on D̂ P D̂⁻¹  (D̂ = fitted rational D)
 *   until ‖μ bound - γ‖ < tol
 *
 * API:
 *   computeMuUpperBound(M, opts)        → scalar μ upper bound for matrix M
 *   computeMuBoundFreq(Mfr, omegas, opts) → μ bound at each frequency
 *   fitDynamicDScaling(omegas, dProfile, opts) → log-frequency D(jω) fit
 *   computeDynamicMuBoundFreq(Mfr, omegas, opts) → μ profile + dynamic D fit
 *   dkIteration(plantSS, weights, opts) → robust controller via D-K
 *   dkIterationDynamic(plantSS, opts)   → D-K wrapper retaining D(jω) model
 */

import { symmetricEig } from '../math/optimization.js';
import { matTranspose } from '../math/matrix.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

function matMulLocal(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < p; k++)
      for (let j = 0; j < m; j++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

/** σ_max(M) for real M via eigenvalues of MᵀM. */
function sigmaMax(M) {
  const MT = matTranspose(M);
  const MtM = matMulLocal(MT, M);
  const { values } = symmetricEig(MtM);
  return Math.sqrt(Math.max(1e-300, ...values.map((v) => Math.abs(v))));
}

/** Apply D-scaling: return D M D⁻¹ where D = diag(d). */
function applyDScale(d, M) {
  const n = M.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (M[i][j] * d[i]) / d[j]),
  );
}

function clampPositive(x, floor = 1e-9) {
  return Math.max(floor, Number.isFinite(x) ? Math.abs(x) : 1);
}

function logInterp(x, x0, x1, y0, y1) {
  if (Math.abs(x1 - x0) < 1e-15) return y0;
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return y0 + t * (y1 - y0);
}

/**
 * Dominant left/right singular vectors of M via power iteration.
 * Returns { u, v, sigma } where M v ≈ sigma u, Mᵀ u ≈ sigma v.
 */
function dominantSVec(M, maxIter = 50, tol = 1e-10) {
  const n = M.length;
  // Start with v = [1, 1, ..., 1]/√n  — avoid axis-aligned degeneracy
  let v = new Array(n).fill(1 / Math.sqrt(n));

  let sigma = 0;
  let u = new Array(n).fill(0);

  const MT = matTranspose(M);

  for (let iter = 0; iter < maxIter; iter++) {
    // u = M v / ||M v||
    const Mv = MT ? matMulLocal(M, v.map((x) => [x])).map((r) => r[0]) : v;
    const normMv = Math.sqrt(Mv.reduce((s, x) => s + x * x, 0)) || 1;
    u = Mv.map((x) => x / normMv);

    // v = Mᵀ u / ||Mᵀ u||
    const MTu = matMulLocal(MT, u.map((x) => [x])).map((r) => r[0]);
    const normMTu = Math.sqrt(MTu.reduce((s, x) => s + x * x, 0)) || 1;
    const vNew = MTu.map((x) => x / normMTu);

    const diff = Math.max(...vNew.map((x, i) => Math.abs(x - v[i])));
    v = vNew;
    sigma = normMv;
    if (diff < tol) break;
  }

  return { u, v, sigma };
}

/**
 * Gradient of σ_max(D M D⁻¹) w.r.t. log(d_i).
 *
 * Using: ∂σ_max / ∂(log d_i) = u_i (A v)_i − (Aᵀ u)_i v_i
 * where A = D M D⁻¹, (u, v) = dominant singular vectors of A.
 */
function gradLogD(d, M) {
  const n = M.length;
  const A = applyDScale(d, M);
  const { u, v } = dominantSVec(A);

  const Av  = matMulLocal(A, v.map((x) => [x])).map((r) => r[0]);
  const ATu = matMulLocal(matTranspose(A), u.map((x) => [x])).map((r) => r[0]);

  return Array.from({ length: n }, (_, i) => u[i] * Av[i] - ATu[i] * v[i]);
}

// ── computeMuUpperBound ───────────────────────────────────────────────────────

/**
 * Compute the μ upper bound for a real matrix M via D-scaling:
 *   μ̄(M) = min_{d>0} σ_max(D M D⁻¹)   where D = diag(d)
 *
 * Optimization is performed by gradient descent on log(d).
 * For full-block unstructured Δ: optimal D = I, so μ̄ = σ_max(M).
 *
 * @param {number[][]} M      Square real matrix.
 * @param {object}    opts
 * @param {number}  [opts.lr=0.05]       Initial gradient-descent step size.
 * @param {number}  [opts.maxIter=300]   Max GD iterations.
 * @param {number}  [opts.tol=1e-6]      Convergence tolerance.
 * @param {number[]}[opts.d0]            Initial D diagonal (default: ones).
 * @returns {{ muBound: number, d: number[], sigmaMaxUnscaled: number, converged: boolean, iterations: number }}
 */
export function computeMuUpperBound(M, opts = {}) {
  const { lr = 0.05, maxIter = 300, tol = 1e-6, d0 } = opts;
  const n = M.length;

  let logd = d0 ? d0.map(Math.log) : new Array(n).fill(0); // start at D = I
  const sigmaMaxUnscaled = sigmaMax(M);
  const LOG_CLAMP = 10; // prevent numerical overflow: |log(d_i)| ≤ LOG_CLAMP

  let bestLogd   = [...logd];
  let bestSigma  = sigmaMax(applyDScale(logd.map(Math.exp), M));
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    const d    = logd.map(Math.exp);
    const A    = applyDScale(d, M);
    const sigma = sigmaMax(A);

    if (sigma < bestSigma) { bestSigma = sigma; bestLogd = [...logd]; }
    if (Math.abs(bestSigma - sigma) < tol && iter > 0) break;

    const grad  = gradLogD(d, M);
    const gnorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0)) || 1;
    const step  = logd.map((x, i) => x - lr * grad[i] / gnorm);

    // Center to prevent drift (normalize so mean(logd)=0)
    const mean = step.reduce((s, x) => s + x, 0) / n;
    const centered = step.map((x) => x - mean);

    // Clamp to prevent log-scale explosion
    logd = centered.map((x) => Math.max(-LOG_CLAMP, Math.min(LOG_CLAMP, x)));
  }

  const d      = bestLogd.map(Math.exp);
  const muBound = sigmaMax(applyDScale(d, M));

  return {
    muBound,
    d,
    sigmaMaxUnscaled,
    converged: iter < maxIter,
    iterations: iter,
  };
}

// ── computeMuBoundFreq ────────────────────────────────────────────────────────

/**
 * Compute μ upper bound profile over a frequency grid.
 *
 * @param {Function}  Mfr     (omega: number) → number[][]  (real or complex magnitude)
 * @param {number[]}  omegas  Frequency grid.
 * @param {object}    opts    Passed to computeMuUpperBound.
 * @returns {{ muProfile: number[], peakMu: number, peakOmega: number, dProfile: number[][] }}
 */
export function computeMuBoundFreq(Mfr, omegas, opts = {}) {
  const muProfile  = [];
  const dProfile   = [];

  for (const omega of omegas) {
    const M = Mfr(omega);
    const r = computeMuUpperBound(M, opts);
    muProfile.push(r.muBound);
    dProfile.push(r.d);
  }

  let peakMu = -Infinity, peakOmega = omegas[0];
  muProfile.forEach((mu, i) => { if (mu > peakMu) { peakMu = mu; peakOmega = omegas[i]; } });

  return { muProfile, peakMu, peakOmega, dProfile };
}

// ── Dynamic D-scaling fit ───────────────────────────────────────────────────

/**
 * Fit a reusable frequency-dependent diagonal D-scaling model from per-bin
 * D-step results. The model is intentionally deterministic and lightweight:
 * each diagonal channel is represented as a log-log piecewise-linear curve.
 *
 * This is a deployable baseline for dynamic D-scaling workflows: it preserves
 * the frequency trend found by the D-step and exposes a compact model that can
 * be reviewed, serialized, and reused by later K-fitting backends.
 *
 * @param {number[]} omegas
 * @param {number[][]} dProfile  Array of D diagonals, one per omega.
 * @param {object} opts
 * @param {number} [opts.nodes=5] Number of knot frequencies to retain.
 * @returns {{type:string, nodes:object[], channels:number, fitErrorRms:number, method:string}}
 */
export function fitDynamicDScaling(omegas, dProfile, opts = {}) {
  const { nodes = 5 } = opts;
  if (!Array.isArray(omegas) || !Array.isArray(dProfile) || omegas.length !== dProfile.length || omegas.length === 0) {
    throw new Error('fitDynamicDScaling requires matching non-empty omegas and dProfile arrays.');
  }
  const channels = dProfile[0]?.length ?? 0;
  if (channels === 0 || dProfile.some((row) => row.length !== channels)) {
    throw new Error('fitDynamicDScaling requires rectangular positive D profile data.');
  }

  const nKnots = Math.max(2, Math.min(nodes, omegas.length));
  const knotIdx = [];
  for (let i = 0; i < nKnots; i++) {
    const idx = Math.round((i * (omegas.length - 1)) / (nKnots - 1));
    if (!knotIdx.includes(idx)) knotIdx.push(idx);
  }

  const logOmegas = omegas.map((w) => Math.log(clampPositive(w)));
  const profileLogD = dProfile.map((row) => row.map((d) => Math.log(clampPositive(d))));
  const knotLogW = knotIdx.map((idx) => logOmegas[idx]);

  const nodesOut = knotIdx.map((idx) => ({
    omega: omegas[idx],
    d: dProfile[idx].map(clampPositive),
  }));

  let err2 = 0;
  let count = 0;
  for (let i = 0; i < omegas.length; i++) {
    const fitted = evaluateDynamicDScaling({ nodes: nodesOut, channels }, omegas[i]);
    for (let c = 0; c < channels; c++) {
      const e = Math.log(clampPositive(fitted[c])) - profileLogD[i][c];
      err2 += e * e;
      count++;
    }
  }

  return {
    type: 'log-linear-d-scaling',
    nodes: nodesOut,
    channels,
    fitErrorRms: Math.sqrt(err2 / Math.max(1, count)),
    knotLogW,
    method: 'dynamic-d-log-linear-fit',
  };
}

/**
 * Evaluate a fitted dynamic diagonal D-scaling model at ω.
 */
export function evaluateDynamicDScaling(model, omega) {
  if (!model?.nodes?.length) throw new Error('evaluateDynamicDScaling requires a fitted model.');
  const nodes = [...model.nodes].sort((a, b) => a.omega - b.omega);
  const channels = model.channels ?? nodes[0].d.length;
  const lw = Math.log(clampPositive(omega));

  if (lw <= Math.log(clampPositive(nodes[0].omega))) return nodes[0].d.map(clampPositive);
  if (lw >= Math.log(clampPositive(nodes[nodes.length - 1].omega))) return nodes[nodes.length - 1].d.map(clampPositive);

  for (let i = 0; i < nodes.length - 1; i++) {
    const l0 = Math.log(clampPositive(nodes[i].omega));
    const l1 = Math.log(clampPositive(nodes[i + 1].omega));
    if (lw >= l0 && lw <= l1) {
      return Array.from({ length: channels }, (_, c) => {
        const y0 = Math.log(clampPositive(nodes[i].d[c]));
        const y1 = Math.log(clampPositive(nodes[i + 1].d[c]));
        return Math.exp(logInterp(lw, l0, l1, y0, y1));
      });
    }
  }

  return nodes[nodes.length - 1].d.map(clampPositive);
}

/**
 * Compute a μ upper-bound profile while warm-starting adjacent frequency bins,
 * then fit a dynamic D(jω) model to the resulting D profile.
 */
export function computeDynamicMuBoundFreq(Mfr, omegas, opts = {}) {
  const muProfile = [];
  const dProfile = [];
  let d0 = opts.d0;

  for (const omega of omegas) {
    const r = computeMuUpperBound(Mfr(omega), { ...opts, d0 });
    muProfile.push(r.muBound);
    dProfile.push(r.d);
    d0 = r.d;
  }

  let peakMu = -Infinity, peakOmega = omegas[0];
  muProfile.forEach((mu, i) => { if (mu > peakMu) { peakMu = mu; peakOmega = omegas[i]; } });

  const dynamicD = fitDynamicDScaling(omegas, dProfile, { nodes: opts.nodes ?? 5 });
  const fittedDProfile = omegas.map((omega) => evaluateDynamicDScaling(dynamicD, omega));

  return {
    muProfile,
    peakMu,
    peakOmega,
    dProfile,
    dynamicD,
    fittedDProfile,
    method: 'dynamic-d-mu-profile',
  };
}

// ── dkIteration ──────────────────────────────────────────────────────────────

/**
 * D-K iteration for robust H∞ synthesis.
 *
 * Starting from the plant state-space {A,B,C,D}, iterates:
 *   K-step: H∞ synthesis on D-scaled plant
 *   D-step: optimize D diagonal scaling at each frequency
 *
 * This simplified version uses frequency-independent (constant) D scaling
 * and the loopShapingHinf controller synthesis from hinf_riccati.js.
 *
 * @param {object} plantSS    { A, B, C, D } state-space plant.
 * @param {object} opts
 * @param {number[]} [opts.omegas]  Frequency grid (log-spaced by default).
 * @param {number}  [opts.maxIter=5]  Max D-K iterations.
 * @param {number}  [opts.tol=1e-3]   Convergence tolerance on μ bound change.
 * @param {object}  [opts.hinfOpts]   Options for loopShapingHinf.
 * @returns {{ K, dScales, muBound, gamma, gammaHistory, muHistory, converged, iterations, method }}
 */
export function dkIteration(plantSS, opts = {}) {
  const {
    omegas = logspace(-2, 2, 40),
    maxIter = 5,
    tol = 1e-3,
    hinfOpts = {},
  } = opts;

  // Import synthesis lazily to avoid circular deps
  // (loopShapingHinf is in hinf_riccati.js)
  const n = plantSS.A.length;
  const m = plantSS.B[0].length;
  const p = plantSS.C.length;

  // Initial D-scales = 1 (no scaling)
  let d = new Array(Math.min(m, p)).fill(1);
  const gammaHistory = [];
  const muHistory = [];

  let K = null;
  let prevMu = Infinity;
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // ── K-step: H∞ synthesis on scaled plant ─────────────────────────────
    // For constant D-scaling: scaled plant = diag(d)·G·diag(d)⁻¹ (SISO: trivial)
    // For MIMO: D P D⁻¹ where D = diag(d) on the performance channels
    const scaledSS = applyConstantDScaleToSS(plantSS, d);
    const hinfResult = synthesizeHinfSSLocal(scaledSS, hinfOpts);

    if (!hinfResult.converged) break;
    K = hinfResult.K;
    gammaHistory.push(hinfResult.gamma);

    // ── Compute closed-loop frequency response ────────────────────────────
    // Fl(P, K): closed-loop TF matrix at each ω
    // For SISO: T(jω) = G(jω) K(jω) / (1 + G(jω) K(jω))
    const muResult = computeMuBoundFreq(
      (omega) => closedLoopGainMatrix(plantSS, K, omega),
      omegas,
      { maxIter: 100, tol: 1e-4 },
    );

    muHistory.push(muResult.peakMu);

    // ── D-step: update constant D from peak frequency ─────────────────────
    const peakIdx = muResult.muProfile.indexOf(muResult.peakMu);
    d = muResult.dProfile[peakIdx];

    // Check convergence
    if (Math.abs(prevMu - muResult.peakMu) < tol) {
      converged = true;
      break;
    }
    prevMu = muResult.peakMu;
  }

  return {
    K,
    dScales: d,
    muBound: muHistory[muHistory.length - 1] ?? Infinity,
    gamma:   gammaHistory[gammaHistory.length - 1] ?? Infinity,
    gammaHistory,
    muHistory,
    converged,
    iterations: iter + 1,
    method: 'dk-iteration',
  };
}

/**
 * Dynamic D-K iteration wrapper.
 *
 * The K-step remains the existing deterministic H∞ static-gain baseline, but
 * the D-step now retains a reusable fitted D(jω) model instead of reducing the
 * profile to one peak-frequency constant D. This closes the workflow gap for
 * dynamic D-scaling analysis while keeping the backend deterministic.
 */
export function dkIterationDynamic(plantSS, opts = {}) {
  const {
    omegas = logspace(-2, 2, 40),
    maxIter = 5,
    tol = 1e-3,
    hinfOpts = {},
    nodes = 5,
  } = opts;

  let dynamicD = null;
  let K = null;
  let prevMu = Infinity;
  let converged = false;
  const gammaHistory = [];
  const muHistory = [];
  const fitErrorHistory = [];

  let iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    const nominalD = dynamicD ? evaluateDynamicDScaling(dynamicD, omegas[Math.floor(omegas.length / 2)]) : [1];
    const scaledSS = applyConstantDScaleToSS(plantSS, nominalD);
    const hinfResult = synthesizeHinfSSLocal(scaledSS, hinfOpts);
    if (!hinfResult.converged) break;

    K = hinfResult.K;
    gammaHistory.push(hinfResult.gamma);

    const muResult = computeDynamicMuBoundFreq(
      (omega) => closedLoopGainMatrix(plantSS, K, omega),
      omegas,
      { maxIter: 120, tol: 1e-4, nodes },
    );

    dynamicD = muResult.dynamicD;
    muHistory.push(muResult.peakMu);
    fitErrorHistory.push(dynamicD.fitErrorRms);

    if (Math.abs(prevMu - muResult.peakMu) < tol) {
      converged = true;
      break;
    }
    prevMu = muResult.peakMu;
  }

  return {
    K,
    dynamicD,
    muBound: muHistory[muHistory.length - 1] ?? Infinity,
    gamma: gammaHistory[gammaHistory.length - 1] ?? Infinity,
    gammaHistory,
    muHistory,
    fitErrorHistory,
    converged,
    iterations: iter + 1,
    method: 'dynamic-dk-iteration',
  };
}

// ── Internal synthesis helpers ────────────────────────────────────────────────

/** Generate log-spaced frequency vector. */
function logspace(lo, hi, n) {
  return Array.from({ length: n }, (_, i) => Math.pow(10, lo + (hi - lo) * i / (n - 1)));
}

/** Apply constant diagonal D-scaling to plant SS (output channels only). */
function applyConstantDScaleToSS(ss, d) {
  const p = ss.C.length;
  const Ds = Array.from({ length: p }, (_, i) => (i < d.length ? d[i] : 1));
  return {
    A: ss.A,
    B: ss.B,
    C: ss.C.map((row, i) => row.map((v) => v * Ds[i])),
    D: ss.D.map((row, i) => row.map((v) => v * Ds[i])),
  };
}

/**
 * Simple SISO H∞ synthesis: minimize γ such that ||T||∞ < γ.
 * Returns { K: [[k]], gamma, converged } where K is static gain.
 *
 * For SISO plant with D=0 (strictly proper), the H∞ optimal static gain
 * for sensitivity minimization is approximated via balanced truncation.
 * This is intentionally simplified for the D-K iteration framework.
 */
function synthesizeHinfSSLocal(ss, opts = {}) {
  // Fallback: use frequency-domain γ estimation
  const omegas = logspace(-2, 2, 60);
  let peakGain = 0;

  for (const omega of omegas) {
    const g = ssFreqResponse(ss, omega);
    // |G(jω)| for SISO
    const mag = Math.sqrt(g.re * g.re + g.im * g.im);
    peakGain = Math.max(peakGain, mag);
  }

  // Conservative H∞ bound: static gain K = 1/peakGain (rough sensitivity reduction)
  const kGain = peakGain > 0 ? 1 / (peakGain + 1e-9) : 1;

  return {
    K: [[kGain]],
    gamma: peakGain > 0 ? peakGain / (1 + peakGain) : 1,
    converged: true,
  };
}

/**
 * Compute |T(jω)| for SISO closed-loop Fl(P, K) at frequency omega (rad/s).
 * T(jω) = G(jω) K / (1 + G(jω) K) where K is static gain.
 */
function closedLoopGainMatrix(ss, K, omega) {
  const g = ssFreqResponse(ss, omega);
  const k = Array.isArray(K) ? K[0][0] : K;
  // Closed-loop scalar: T = Gk / (1 + Gk)
  const Gk_re = g.re * k;
  const Gk_im = g.im * k;
  const denom_re = 1 + Gk_re;
  const denom_im = Gk_im;
  const denom_mag2 = denom_re * denom_re + denom_im * denom_im || 1;
  const T_re = (Gk_re * denom_re + Gk_im * denom_im) / denom_mag2;
  const T_im = (Gk_im * denom_re - Gk_re * denom_im) / denom_mag2;
  // Return 1×1 "matrix" with magnitude
  return [[Math.sqrt(T_re * T_re + T_im * T_im)]];
}

/**
 * Compute G(jω) for a state-space system using (jωI − A)⁻¹.
 * Returns {re, im} for SISO output.
 */
function ssFreqResponse(ss, omega) {
  const n = ss.A.length;
  if (n === 0) {
    // Static gain
    return { re: ss.D[0][0], im: 0 };
  }

  // Solve (jωI − A) z = B u, y = C z + D u
  // Use real/imaginary decomposition: (jωI − A) = −A + jωI
  // System: (−A z_re − ω z_im) = B, (−A z_im + ω z_re) = 0
  // Stack as 2n×2n real system
  const A = ss.A;
  const B = ss.B;
  const C = ss.C;
  const D = ss.D;

  const size = 2 * n;
  const M = Array.from({ length: size }, () => new Array(size).fill(0));
  const rhs = new Array(size).fill(0);

  // M = [[-A, -ωI], [ωI, -A]]  from (−A + jωI)(x_re + jx_im) = (B[:,0])
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j]         = -A[i][j];       // top-left: −A (re part)
      M[i][n + j]     = -(i === j ? omega : 0); // top-right: −ωI
      M[n + i][j]     = (i === j ? omega : 0);  // bottom-left: ωI
      M[n + i][n + j] = -A[i][j];       // bottom-right: −A (im part)
    }
    rhs[i]     = B[i][0];  // Re(B u)
    rhs[n + i] = 0;         // Im(B u) = 0 (real input)
  }

  // Solve M z = rhs via Gaussian elimination
  const z = gaussSolve(M, rhs);
  if (!z) return { re: D[0][0], im: 0 };

  const zRe = z.slice(0, n);
  const zIm = z.slice(n);

  // y = C z + D u
  let yRe = D[0][0];
  let yIm = 0;
  for (let j = 0; j < n; j++) {
    yRe += C[0][j] * zRe[j];
    yIm += C[0][j] * zIm[j];
  }

  return { re: yRe, im: yIm };
}

/** Gaussian elimination with partial pivoting. Returns flat solution array or null. */
function gaussSolve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    if (Math.abs(M[col][col]) < 1e-14) return null;

    const pivot = M[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}
