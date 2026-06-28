/**
 * l1_adaptive.js — L1 adaptive control baseline (Hovakimyan-Cao 2010).
 *
 * Loop 13 (Zero-Flaw) addition.
 *
 * L1 architecture (scalar plant for verification clarity):
 *   plant:   ẋ = a x + b u + σ      (a, b: known; σ: matched disturbance / parameter mismatch)
 *
 *   state predictor:
 *           ẋ̂ = a_m x̂ + b u + σ̂ − k (x̂ − x)       (a_m: desired closed-loop pole)
 *
 *   adaptation law (projection-based):
 *           σ̂̇ = Γ Proj(σ̂, − P (x̂ − x))
 *           with P solving a_m^T P + P a_m = − Q,  Q > 0.
 *
 *   low-pass filter:
 *           u(s) = − C(s) [ σ̂(s)/b + k_g r(s) ]
 *           where C(s) is a strictly proper, BIBO-stable low-pass filter (e.g.
 *           ω_c / (s + ω_c)) and k_g = − a_m / b (DC reference matching gain).
 *
 * The key innovation is the *decoupling* of the adaptation rate Γ (which can
 * be made very high) from the closed-loop control bandwidth (which is
 * shaped solely by C(s)). This provides quantifiable transient bounds:
 *
 *   ‖x_ref − x_d‖_∞ ≤ γ_1 / sqrt(Γ)
 *
 * which is what classical MRAC lacks.
 *
 * Reference:
 *   - Hovakimyan, Cao, "L1 Adaptive Control Theory: Guaranteed Robustness
 *     with Fast Adaptation", SIAM Advances in Design and Control, 2010.
 *   - Cao, Hovakimyan, "Design and analysis of a novel L1 adaptive control
 *     architecture, Part I/II", ACC 2008.
 */

/**
 * Simulate the SISO scalar L1 adaptive controller and return the trajectory.
 *
 * @param {object} plant - { a, b, sigma: time-varying disturbance fn }
 * @param {Array<number>} refSignal - reference signal samples
 * @param {object} options - { Ts, am, Q, Gamma, omegaC, x0 }
 */
export function simulateL1Adaptive(plant, refSignal, options = {}) {
  const Ts = options.Ts ?? 1e-3;
  const am = options.am ?? -5;             // desired closed-loop pole
  const Gamma = options.Gamma ?? 5000;      // adaptation gain
  const omegaC = options.omegaC ?? 30;     // low-pass cutoff
  const Q = options.Q ?? 1;
  const projBound = options.projectionBound ?? 100;
  if (am >= 0) throw new Error('L1: am must be < 0 (Hurwitz desired pole)');
  if (Gamma <= 0) throw new Error('L1: Gamma must be > 0');
  if (omegaC <= 0) throw new Error('L1: omegaC must be > 0');

  // Lyapunov P for am^T P + P am = -Q  with scalar am: 2 am P = -Q ⇒ P = -Q/(2 am).
  const P = -Q / (2 * am);
  const a = plant.a;
  const b = plant.b;
  const kg = -am / b;                      // DC reference matching gain

  // Lumped uncertainty form: rewrite plant as ẋ = a_m x + b u + σ_tot where
  //   σ_tot = (a - a_m) x + σ.
  // Predictor in this canonical form: ẋ̂ = a_m x̂ + b u + σ̂ (no extra correction
  // needed because the error dynamics are ẋ̃ = a_m x̃ + (σ̂ − σ_tot)).
  let x = options.x0 ?? 0;
  let xHat = options.xHat0 ?? 0;
  let sigmaHat = options.sigmaHat0 ?? 0;
  // First-order low-pass state for u(s) = − C(s) [σ̂/b + kg r]; note that
  // because σ_tot contains (a − a_m) x, the controller compensates the full
  // lumped term once σ̂ has converged.
  let uFilt = 0;

  const T = refSignal.length;
  const t = new Array(T), xArr = new Array(T), uArr = new Array(T);
  const sigmaArr = new Array(T), errArr = new Array(T);
  for (let k = 0; k < T; k++) {
    t[k] = k * Ts;
    // Control: u = filtered version of −(σ̂/b) + kg r
    const desiredU = -(sigmaHat / b) + kg * refSignal[k];
    uFilt = uFilt + Ts * omegaC * (desiredU - uFilt);
    const u = uFilt;
    // Plant integration with possible time-varying disturbance σ(t)
    const sigmaTrue = typeof plant.sigma === 'function' ? plant.sigma(t[k]) : (plant.sigma ?? 0);
    const sigmaTot = (a - am) * x + sigmaTrue;       // lumped uncertainty
    x += Ts * (am * x + b * u + sigmaTot);
    // Predictor in canonical form
    xHat += Ts * (am * xHat + b * u + sigmaHat);
    const xTilde = xHat - x;
    // Adaptation: σ̂̇ = -Γ P x̃ b  (gradient of Lyapunov V = x̃^T P x̃)
    let dotSigma = -Gamma * P * xTilde * b;
    if (Math.abs(sigmaHat + Ts * dotSigma) > projBound) {
      dotSigma = (Math.sign(sigmaHat + Ts * dotSigma) * projBound - sigmaHat) / Ts;
    }
    sigmaHat += Ts * dotSigma;

    xArr[k] = x; uArr[k] = u; sigmaArr[k] = sigmaHat; errArr[k] = xTilde;
  }
  return { t, x: xArr, u: uArr, sigmaHat: sigmaArr, predictorError: errArr };
}
