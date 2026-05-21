/**
 * estimation.js — P31: Estimation & Health Monitoring
 *
 * Modules:
 *   P31-01: movingHorizonEstimation — constrained optimization-based state estimation
 *   P31-02: particleFilter          — sequential Monte Carlo for nonlinear systems
 *   P31-03: designFDD               — fault detection & diagnosis via residuals
 *   P31-04: reconfigurableFTC       — fault-tolerant control with gain switching
 */

// ══════════════════════════════════════════════════════════════════════════════
// P31-01: Moving Horizon Estimation (MHE)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Moving Horizon Estimator for linear discrete-time systems.
 *
 * Problem (horizon N):
 *   min  Σ_{k=t-N}^{t} ‖y_k − C x_k‖²_R⁻¹ + ‖w_k‖²_Q⁻¹ + ‖x̄_{t-N} − x₀‖²_P₀⁻¹
 *   s.t. x_{k+1} = A x_k + B u_k + w_k
 *        xMin ≤ x_k ≤ xMax  (optional)
 *
 * Solved as a condensed least-squares QP (active-set for simplicity).
 *
 * @param {number[][]} A      n×n state matrix.
 * @param {number[][]} B      n×m input matrix.
 * @param {number[][]} C      p×n output matrix.
 * @param {object}     opts
 * @param {number}    [opts.horizon=10]   Window size N.
 * @param {number[][]} [opts.Q]           Process noise covariance n×n (default I).
 * @param {number[][]} [opts.R]           Measurement noise covariance p×p (default I).
 * @param {number[][]} [opts.P0]          Arrival cost covariance n×n (default 10I).
 * @param {number[]}  [opts.xMin]         State lower bounds (length n).
 * @param {number[]}  [opts.xMax]         State upper bounds (length n).
 * @returns MHE object with `.update(y, u)` → { xEst, residual } and `.state`.
 */
export function movingHorizonEstimation(A, B, C, opts = {}) {
  const n = A.length;
  const m = B[0].length;
  const p = C.length;
  const {
    horizon  = 10,
    xMin,
    xMax,
  } = opts;

  // Default matrices
  const Q  = opts.Q  ?? eye(n);
  const R  = opts.R  ?? eye(p);
  const P0 = opts.P0 ?? scaledEye(n, 10);

  // Sliding buffers
  const yBuf = [];   // p-vectors
  const uBuf = [];   // m-vectors

  // Current state estimate
  let xEst = new Array(n).fill(0);

  /**
   * Add one measurement and re-estimate state.
   * @param {number[]} y  Measurement vector (length p).
   * @param {number[]} u  Input vector applied at this step (length m).
   * @returns {{ xEst, residuals, iterations }}
   */
  function update(y, u) {
    if (y.length !== p) throw new Error(`MHE: y must have length ${p}`);
    if (u.length !== m) throw new Error(`MHE: u must have length ${m}`);

    yBuf.push([...y]);
    uBuf.push([...u]);
    if (yBuf.length > horizon) { yBuf.shift(); uBuf.shift(); }

    const N = yBuf.length;

    // ── Build condensed least-squares system ─────────────────────────────
    // Decision variable: [x_{t-N}, x_{t-N+1}, ..., x_t] (n*(N+1) variables)
    // Equivalent to optimizing over x_{t-N} and letting dynamics propagate.
    // Simplified: use smoothing least-squares over window.

    // Stack observations: y_k = C Φ_k x_{t-N} + C Σ_k U + noise
    // where Φ_k = A^k, Σ_k accumulates B and inputs.

    // Precompute A^k
    const Apow = [eye(n)];  // A^0 = I
    for (let k = 1; k <= N; k++) Apow.push(matMulLocal(Apow[k - 1], A));

    // Build Φ (pN × n) and Y (pN × 1) and forcing term F (pN × 1)
    const rows = p * N;
    const Phi  = Array.from({ length: rows }, () => new Array(n).fill(0));
    const Yv   = new Array(rows).fill(0);
    const Fv   = new Array(rows).fill(0);  // known part from inputs

    for (let k = 0; k < N; k++) {
      const CAk = matMulLocal(C, Apow[k]);
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < n; j++) {
          Phi[k * p + i][j] = CAk[i][j];
        }
        Yv[k * p + i] = yBuf[k][i];
      }

      // Forcing from inputs: sum_{l=0}^{k-1} C A^{k-1-l} B u_l
      for (let l = 0; l < k; l++) {
        const CAkl = matMulLocal(C, matMulLocal(Apow[k - 1 - l], B));
        for (let i = 0; i < p; i++) {
          let fval = 0;
          for (let j = 0; j < m; j++) fval += CAkl[i][j] * uBuf[l][j];
          Fv[k * p + i] += fval;
        }
      }
    }

    // Effective RHS: Y − F
    const RHS = Yv.map((v, i) => v - Fv[i]);

    // Arrival cost regularization: add P0 penalty on x_{t-N} − x̄
    // Augment system: [Phi; R_p0^{-1/2}] x ≈ [RHS; 0]
    // Simplified: add P0^{-1} to normal equations
    // Diagonal weights: w_i = 1 / R[i%p][i%p]
    const Winv = Array.from({ length: rows }, (_, i) =>
      1 / (R[i % p][i % p] || 1),
    );

    const PhiTW     = Array.from({ length: n }, (_, i) =>
      Array.from({ length: rows }, (__, k) => Phi[k][i] * Winv[k]),
    );
    const PhiTWPhi  = matMulLocal(PhiTW, Phi);
    const PhiTWrhs  = Array.from({ length: n }, (_, i) =>
      PhiTW[i].reduce((s, v, k) => s + v * RHS[k], 0),
    );

    // Add arrival cost: P0inv (diagonal)
    for (let i = 0; i < n; i++) {
      PhiTWPhi[i][i] += 1 / (P0[i][i] || 1);
    }

    const x0Est = solveNE(PhiTWPhi, PhiTWrhs) ?? new Array(n).fill(0);

    // Apply box constraints via clamping (projected least-squares)
    if (xMin || xMax) {
      for (let i = 0; i < n; i++) {
        if (xMin && x0Est[i] < xMin[i]) x0Est[i] = xMin[i];
        if (xMax && x0Est[i] > xMax[i]) x0Est[i] = xMax[i];
      }
    }

    // Propagate to get current state estimate
    let xCur = [...x0Est];
    for (let k = 0; k < N; k++) {
      const Ax = matVec(A, xCur);
      const Bu = matVec(B, uBuf[k]);
      xCur = Ax.map((v, i) => v + Bu[i]);
    }

    xEst = xCur;

    // Compute residuals: y_k − C x_k
    let x = [...x0Est];
    const residuals = [];
    for (let k = 0; k < N; k++) {
      const yhat = matVec(C, x);
      const res  = yBuf[k].map((v, i) => v - yhat[i]);
      residuals.push(res);
      const Ax = matVec(A, x);
      const Bu = matVec(B, uBuf[k]);
      x = Ax.map((v, i) => v + Bu[i]);
    }

    return { xEst: [...xEst], residuals, N };
  }

  return {
    update,
    get state() { return { xEst: [...xEst], n, m, p, horizon }; },
    reset(x0) { xEst = x0 ? [...x0] : new Array(n).fill(0); yBuf.length = 0; uBuf.length = 0; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P31-02: Particle Filter (Sequential Monte Carlo)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Particle filter (Bootstrap / SIR) for nonlinear state estimation.
 *
 * State transition: x_{k+1} = f(x_k, u_k) + w_k,   w_k ~ N(0, Q)
 * Observation:      y_k = h(x_k) + v_k,              v_k ~ N(0, R)
 *
 * @param {Function}  f         Dynamics: (x: number[], u: number[]) → number[]
 * @param {Function}  h         Observation: (x: number[]) → number[]
 * @param {object}    opts
 * @param {number}   [opts.nParticles=200]  Number of particles.
 * @param {number[][]} [opts.Q]             Process noise covariance (n×n).
 * @param {number[][]} [opts.R]             Measurement noise covariance (p×p).
 * @param {number[]}  [opts.x0]            Initial state mean (default: zeros).
 * @param {number[][]} [opts.P0]           Initial covariance (default: I).
 * @param {number}   [opts.seed]           Optional RNG seed.
 * @returns PF object with `.update(y, u)` → { xEst, variance, ESS } and `.state`.
 */
export function particleFilter(f, h, opts = {}) {
  const {
    nParticles = 200,
    seed,
  } = opts;

  // Infer dimensions from x0 or f/h
  const x0_ref = opts.x0 ?? [0];
  const n      = x0_ref.length;
  const Q      = opts.Q  ?? eye(n);
  const R      = opts.R  ?? eye(h(x0_ref).length);
  const P0     = opts.P0 ?? eye(n);

  // Simple LCG RNG for reproducibility
  let rngState = seed ?? Date.now();
  function rng() {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 0xFFFFFFFF;
  }
  function randn() {
    // Box-Muller
    const u1 = Math.max(rng(), 1e-10);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Cholesky-like square root of diagonal covariance (approximation: sqrt of diagonal)
  function sqrtDiag(M) {
    return M.map((row, i) => Math.sqrt(Math.abs(row[i]) || 1e-9));
  }

  const Qsq = sqrtDiag(Q);
  const Rsq = sqrtDiag(R);
  const P0sq = sqrtDiag(P0);

  // Initialize particles
  const x0 = opts.x0 ?? new Array(n).fill(0);
  let particles = Array.from({ length: nParticles }, () =>
    x0.map((v, i) => v + P0sq[i] * randn()),
  );
  let weights = new Array(nParticles).fill(1 / nParticles);

  /**
   * @param {number[]} y   Measurement (length p).
   * @param {number[]} [u]  Input (length m), default zeros.
   * @returns {{ xEst, variance, ESS, particles }}
   */
  function update(y, u = []) {
    const p_dim = y.length;

    // ── Predict: propagate particles through dynamics + noise ────────────
    particles = particles.map((x) => {
      const xNext = f(x, u);
      return xNext.map((v, i) => v + Qsq[i] * randn());
    });

    // ── Update: weight by likelihood p(y | x) ────────────────────────────
    const logWeights = particles.map((x) => {
      const yhat = h(x);
      let logL = 0;
      for (let i = 0; i < p_dim; i++) {
        const r = Rsq[i] * Rsq[i];   // R[i][i]
        const diff = y[i] - yhat[i];
        logL -= 0.5 * diff * diff / r + 0.5 * Math.log(2 * Math.PI * r);
      }
      return logL;
    });

    // Normalize weights in log domain for numerical stability
    const maxLogW = Math.max(...logWeights);
    const rawW    = logWeights.map((lw) => Math.exp(lw - maxLogW));
    const sumW    = rawW.reduce((s, w) => s + w, 0) || 1;
    weights       = rawW.map((w) => w / sumW);

    // ── Effective Sample Size ─────────────────────────────────────────────
    const ESS = 1 / weights.reduce((s, w) => s + w * w, 0);

    // ── Resample if ESS < nParticles/2 (systematic resampling) ───────────
    if (ESS < nParticles / 2) {
      const cumW   = weights.reduce((acc, w) => {
        acc.push((acc[acc.length - 1] ?? 0) + w); return acc;
      }, []);
      const offset = rng() / nParticles;
      const newParticles = [];
      let j = 0;
      for (let i = 0; i < nParticles; i++) {
        const u = offset + i / nParticles;
        while (j < nParticles - 1 && cumW[j] < u) j++;
        newParticles.push([...particles[j]]);
      }
      particles = newParticles;
      weights   = new Array(nParticles).fill(1 / nParticles);
    }

    // ── State estimate: weighted mean ─────────────────────────────────────
    const xEst = new Array(n).fill(0);
    for (let i = 0; i < nParticles; i++)
      for (let j = 0; j < n; j++)
        xEst[j] += weights[i] * particles[i][j];

    // ── Variance (weighted) ───────────────────────────────────────────────
    const variance = new Array(n).fill(0);
    for (let i = 0; i < nParticles; i++)
      for (let j = 0; j < n; j++) {
        const d = particles[i][j] - xEst[j];
        variance[j] += weights[i] * d * d;
      }

    return { xEst, variance, ESS, particles: particles.map((p) => [...p]) };
  }

  return {
    update,
    get state() {
      return {
        nParticles,
        particles: particles.map((p) => [...p]),
        weights: [...weights],
      };
    },
    reset(x0New) {
      const xr = x0New ?? x0;
      particles = Array.from({ length: nParticles }, () =>
        xr.map((v, i) => v + P0sq[i] * randn()),
      );
      weights = new Array(nParticles).fill(1 / nParticles);
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P31-03: Fault Detection & Diagnosis (FDD)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Design a model-based FDD system using residual generation.
 *
 * Residual: r(t) = y(t) − ŷ(t|t-1)  (innovation / output error)
 * Fault detection: alarm when ‖r(t)‖ > threshold (based on Gaussian statistics).
 * Fault diagnosis: compare residual pattern to fault signatures.
 *
 * @param {object}   model    { A, B, C, D? } — nominal state-space model.
 * @param {object}   opts
 * @param {number}   [opts.threshold=3]     Detection threshold (in std devs).
 * @param {number[][]} [opts.R]             Measurement noise covariance p×p.
 * @param {number}   [opts.window=20]       CUSUM window for statistical detection.
 * @param {object[]} [opts.faultSignatures] [{name, direction: number[]}] fault library.
 * @returns FDD object with `.update(y, u)` → { alarm, faultIndex, residual, cusum }
 *   and `.reset()`.
 */
export function designFDD(model, opts = {}) {
  const { A, B, C, D } = model;
  const n = A.length;
  const m = B[0].length;
  const p = C.length;
  const {
    threshold      = 3,
    window         = 20,
    faultSignatures = [],
  } = opts;
  const R = opts.R ?? eye(p);

  // Observer gain via Luenberger pole placement (simple: L = 0.5*C^T)
  // (for demonstration; in production, use Kalman gain)
  const L = matTransposeLocal(C).map((row) => row.map((v) => v * 0.3));

  // State
  let xHat = new Array(n).fill(0);
  let cusumBuf = [];
  let t = 0;

  // Measurement noise standard deviations
  const sigmaR = Array.from({ length: p }, (_, i) => Math.sqrt(R[i][i] || 1));

  /**
   * @param {number[]} y   Measurement (length p).
   * @param {number[]} u   Input (length m).
   * @returns {{ alarm, faultIndex, faultName, residual, norm, cusum, t }}
   */
  function update(y, u) {
    if (y.length !== p) throw new Error(`FDD: y must have length ${p}`);
    if (u.length !== m) throw new Error(`FDD: u must have length ${m}`);

    // Output prediction: ŷ = C x̂ + D u
    const yhat = matVec(C, xHat).map((v, i) => v + (D ? matVec(D, u)[i] : 0));

    // Residual: r = y − ŷ
    const residual = y.map((v, i) => v - yhat[i]);

    // Normalized residual: r_norm[i] = r[i] / σ_i
    const rNorm = residual.map((v, i) => v / sigmaR[i]);
    const norm  = Math.sqrt(rNorm.reduce((s, v) => s + v * v, 0));

    // CUSUM: s_k = max(0, s_{k-1} + |r_norm| − k_slack)
    const kSlack = 0.5; // allowance
    const prevS  = cusumBuf.length > 0 ? cusumBuf[cusumBuf.length - 1] : 0;
    const cusumK = Math.max(0, prevS + norm - kSlack);
    cusumBuf.push(cusumK);
    if (cusumBuf.length > window) cusumBuf.shift();

    // Detection
    const alarm = cusumK > threshold;

    // Diagnosis: find best matching fault signature
    let faultIndex = -1, faultName = null, maxCorr = 0;
    if (alarm && faultSignatures.length > 0) {
      for (let fi = 0; fi < faultSignatures.length; fi++) {
        const sig  = faultSignatures[fi].direction;
        const corr = Math.abs(residual.reduce((s, v, i) => s + v * (sig[i] ?? 0), 0));
        if (corr > maxCorr) { maxCorr = corr; faultIndex = fi; faultName = faultSignatures[fi].name; }
      }
    }

    // Observer update: x̂+ = A x̂ + B u + L(y − ŷ)
    const Ax   = matVec(A, xHat);
    const Bu   = matVec(B, u);
    const Lr   = matVec(L, residual);
    xHat = Ax.map((v, i) => v + Bu[i] + Lr[i]);
    t++;

    return { alarm, faultIndex, faultName, residual, norm, cusum: cusumK, t };
  }

  return {
    update,
    get state() { return { xHat: [...xHat], t, threshold }; },
    reset() { xHat = new Array(n).fill(0); cusumBuf = []; t = 0; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P31-04: Reconfigurable Fault-Tolerant Control (FTC)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Reconfigurable fault-tolerant controller.
 *
 * Maintains a bank of controllers (one nominal + one per fault mode).
 * After fault isolation by FDD, switches to the appropriate controller.
 *
 * @param {object}     nominalController  { step: (y, r) → { u } } — nominal controller.
 * @param {object[]}   faultControllers   Array of { faultIndex, step } — fault-specific controllers.
 * @param {object}     opts
 * @param {number}    [opts.confirmSteps=3]  Steps FDD must confirm before switching.
 * @returns FTC object with `.update(y, r, fddResult)` → { u, activeMode, switchCount }.
 */
export function reconfigurableFTC(nominalController, faultControllers = [], opts = {}) {
  const { confirmSteps = 3 } = opts;

  let activeMode    = 'nominal';
  let activeFaultIdx = -1;
  let switchCount    = 0;
  let alarmCount     = 0;
  let confirmedFault = -1;

  const controllers = new Map();
  controllers.set('nominal', nominalController);
  for (const fc of faultControllers) {
    controllers.set(`fault_${fc.faultIndex}`, fc);
  }

  /**
   * @param {number[]} y          Measured output.
   * @param {number[]} r          Reference.
   * @param {object}   fddResult  From designFDD.update() — { alarm, faultIndex }.
   * @returns {{ u, activeMode, switchCount, alarm }}
   */
  function update(y, r, fddResult) {
    const { alarm, faultIndex } = fddResult ?? { alarm: false, faultIndex: -1 };

    // Fault confirmation logic
    if (alarm && faultIndex >= 0) {
      if (faultIndex === confirmedFault) {
        alarmCount++;
      } else {
        confirmedFault = faultIndex;
        alarmCount = 1;
      }
    } else {
      alarmCount = Math.max(0, alarmCount - 1);
    }

    // Switch if confirmed
    const newMode  = alarmCount >= confirmSteps && faultIndex >= 0
      ? `fault_${faultIndex}`
      : 'nominal';

    if (newMode !== activeMode) {
      activeMode     = newMode;
      activeFaultIdx = newMode === 'nominal' ? -1 : faultIndex;
      switchCount++;
    }

    // Get active controller
    const ctrl = controllers.get(activeMode) ?? nominalController;
    const { u } = ctrl.step(y, r);

    return { u, activeMode, switchCount, alarm: alarmCount >= confirmSteps };
  }

  return {
    update,
    get state() { return { activeMode, activeFaultIdx, switchCount, alarmCount }; },
    reset() {
      activeMode = 'nominal'; activeFaultIdx = -1; switchCount = 0;
      alarmCount = 0; confirmedFault = -1;
    },
  };
}

// ── Math helpers (local to avoid import cycles) ───────────────────────────────

function eye(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)),
  );
}
function scaledEye(n, s) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? s : 0)),
  );
}
function matMulLocal(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < p; k++)
      for (let j = 0; j < m; j++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}
function matVec(A, x) {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}
function matTransposeLocal(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}
function diagInv(M, n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 1 / (M[i][j] || M[i][i] || 1) : 0)),
  );
}
function solveNE(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
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
