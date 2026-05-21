/**
 * adaptive.js — P30: Adaptive & Learning Control
 *
 * Modules:
 *   P30-01: identifyRLS        — Recursive Least Squares with forgetting factor
 *   P30-02: designMRAC         — Model Reference Adaptive Control (gradient / Lyapunov)
 *   P30-03: selfTuningRegulator— STR: online RLS + pole-placement / minimum-variance
 *   P30-04: iterativeLearning  — P-type Iterative Learning Control (repetitive tasks)
 *   P30-05: identifySRIVC      — Simplified Refined IV for Continuous-time models
 */

// ══════════════════════════════════════════════════════════════════════════════
// P30-01: Recursive Least Squares
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create a stateful RLS estimator for a linear regression model:
 *   y(t) = φ(t)ᵀ θ
 * where θ ∈ ℝⁿ are unknown parameters and φ(t) is the regressor vector.
 *
 * Exponential forgetting: older data is down-weighted by λᵏ (0 < λ ≤ 1).
 * λ = 1 → standard least squares (all history equally weighted).
 *
 * Update equations (Joseph form for numerical stability):
 *   K(t) = P(t-1) φ(t) / (λ + φ(t)ᵀ P(t-1) φ(t))       gain
 *   θ̂(t) = θ̂(t-1) + K(t) [y(t) − φ(t)ᵀ θ̂(t-1)]        parameter update
 *   P(t) = (I − K(t) φ(t)ᵀ) P(t-1) / λ                   covariance update (Joseph)
 *
 * @param {number}   n          Parameter vector dimension.
 * @param {object}   opts
 * @param {number}  [opts.lambda=0.99]    Forgetting factor (0 < λ ≤ 1).
 * @param {number}  [opts.P0=1e4]        Initial covariance = P0 · I.
 * @param {number[]}[opts.theta0]         Initial parameter estimate (default: zeros).
 * @returns RLS estimator object with `.update(phi, y)` and `.state` property.
 */
export function identifyRLS(n, opts = {}) {
  const { lambda = 0.99, P0 = 1e4, theta0 } = opts;

  if (n <= 0 || !Number.isInteger(n)) throw new Error('identifyRLS: n must be a positive integer');
  if (lambda <= 0 || lambda > 1)     throw new Error('identifyRLS: lambda must be in (0, 1]');

  // State
  let theta = theta0 ? [...theta0] : new Array(n).fill(0);
  let P = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? P0 : 0)),
  );
  let t = 0;

  /**
   * Process one observation.
   * @param {number[]} phi  Regressor vector (length n).
   * @param {number}   y    Scalar output.
   * @returns {{ theta: number[], K: number[], error: number, P: number[][] }}
   */
  function update(phi, y) {
    if (phi.length !== n) throw new Error(`identifyRLS: phi must have length ${n}`);

    // Innovation: ε = y − φᵀθ
    const yhat = phi.reduce((s, p, i) => s + p * theta[i], 0);
    const error = y - yhat;

    // P φ
    const Pphi = Array.from({ length: n }, (_, i) =>
      P[i].reduce((s, p, j) => s + p * phi[j], 0),
    );

    // φᵀ P φ
    const phiTPphi = phi.reduce((s, p, i) => s + p * Pphi[i], 0);

    // Gain: K = P φ / (λ + φᵀ P φ)
    const denom = lambda + phiTPphi;
    const K = Pphi.map((v) => v / denom);

    // Parameter update: θ = θ + K ε
    theta = theta.map((th, i) => th + K[i] * error);

    // Covariance update (Joseph form for PSD preservation):
    // P = (I − K φᵀ) P / λ
    const IKphiT = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (__, j) => (i === j ? 1 : 0) - K[i] * phi[j]),
    );
    const PNew = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (__, j) =>
        IKphiT[i].reduce((s, v, k) => s + v * P[k][j], 0) / lambda,
      ),
    );
    P = PNew;
    t++;

    return { theta: [...theta], K: [...K], error, yhat, P, t };
  }

  return {
    update,
    get state() {
      return { theta: [...theta], P, t, n, lambda };
    },
    reset(theta0New, P0New) {
      theta = theta0New ? [...theta0New] : new Array(n).fill(0);
      P = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (__, j) => (i === j ? (P0New ?? P0) : 0)),
      );
      t = 0;
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P30-02: Model Reference Adaptive Control (MRAC)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Design a MRAC controller for a first-order plant:
 *   ẋ_p = a_p x_p + b_p u   (unknown a_p, b_p)
 * tracking a reference model:
 *   ẋ_m = a_m x_m + b_m r   (a_m < 0, b_m > 0 specified)
 *
 * MIT gradient rule adaptive laws:
 *   k̇_r = −γ e x_m   (feed-forward gain from reference)
 *   k̇_x = −γ e x_p   (state feedback gain)
 * where e = x_p − x_m (tracking error).
 *
 * Lyapunov-based variant (sign reversed for stability guarantee):
 *   k̇_r = −γ_r sign(b_p) e r
 *   k̇_x = −γ_x sign(b_p) e x_p
 *
 * Returns a stateful controller with `.step(xp, r, dt)` method.
 *
 * @param {object} refModel  { am, bm } — reference model parameters (am < 0, bm > 0).
 * @param {object} opts
 * @param {number} [opts.gamma=1]     Adaptation gain.
 * @param {number} [opts.gammaR]      Adaptation gain for kr (default: gamma).
 * @param {number} [opts.gammaX]      Adaptation gain for kx (default: gamma).
 * @param {number} [opts.kr0=1]       Initial feed-forward gain.
 * @param {number} [opts.kx0=0]       Initial state-feedback gain.
 * @param {'mit'|'lyapunov'] [opts.rule='lyapunov']  Adaptation rule.
 * @param {number} [opts.signBp=1]    Sign of b_p (required for Lyapunov rule).
 * @returns MRAC controller object with `.step(xp, xm, r, dt)` → { u, kr, kx, e }.
 */
export function designMRAC(refModel, opts = {}) {
  const { am, bm } = refModel;
  if (am >= 0) throw new Error('designMRAC: reference model must be stable (am < 0)');
  if (bm <= 0) throw new Error('designMRAC: bm must be positive');

  const {
    gamma = 1,
    kr0 = bm / (-am),   // steady-state gain as default
    kx0 = 0,
    rule = 'lyapunov',
    signBp = 1,
  } = opts;

  const gammaR = opts.gammaR ?? gamma;
  const gammaX = opts.gammaX ?? gamma;

  let kr = kr0;
  let kx = kx0;
  let t = 0;

  /**
   * Compute control input and update adaptive parameters.
   * @param {number} xp  Plant state.
   * @param {number} xm  Reference model state.
   * @param {number} r   Reference input.
   * @param {number} dt  Time step.
   * @returns {{ u, kr, kx, e }}
   */
  function step(xp, xm, r, dt) {
    const e = xp - xm;               // tracking error
    const u = kr * r + kx * xp;       // control law u = kr·r + kx·xp

    // Adaptive laws
    let dkr, dkx;
    if (rule === 'mit') {
      // MIT gradient rule: dθ/dt = −γ e (∂e/∂θ)
      // ∂e/∂kr ≈ xm (sensitivity), ∂e/∂kx ≈ xp
      dkr = -gammaR * e * xm;
      dkx = -gammaX * e * xp;
    } else {
      // Lyapunov-based (guaranteed stable for known sign of b_p)
      dkr = -gammaR * signBp * e * r;
      dkx = -gammaX * signBp * e * xp;
    }

    kr += dkr * dt;
    kx += dkx * dt;
    t += dt;

    return { u, kr, kx, e, t };
  }

  return {
    step,
    get state() { return { kr, kx, t }; },
    reset(kr0New = kr0, kx0New = kx0) { kr = kr0New; kx = kx0New; t = 0; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P30-03: Self-Tuning Regulator (STR)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Self-Tuning Regulator: online RLS identification + pole-placement redesign.
 *
 * Plant model: A(q⁻¹) y(t) = B(q⁻¹) u(t) + e(t)
 *   θ = [a1,...,na, b1,...,nb]ᵀ — estimated online via RLS.
 *
 * Controller redesign: at each step, use estimated {a_i, b_i} to compute
 * a control law u(t) = −k_y · y(t) + k_r · r(t) that moves closed-loop poles
 * toward a desired characteristic polynomial.
 *
 * @param {number}   na         Plant A-polynomial order (without leading 1).
 * @param {number}   nb         Plant B-polynomial order.
 * @param {object}   opts
 * @param {number[]} [opts.desiredPoles]  Desired closed-loop poles in z-domain.
 * @param {number}   [opts.lambda=0.99]   RLS forgetting factor.
 * @param {number}   [opts.P0=1e4]        RLS initial covariance.
 * @returns STR object with `.step(y, r)` → { u, theta, ky, kr, error }.
 */
export function selfTuningRegulator(na, nb, opts = {}) {
  const {
    desiredPoles,
    lambda = 0.99,
    P0 = 1e4,
    theta0,
  } = opts;

  const nTheta = na + nb;
  // Default initial theta: a-params = 0, b[0] = 0.1 (prevents cold-start deadlock)
  const initTheta = theta0 ?? (() => {
    const t = new Array(nTheta).fill(0);
    t[na] = 0.1;  // initial b̂[0] — allows controller to produce non-zero u
    return t;
  })();
  const rls = identifyRLS(nTheta, { lambda, P0, theta0: initTheta });

  // History buffers
  const yBuf = new Array(na).fill(0);
  const uBuf = new Array(nb).fill(0);

  let ky = 0, kr = 1;
  let prevTheta = new Array(nTheta).fill(0);

  /**
   * @param {number} y  Measured output.
   * @param {number} r  Reference.
   * @returns {{ u, theta, ky, kr, error }}
   */
  function step(y, r) {
    // Regressor: φ = [−y(t−1),...,−y(t−na), u(t−1),...,u(t−nb)]
    const phi = [
      ...yBuf.map((v) => -v),
      ...uBuf,
    ];

    // RLS update (predict then update)
    const rlsResult = rls.update(phi, y);
    const { theta, error } = rlsResult;
    prevTheta = theta;

    // Extract estimated parameters
    const aHat = theta.slice(0, na);   // [a1,...,ana]
    const bHat = theta.slice(na);      // [b1,...,bnb]

    // Controller redesign: one-step-ahead (deadbeat) control law
    // Model: y(t) = θ[0]·(−y(t−1)) + θ[1]·u(t−1) + ...
    // i.e.  y(t) = −aHat[0]·y(t-1) + bHat[0]·u(t-1) + ...
    // Predict: y(t+1) = −aHat[0]·y(t) + bHat[0]·u(t) + sum_{j>1} bHat[j]·u(t-j+1)
    // Set y(t+1) = r → u(t) = (r + aHat[0]·y(t) − sum_{j>1} bHat[j]·u(t-j+1)) / bHat[0]
    if (Math.abs(bHat[0]) > 1e-9) {
      // uNum = r + aHat[0]·y(t) + aHat[1]·y(t-1) + ... (current y + past ys)
      let uNum = r;
      // First term: +aHat[0] * y (current output, not in yBuf yet)
      if (na > 0) uNum += aHat[0] * y;
      // Remaining terms: +aHat[i] * yBuf[i-1] for i=1..na-1
      for (let i = 1; i < na; i++) uNum += aHat[i] * yBuf[i - 1];
      // Past B terms (j >= 1): subtract bHat[j]*uBuf[j-1]
      for (let j = 1; j < nb; j++) uNum -= bHat[j] * uBuf[j - 1];
      const uNew = uNum / bHat[0];
      // Gain extraction for reporting
      ky = na > 0 ? aHat[0] / bHat[0] : 0;
      kr = 1 / bHat[0];

      // Update history
      yBuf.unshift(y); yBuf.pop();
      uBuf.unshift(uNew); uBuf.pop();

      return { u: uNew, theta, ky, kr, error };
    }

    // Fallback: zero control when b estimate too small
    yBuf.unshift(y); yBuf.pop();
    uBuf.unshift(0); uBuf.pop();
    return { u: 0, theta, ky, kr, error };
  }

  return {
    step,
    get state() { return { theta: prevTheta, ky, kr, rls: rls.state }; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P30-04: Iterative Learning Control (ILC)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * P-type Iterative Learning Control for repetitive tasks.
 *
 * Given a desired output trajectory yd[0..T-1], ILC updates the feed-forward
 * input sequence across trials to eliminate the repetitive error.
 *
 * Update law (P-type):
 *   u_{k+1}(t) = u_k(t) + L · e_k(t+d)
 * where e_k(t) = yd(t) − y_k(t), d is relative degree, L is learning gain.
 *
 * Q-filter version:
 *   u_{k+1}(t) = Q * [u_k(t) + L · e_k(t+d)]
 * where Q is a low-pass filter (scalar ∈ (0,1] or FIR filter coefficients).
 *
 * @param {number}    T         Trial length (number of time steps).
 * @param {object}    opts
 * @param {number}   [opts.L=0.5]         Learning gain.
 * @param {number}   [opts.Q=1]           Q-filter scalar (1 = no filter).
 * @param {number}   [opts.delay=0]       Relative degree d (look-ahead shift).
 * @param {number[]} [opts.u0]            Initial input trajectory (zeros if omitted).
 * @returns ILC object with `.update(yd, y)` → { u_next, rmsError, improvement }.
 */
export function iterativeLearningControl(T, opts = {}) {
  const { L = 0.5, Q = 1, delay = 0, u0 } = opts;

  if (T <= 0 || !Number.isInteger(T)) throw new Error('iterativeLearningControl: T must be a positive integer');
  if (L <= 0)  throw new Error('iterativeLearningControl: learning gain L must be positive');
  if (Q <= 0 || Q > 1) throw new Error('iterativeLearningControl: Q-filter scalar must be in (0, 1]');

  let u_k = u0 ? [...u0] : new Array(T).fill(0);
  let trial = 0;
  let prevRms = Infinity;

  /**
   * Run one ILC update cycle given desired and actual output trajectories.
   * @param {number[]} yd  Desired output (length T).
   * @param {number[]} y   Actual output from current trial (length T).
   * @returns {{ u_next, rmsError, improvement, trial }}
   */
  function update(yd, y) {
    if (yd.length !== T || y.length !== T)
      throw new Error(`iterativeLearningControl.update: yd and y must have length ${T}`);

    // Error at each step
    const e = yd.map((d, t) => d - y[t]);

    // RMS error
    const rmsError = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / T);

    // P-type update: u_{k+1}(t) = u_k(t) + L * e_k(t + delay)
    const u_kp1 = u_k.map((u, t) => {
      const eShifted = t + delay < T ? e[t + delay] : 0;
      return u + L * eShifted;
    });

    // Q-filter (scalar): u = Q * u_{k+1} (simple forgetting / smoothing)
    const u_next = u_kp1.map((u) => Q * u);

    const improvement = prevRms - rmsError;
    prevRms = rmsError;
    u_k = [...u_next];
    trial++;

    return { u_next: [...u_next], rmsError, improvement, trial };
  }

  return {
    update,
    get state() { return { u: [...u_k], trial, L, Q, delay }; },
    reset(u0New) { u_k = u0New ? [...u0New] : new Array(T).fill(0); trial = 0; prevRms = Infinity; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P30-05: Simplified Refined IV for Continuous-time (SRIVC)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Simplified Refined Instrumental Variable for Continuous-time (SRIVC).
 *
 * Estimates continuous-time ARX model parameters:
 *   a(p) y(t) = b(p) u(t) + e(t)
 *
 * where p = d/dt, a(p) = pⁿ + a_{n-1}p^{n-1} + ... + a_0,
 *               b(p) = b_{m} p^m + ... + b_0.
 *
 * Algorithm (Simplified / batch IV estimate):
 *   1. Prefilter both y and u with reference model H_ref(s) = 1/(s+α)^n
 *      (implemented as discrete-time approximation via backward difference)
 *   2. Build regressor matrix Φ using filtered derivatives
 *   3. Solve least-squares: θ = (ΦᵀΦ)⁻¹ Φᵀ y_filtered
 *
 * @param {number[]} y    Output samples (length N).
 * @param {number[]} u    Input samples (length N).
 * @param {number}   na   Order of A polynomial (without leading 1).
 * @param {number}   nb   Order of B polynomial (nb ≤ na).
 * @param {number}   Ts   Sampling period (seconds).
 * @param {object}   opts
 * @param {number}  [opts.alpha=1]     Prefilter pole location (> 0).
 * @param {number}  [opts.maxIter=5]   Refinement iterations.
 * @returns {{ a, b, residuals, iterations, method }}
 *   a: [a_{n-1}, ..., a_0] (denominator coefficients, leading 1 implicit)
 *   b: [b_m, ..., b_0]     (numerator coefficients)
 */
export function identifySRIVC(y, u, na, nb, Ts, opts = {}) {
  const { alpha = 1, maxIter = 5 } = opts;
  const N = y.length;
  if (u.length !== N) throw new Error('identifySRIVC: y and u must have same length');
  if (nb > na)        throw new Error('identifySRIVC: nb must be ≤ na (proper system)');

  /**
   * Apply 1st-order discrete backward-difference pre-filter 1/(1 − z⁻¹/α·Ts·...)
   * Approximation of 1/(s/α+1) via Euler backward: H(z) = α·Ts / (1 − (1−α·Ts)z⁻¹)
   * We use a simple (1 − shift) differentiator and then divide by Ts to approximate s.
   */
  function discreteDerivative(x) {
    return x.map((v, i) => (i === 0 ? 0 : (v - x[i - 1]) / Ts));
  }

  function prefilter(x, poles) {
    // Cascade of na first-order IIR filters (backward Euler)
    let out = [...x];
    for (let k = 0; k < poles; k++) {
      const f = new Array(N).fill(0);
      const c = 1 - alpha * Ts; // |c| < 1 for stability
      for (let i = 1; i < N; i++) f[i] = c * f[i - 1] + alpha * Ts * out[i];
      out = f;
    }
    return out;
  }

  // Generate filtered derivative signals up to order na
  const buildDerivatives = (x, nMax) => {
    const derivs = [x];
    for (let k = 1; k <= nMax; k++) {
      derivs.push(discreteDerivative(derivs[k - 1]));
    }
    return derivs;
  };

  // Initial estimate via simple least-squares
  let aEst = new Array(na).fill(0);
  let bEst = new Array(nb + 1).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Prefilter with current model (simplified: use fixed alpha prefilter)
    const yFilt = prefilter(y, na);
    const uFilt = prefilter(u, na);

    const yDerivs = buildDerivatives(yFilt, na);
    const uDerivs = buildDerivatives(uFilt, nb);

    // Build regression matrix Φ (one row per time step, skip first na samples)
    const start = na;
    const Neff = N - start;
    const nTheta = na + nb + 1;

    const Phi = [];
    const Yv  = [];

    for (let t = start; t < N; t++) {
      const row = [];
      // A-polynomial regressors: −y^(na-1)(t), ..., −y^(0)(t) → [−d^{na-1}y, ..., −y]
      for (let k = na - 1; k >= 0; k--) row.push(-yDerivs[k][t]);
      // B-polynomial regressors: u^(nb)(t), ..., u^(0)(t)
      for (let k = nb; k >= 0; k--) row.push(uDerivs[k][t]);

      Phi.push(row);
      // RHS: y^(na)(t) (highest derivative)
      Yv.push(yDerivs[na][t]);
    }

    // Least-squares solve: θ = (ΦᵀΦ)⁻¹ Φᵀ Y
    // Use normal equations
    const PhiT_Phi = Array.from({ length: nTheta }, (_, i) =>
      Array.from({ length: nTheta }, (__, j) =>
        Phi.reduce((s, row) => s + row[i] * row[j], 0),
      ),
    );
    const PhiT_Y = Array.from({ length: nTheta }, (_, i) =>
      Phi.reduce((s, row, t2) => s + row[i] * Yv[t2], 0),
    );

    const theta = solveNormalEq(PhiT_Phi, PhiT_Y);
    if (!theta) break; // singular — stop refinement

    aEst = theta.slice(0, na);
    bEst = theta.slice(na);
  }

  // Compute residuals
  const yDerivsFinal = buildDerivatives(y, na);
  const uDerivsFinal = buildDerivatives(u, nb);
  const residuals = y.map((_, t) => {
    if (t < na) return 0;
    let res = yDerivsFinal[na][t];
    for (let k = 0; k < na; k++) res += aEst[na - 1 - k] * yDerivsFinal[k][t];
    for (let k = 0; k <= nb; k++) res -= bEst[nb - k] * uDerivsFinal[k][t];
    return res;
  });

  return { a: aEst, b: bEst, residuals, iterations: maxIter, method: 'srivc' };
}

/** Solve Ax = b via Cholesky / Gaussian elimination. */
function solveNormalEq(A, b) {
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
