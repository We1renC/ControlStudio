/**
 * adaptive_smc.js — Slotine-Li adaptive sliding-mode control with online
 * parameter estimation.
 *
 * Loop 8 (Zero-Flaw) addition.
 *
 * For the SISO first-order uncertain plant
 *   ẋ = a(x) + b(x) u + d(t)
 * where a(·) is parameterised linearly  a(x) = φ(x)^T θ_a  with unknown θ_a
 * and b > 0 is known. Define sliding surface  s = ẋ_r + λ (x_r − x)? we use
 * standard Slotine-Li: s = ė + λ e, with e = x - x_d.
 *
 * Control law:
 *   u = b^{-1} ( -φ(x)^T θ̂_a + ẍ_d − λ ė − K · sign(s) )
 *
 * Adaptation law (gradient on V = (1/2) s² + (1/2 γ) ‖θ̃_a‖²):
 *   θ̂̇_a = γ s φ(x)
 *
 * yields θ̃_a → 0 and s → 0 provided the disturbance is bounded by K.
 *
 * The implementation supports a multivariable regression vector φ(x) and a
 * single sliding-mode gain K with a chattering-suppression boundary layer
 * width φ_bl.
 *
 * Reference:
 *   - Slotine, Li, "Applied Nonlinear Control", §8.5–8.6, Prentice Hall 1991.
 *   - Krstic, Kanellakopoulos, Kokotović, "Nonlinear and Adaptive Control
 *     Design", Wiley 1995.
 */

function tanhSat(s, phi) {
  return phi > 0 ? Math.tanh(s / phi) : Math.sign(s);
}

/**
 * Simulate the closed-loop trajectory of an adaptive SMC.
 *
 * @param {object} plant - { a(x): scalar drift, b: scalar input gain,
 *                            phi(x): regression vector function }
 * @param {Function} aTrueParams - true θ_a vector (for synthetic experiment)
 * @param {Array} refDeriv - [x_d, ẋ_d, ẍ_d] reference trajectories (arrays)
 * @param {object} options - { Ts, K, lambda, gamma, phiBl, x0, thetaHat0 }
 */
export function simulateAdaptiveSMC(plant, aTrueParams, refDeriv, options = {}) {
  const Ts = options.Ts ?? 1e-3;
  const K = options.K ?? 1.0;
  const gamma = options.gamma ?? 50.0;
  const phiBl = options.phiBl ?? 0.05;
  const xd = refDeriv[0];
  const xdDot = refDeriv[1];
  const N = xd.length;
  let x = options.x0 ?? 0;
  const pDim = plant.phi(x).length;
  let thetaHat = options.thetaHat0?.slice() ?? new Array(pDim).fill(0);

  const t = new Array(N), xArr = new Array(N), sArr = new Array(N);
  const thetaArr = new Array(N), uArr = new Array(N);
  for (let k = 0; k < N; k++) {
    t[k] = k * Ts;
    // First-order plant ẋ = a(x) + b u: sliding surface s = e = x - xd.
    const s = x - xd[k];
    const phiX = plant.phi(x);
    const aTrue = dot(phiX, aTrueParams);
    const aHat = dot(phiX, thetaHat);
    const u = (1 / plant.b) * (
      -aHat + xdDot[k] - K * tanhSat(s, phiBl)
    );
    const xDotTrue = aTrue + plant.b * u;
    x += Ts * xDotTrue;
    // Adaptation: V = (1/2) s² + (1/(2γ)) ‖θ̃‖²
    // V̇ = s ṡ - (1/γ) θ̃^T θ̂̇  with ṡ = ẋ - ẋd = (φ^T θ - φ^T θ̂) - K sat(s)
    //                                 = -φ^T θ̃ - K sat(s)
    // V̇ = s(-φ^T θ̃ - K sat(s)) - (1/γ) θ̃^T θ̂̇ = -K |s| - θ̃^T (s φ + (1/γ) θ̂̇)
    // Choose θ̂̇ = γ s φ ⇒ V̇ = -K |s| ≤ 0.
    for (let i = 0; i < pDim; i++) thetaHat[i] += Ts * gamma * s * phiX[i];

    sArr[k] = s;
    xArr[k] = x;
    thetaArr[k] = thetaHat.slice();
    uArr[k] = u;
  }
  return { t, x: xArr, s: sArr, theta: thetaArr, u: uArr };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
