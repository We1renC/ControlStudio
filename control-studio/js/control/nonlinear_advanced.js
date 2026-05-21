/**
 * nonlinear_advanced.js — P32: Advanced Nonlinear Control
 *
 * Modules:
 *   P32-01: feedbackLinearization — exact input-output linearization
 *   P32-02: backstepping          — recursive Lyapunov design for strict-feedback
 *   P32-03: controlBarrierFunction— CLF/CBF safety filter via QP (uses solveQP)
 */

import { solveQP } from '../math/optimization.js';

// ══════════════════════════════════════════════════════════════════════════════
// P32-01: Feedback Linearization
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Input-output feedback linearization for SISO affine systems:
 *   ẋ = f(x) + g(x) u
 *   y = h(x)
 *
 * If the relative degree r equals the state dimension n, exact state-space
 * linearization is achieved. Otherwise, input-output linearization creates
 * a linear relationship between the r-th derivative of y and a new input v:
 *   y^(r) = Lf^r h(x) + Lg Lf^{r-1} h(x) · u  →  set = v
 *   u = (v − Lf^r h(x)) / Lg Lf^{r-1} h(x)
 *
 * The linearizing control law is:
 *   u* = (v − α(x)) / β(x)
 *   where α(x) = Lf^r h(x),  β(x) = Lg Lf^{r-1} h(x)
 *
 * The outer linear controller v can be a pole-placement PD law:
 *   v = y_d^(r) − k_{r-1} (y^{r-1} − y_d^{r-1}) − ... − k_0 (y − y_d)
 *
 * @param {Function}  f        Drift: (x: number[]) → number[]
 * @param {Function}  g        Input vector field: (x: number[]) → number[]
 * @param {Function}  h        Output map: (x: number[]) → number
 * @param {number}    r        Relative degree.
 * @param {object}    opts
 * @param {number[]} [opts.k]  Feedback gains k[0..r-1] for outer linear law.
 *                             Default: critically-damped pole at −1.
 * @param {number}   [opts.eps=1e-9]  Decoupling singularity guard.
 * @returns {{ step: (x, yd, ydDot, t, dt) → { u, v, alpha, beta },
 *             computeDecouplingMatrix: (x) → { alpha, beta } }}
 */
export function feedbackLinearization(f, g, h, r, opts = {}) {
  const eps = opts.eps ?? 1e-9;

  // Default gains: characteristic polynomial (s+1)^r → binomial coefficients
  const defaultK = Array.from({ length: r }, (_, i) => {
    // Binomial C(r, i) for (s+1)^r coefficients (except leading s^r term)
    let c = 1;
    for (let j = 0; j < i; j++) c = c * (r - j) / (j + 1);
    return c;
  });
  const k = opts.k ?? defaultK;

  /**
   * Compute Lie derivatives numerically (central differences).
   * Lf h(x) = ∇h · f(x),  Lg h(x) = ∇h · g(x)
   * Lf^r h uses iterated Lie bracket approximation.
   */
  const h_eps = 1e-5;
  function numericalGradient(fn, x) {
    const n = x.length;
    return Array.from({ length: n }, (_, i) => {
      const xp = [...x]; xp[i] += h_eps;
      const xm = [...x]; xm[i] -= h_eps;
      return (fn(xp) - fn(xm)) / (2 * h_eps);
    });
  }

  /** Lf h(x) = ∇h(x) · f(x) */
  function lieBracketFH(h_fn, x) {
    const grad = numericalGradient(h_fn, x);
    const fx   = f(x);
    return grad.reduce((s, v, i) => s + v * fx[i], 0);
  }

  /** Build iterated Lie derivative Lf^k h as a scalar function of x. */
  function iteratedLie(k_order) {
    if (k_order === 0) return h;
    const prev = iteratedLie(k_order - 1);
    return (x) => lieBracketFH(prev, x);
  }

  const LfR_h   = iteratedLie(r);         // Lf^r h(x)
  const LfRm1_h = iteratedLie(r - 1);     // Lf^{r-1} h(x)

  /** Lg Lf^{r-1} h(x) = ∇(Lf^{r-1} h) · g(x) */
  function beta(x) {
    const grad = numericalGradient(LfRm1_h, x);
    const gx   = g(x);
    return grad.reduce((s, v, i) => s + v * gx[i], 0);
  }

  /**
   * Compute one step of the feedback-linearizing control.
   * @param {number[]} x    Current state.
   * @param {number}   yd   Desired output.
   * @param {number[]} ydDotVec  Desired output derivatives [yd', yd'', ..., yd^(r)].
   * @returns {{ u, v, alpha, betaVal }}
   */
  function step(x, yd, ydDotVec = []) {
    const alpha   = LfR_h(x);
    const betaVal = beta(x);

    // Tracking errors
    let y_k = LfRm1_h(x);
    // Build error vector from lower Lie derivatives
    const errors = Array.from({ length: r }, (_, i) => {
      const Li_h = iteratedLie(i);
      const yd_i = i === 0 ? yd : (ydDotVec[i - 1] ?? 0);
      return Li_h(x) - yd_i;
    });

    // Outer linear control: v = yd^(r) − sum_i k[i] * e_i
    const ydR = ydDotVec[r - 1] ?? 0;
    const v   = ydR - k.reduce((s, ki, i) => s + ki * errors[i], 0);

    // Linearizing law
    const bSafe = Math.abs(betaVal) > eps ? betaVal : Math.sign(betaVal || 1) * eps;
    const u     = (v - alpha) / bSafe;

    return { u, v, alpha, betaVal };
  }

  return {
    step,
    computeDecouplingMatrix: (x) => ({ alpha: LfR_h(x), beta: beta(x) }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P32-02: Backstepping
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Backstepping controller for 2nd-order strict-feedback systems:
 *   ẋ₁ = f₁(x₁) + x₂           (first subsystem)
 *   ẋ₂ = f₂(x₁, x₂) + u        (second subsystem / actual input)
 *   y  = x₁                      (output)
 *
 * Design:
 *   Step 1: virtual control φ₁*(x₁) = −k₁ x₁ − f₁(x₁) + ẋ₁_ref
 *           e₁ = x₂ − φ₁*, z₁ = x₁ − x₁_ref
 *   Step 2: u = −k₂ e₁ − z₁ − f₂(x₁,x₂) + φ̇₁*
 *              where φ̇₁* is approximated numerically.
 *
 * @param {Function}  f1      (x1: number) → number  (drift of subsystem 1).
 * @param {Function}  f2      (x1, x2: number) → number  (drift of subsystem 2).
 * @param {object}    opts
 * @param {number}   [opts.k1=2]  Gain for virtual control.
 * @param {number}   [opts.k2=2]  Gain for actual control.
 * @returns {{ step: (x1, x2, r, rDot) → { u, phi1, e1, z1 } }}
 */
export function backstepping(f1, f2, opts = {}) {
  const { k1 = 2, k2 = 2 } = opts;

  let prevPhi1 = null;
  let prevDt   = null;

  /**
   * @param {number} x1     State 1.
   * @param {number} x2     State 2.
   * @param {number} r      Reference (desired x1).
   * @param {number} rDot   Reference derivative (ẋ1_ref).
   * @param {number} dt     Time step (for φ̇₁* approximation).
   * @returns {{ u, phi1, e1, z1 }}
   */
  function step(x1, x2, r, rDot = 0, dt = 0.01) {
    // Step 1: virtual control
    const z1   = x1 - r;
    const phi1 = -k1 * z1 - f1(x1) + rDot;   // desired x2

    // φ̇₁* approximation (backward difference)
    const phi1Dot = prevPhi1 !== null ? (phi1 - prevPhi1) / dt : 0;

    // Step 2: actual control
    const e1 = x2 - phi1;
    const u  = -k2 * e1 - z1 - f2(x1, x2) + phi1Dot;

    prevPhi1 = phi1;
    prevDt   = dt;

    return { u, phi1, e1, z1 };
  }

  return {
    step,
    reset() { prevPhi1 = null; prevDt = null; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// P32-03: Control Lyapunov / Barrier Functions (CLF-CBF)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * CLF-CBF safety filter via QP.
 *
 * Given a nominal control u_nom(x), find u* nearest to u_nom subject to:
 *   CLF: V̇(x,u) ≤ −γ V(x)        (stability: V must decrease)
 *   CBF: ḣ(x,u) ≥ −α h(x)         (safety: h ≥ 0 is safe set)
 *
 * Solved as:
 *   min_{u, δ}  ‖u − u_nom‖² + λ_δ δ²
 *   s.t.  LfV + LgV u + γ V ≤ δ   (CLF — soft, slack δ)
 *         LfH + LgH u + α H ≥ 0    (CBF — hard)
 *
 * where LfV = ∇V · f,  LgV = ∇V · g  (Lie derivatives, numerically).
 *
 * @param {Function}  f        Drift: (x) → number[]
 * @param {Function}  g        Input field: (x) → number[]
 * @param {Function}  V        CLF: (x) → number  (must be ≥ 0)
 * @param {Function}  hBarrier CBF: (x) → number  (safe set: h(x) ≥ 0)
 * @param {object}    opts
 * @param {number}   [opts.gamma=1]     CLF decay rate.
 * @param {number}   [opts.alpha=1]     CBF class-K parameter.
 * @param {number}   [opts.lambdaDelta=1e3]  CLF slack penalty.
 * @param {number[]} [opts.uMin]         Input lower bounds.
 * @param {number[]} [opts.uMax]         Input upper bounds.
 * @param {number}   [opts.h_eps=1e-5]  Finite-difference step.
 * @returns {{ filter: (x, u_nom) → { u, delta, safe, clfVal, cbfVal } }}
 */
export function controlBarrierFunction(f, g, V, hBarrier, opts = {}) {
  const {
    gamma       = 1,
    alpha       = 1,
    lambdaDelta = 1e3,
    h_eps       = 1e-5,
  } = opts;

  function numericalGrad(fn, x) {
    const n = x.length;
    return Array.from({ length: n }, (_, i) => {
      const xp = [...x]; xp[i] += h_eps;
      const xm = [...x]; xm[i] -= h_eps;
      return (fn(xp) - fn(xm)) / (2 * h_eps);
    });
  }

  /**
   * Apply safety filter to nominal control.
   * @param {number[]} x      Current state.
   * @param {number[]} uNom   Nominal control (length m).
   * @returns {{ u, delta, safe, clfVal, cbfVal }}
   */
  function filter(x, uNom) {
    const m = uNom.length;

    const fx = f(x);
    const gx = g(x);   // n×m for MIMO — assume n×m, access gx[i] as column i

    const Vx  = V(x);
    const hx  = hBarrier(x);

    const gradV = numericalGrad(V, x);
    const gradH = numericalGrad(hBarrier, x);

    // Lf V = ∇V · f(x)
    const LfV = gradV.reduce((s, v, i) => s + v * fx[i], 0);

    // Lg V = ∇V · g(x)  (1×m vector for SISO: scalar)
    // For SISO m=1: LgV = ∇V · g
    const LgV = gx[0] !== undefined && typeof gx[0] === 'object'
      // MIMO: g is n×m array
      ? Array.from({ length: m }, (_, j) => gradV.reduce((s, v, i) => s + v * gx[i][j], 0))
      // SISO: g is n-vector
      : [gradV.reduce((s, v, i) => s + v * gx[i], 0)];

    const LfH = gradH.reduce((s, v, i) => s + v * fx[i], 0);
    const LgH = gx[0] !== undefined && typeof gx[0] === 'object'
      ? Array.from({ length: m }, (_, j) => gradH.reduce((s, v, i) => s + v * gx[i][j], 0))
      : [gradH.reduce((s, v, i) => s + v * gx[i], 0)];

    // Decision variables: [u (m), delta (1)] → total m+1
    // Objective: min (u-u_nom)^T (u-u_nom) + lambdaDelta * delta^2
    // H = 2*diag(1,...,1, lambdaDelta), f_qp = -2*[u_nom; 0]
    const nVar = m + 1;
    const H_qp = Array.from({ length: nVar }, (_, i) =>
      Array.from({ length: nVar }, (__, j) =>
        i === j ? (i < m ? 2 : 2 * lambdaDelta) : 0,
      ),
    );
    const f_qp = [...uNom.map((v) => -2 * v), 0];

    // CLF constraint: LfV + LgV·u + γ·V ≤ δ
    // → LgV·u − δ ≤ −LfV − γ·V
    const A_clf = [[...LgV, -1]];
    const b_clf = [-LfV - gamma * Vx];

    // CBF constraint: LfH + LgH·u + α·H ≥ 0
    // → −LgH·u ≤ LfH + α·H
    const A_cbf = [LgH.map((v) => -v).concat([0])];
    const b_cbf = [LfH + alpha * hx];

    const A  = [...A_clf, ...A_cbf];
    const b  = [...b_clf, ...b_cbf];

    const lb = opts.uMin ? [...opts.uMin, -1e6] : null;
    const ub = opts.uMax ? [...opts.uMax,  1e6] : null;

    const qpOpts = { A, b };
    if (lb) qpOpts.lb = lb;
    if (ub) qpOpts.ub = ub;

    const result = solveQP(H_qp, f_qp, qpOpts);
    const uStar  = result.x.slice(0, m);
    const delta  = result.x[m] ?? 0;

    // Check safety
    const cbfVal = LfH + LgH.reduce((s, v, i) => s + v * uStar[i], 0) + alpha * hx;
    const safe   = cbfVal >= -1e-4 && hx >= -1e-4;

    return { u: uStar, delta, safe, clfVal: Vx, cbfVal, hx };
  }

  return { filter };
}
