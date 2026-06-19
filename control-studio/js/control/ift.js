/**
 * ift.js — Iterative Feedback Tuning (Hjalmarsson-Gevers).
 *
 * Loop 5 (Zero-Flaw) addition. Complements VRFT (single-shot batch tuning)
 * with the iterative gradient-descent flavour suitable for online or
 * incremental tuning.
 *
 * Cost:  J(θ) = (1/2N) Σ_k (y(θ, k) − y_d(k))²
 *
 * IFT computes ∂J/∂θ from three experiments per iteration in the original
 * formulation (Hjalmarsson 1998). For demonstration and verification we use
 * the simplified scalar single-parameter case where the gradient can be
 * obtained from a single perturbation experiment plus reference signals:
 *
 *   ∂J/∂θ ≈ (1/N) Σ_k (y(θ, k) − y_d(k)) · ∂y/∂θ(k)
 *
 * with ∂y/∂θ approximated by central differences.
 *
 * Reference:
 *   - Hjalmarsson, "Iterative feedback tuning - an overview", Int. J.
 *     Adaptive Control & Signal Proc., 16, 2002.
 *   - Hjalmarsson, Gunnarsson, Gevers, "A convergent iterative restricted
 *     complexity control design scheme", CDC 1994.
 */

/**
 * Run an IFT iteration on a black-box plant simulator.
 *
 * @param {(theta:number)=>{ y:number[], yd:number[] }} simulate - returns the
 *   closed-loop output and reference signal for the given controller param θ.
 * @param {number} theta0 - initial parameter.
 * @param {object} opts - { iterations, stepSize, perturb }.
 * @returns { history: Array<{theta,J,grad}>, theta: number }
 */
export function iterativeFeedbackTuning(simulate, theta0, opts = {}) {
  if (typeof simulate !== 'function') throw new Error('IFT: simulate fn required');
  const iterations = opts.iterations ?? 20;
  const stepSize = opts.stepSize ?? 0.05;
  const perturb = opts.perturb ?? 1e-3;
  let theta = theta0;
  const history = [];
  for (let iter = 0; iter < iterations; iter++) {
    const expPlus = simulate(theta + perturb);
    const expMinus = simulate(theta - perturb);
    const expMid = simulate(theta);
    const N = expMid.y.length;
    let J = 0;
    let grad = 0;
    for (let k = 0; k < N; k++) {
      const err = expMid.y[k] - expMid.yd[k];
      J += err * err;
      const dydtheta = (expPlus.y[k] - expMinus.y[k]) / (2 * perturb);
      grad += err * dydtheta;
    }
    J /= (2 * N);
    grad /= N;
    history.push({ theta, J, grad });
    theta = theta - stepSize * grad;
  }
  return { history, theta };
}
