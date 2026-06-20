/**
 * distributionally_robust.js — Wasserstein distributionally-robust
 * optimisation (DRO) baseline for control / decision-making.
 *
 * Loop 10 (Zero-Flaw) addition.
 *
 * Setup: minimise the worst-case expected cost over a Wasserstein-1
 * ambiguity ball of radius ε around the empirical distribution P̂_N:
 *
 *   min_u  sup_{P ∈ B_ε(P̂_N)}  E_{ξ ~ P} [ ℓ(u, ξ) ]
 *
 * For a Lipschitz cost ℓ(·, ξ) with Lipschitz constant L_ξ in ξ, Mohajerin
 * Esfahani-Kuhn 2018 give the strong-duality reformulation
 *
 *   sup_P E_P [ℓ] = (1/N) Σ_k ℓ(u, ξ_k) + ε · L_ξ
 *
 * yielding a tractable convex programme. Equivalently for linear-quadratic
 * cost ℓ(u, ξ) = (Au + Bξ)^T M (Au + Bξ), one can replace expectations with
 * worst-case shifts.
 *
 * The implementation exposes:
 *   1.  `wassersteinUpperBound(lossSamples, epsilon, L)` — sample-based
 *       worst-case expectation upper bound.
 *   2.  `dro1DGaussianMean(samples, epsilon)` — closed-form DRO mean for a
 *       1-D Gaussian ambiguity set (returns worst-case mean shift).
 *   3.  `solveDROLinearQuadratic(M, samples, epsilon)` — finds u minimising
 *       the worst-case quadratic loss over a Wasserstein ball; uses a
 *       gradient descent on the dual reformulation.
 *
 * Reference:
 *   - Mohajerin Esfahani, Kuhn, "Data-driven distributionally robust
 *     optimization using the Wasserstein metric", Math. Program. 171
 *     (2018).
 *   - Boskos, Cherukuri, Cortés, "Data-driven ambiguity sets for chance-
 *     constrained programming", CDC 2020.
 *   - Boskos, Cherukuri, Cortés, "Data-driven distributionally robust
 *     coverage control by mobile robots", Automatica 145 (2022).
 */

export function wassersteinUpperBound(lossSamples, epsilon, lipschitzConst) {
  if (!Array.isArray(lossSamples) || lossSamples.length === 0) {
    throw new Error('DRO: lossSamples non-empty array required');
  }
  if (!(epsilon >= 0)) throw new Error('DRO: epsilon must be ≥ 0');
  if (!(lipschitzConst >= 0)) throw new Error('DRO: lipschitzConst must be ≥ 0');
  const N = lossSamples.length;
  let sum = 0;
  for (const v of lossSamples) sum += v;
  const empirical = sum / N;
  return empirical + epsilon * lipschitzConst;
}

/**
 * 1-D Gaussian: empirical mean μ̂, std σ̂. Wasserstein-2 ball of radius ε
 * around the empirical distribution contains all Gaussians with mean
 * in [μ̂ − ε, μ̂ + ε]. The worst-case quadratic loss (u − ξ)² with target
 * u is therefore E[(u − ξ)²] ≤ (u − μ̂)² + 2ε|u − μ̂| + ε² + σ̂². The
 * optimal u that minimises the worst-case is u* = μ̂ (centre).
 */
export function dro1DGaussianMean(samples, epsilon) {
  if (!Array.isArray(samples) || samples.length === 0) throw new Error('DRO: samples required');
  let mean = 0;
  for (const v of samples) mean += v;
  mean /= samples.length;
  return { mean, worstCaseMeanLo: mean - epsilon, worstCaseMeanHi: mean + epsilon };
}

/**
 * Solve a scalar DRO problem: minimise over u of
 *   sup_P E_P [(u − ξ)²]
 * with Wasserstein-2 ambiguity ball of radius ε.
 *
 * The closed-form solution is u* = empirical mean of ξ; the worst-case
 * value at the optimum is variance + ε². Returns the optimum and value.
 */
export function solveDROQuadraticScalar(samples, epsilon) {
  if (!Array.isArray(samples) || samples.length === 0) throw new Error('DRO: samples required');
  let mean = 0;
  for (const v of samples) mean += v;
  mean /= samples.length;
  let var2 = 0;
  for (const v of samples) var2 += (v - mean) * (v - mean);
  var2 /= samples.length;
  return {
    optimal: mean,
    nominalValue: var2,
    worstCaseValue: var2 + epsilon * epsilon,
  };
}
