/**
 * polynomial_chaos.js — Polynomial Chaos Expansion (Wiener-Hermite).
 *
 * Loop 14 (Zero-Flaw) addition.
 *
 * Setup: a random variable ξ ~ N(0, 1) and a random output Y = g(ξ) are
 * expanded in Hermite polynomial basis {H_n(ξ)} as
 *
 *   Y ≈ Σ_{n=0}^{N} α_n H_n(ξ)
 *
 * Coefficients α_n are obtained by Galerkin projection:
 *   α_n = E[Y H_n(ξ)] / E[H_n(ξ)²]
 *
 * with E[H_n(ξ)²] = n!  (probabilist's Hermite normalisation).
 *
 * Statistics from PCE:
 *   Mean  = α_0
 *   Variance = Σ_{n=1}^{N} α_n² · n!
 *
 * The implementation supports:
 *   - `hermitePolynomials(N)` returns evaluators H_0, ..., H_N.
 *   - `pceCoefficients(g, N, quadrature='gauss-hermite', order=20)` returns α.
 *   - `pceMeanVariance(alpha)`.
 *
 * Reference:
 *   - Wiener, "The Homogeneous Chaos", Amer. J. Math. 60 (1938).
 *   - Xiu, Karniadakis, "The Wiener-Askey polynomial chaos for stochastic
 *     differential equations", SIAM J. Sci. Comp. 24(2), 2002.
 *   - Ghanem, Spanos, "Stochastic Finite Elements: A Spectral Approach",
 *     Springer 1991.
 */

/**
 * Probabilist's Hermite polynomials He_n(x) defined by the recurrence
 *   He_0 = 1,  He_1 = x,  He_{n+1} = x He_n − n He_{n−1}.
 *
 * Returns an array of (N+1) callables.
 */
export function hermitePolynomials(N) {
  if (!Number.isInteger(N) || N < 0) throw new Error('hermite: N must be non-negative integer');
  return Array.from({ length: N + 1 }, (_, n) => (x) => {
    let h0 = 1;
    if (n === 0) return h0;
    let h1 = x;
    if (n === 1) return h1;
    for (let k = 2; k <= n; k++) {
      const next = x * h1 - (k - 1) * h0;
      h0 = h1;
      h1 = next;
    }
    return h1;
  });
}

/**
 * E[H_n²] = n! (factorial) under probabilist's convention.
 */
export function hermiteNormConstants(N) {
  const fact = new Array(N + 1);
  fact[0] = 1;
  for (let n = 1; n <= N; n++) fact[n] = n * fact[n - 1];
  return fact;
}

/**
 * Gauss-Hermite quadrature nodes and weights for the weight function
 * w(x) = (1/√(2π)) e^{−x²/2}. Returns { nodes, weights }.
 *
 * For verification we hard-code the most common low-order rules.
 */
export function gaussHermiteRule(order) {
  // Hard-coded rules for orders 1..10 (sufficient for typical PCE up to N≈5).
  const rules = {
    1: { nodes: [0], weights: [1] },
    2: { nodes: [-1, 1], weights: [0.5, 0.5] },
    3: {
      nodes: [-Math.sqrt(3), 0, Math.sqrt(3)],
      weights: [1/6, 2/3, 1/6],
    },
    4: {
      nodes: [-2.3344142183, -0.7419637843, 0.7419637843, 2.3344142183],
      weights: [0.0458758548, 0.4541241452, 0.4541241452, 0.0458758548],
    },
    5: {
      nodes: [-2.8569700139, -1.3556261799, 0, 1.3556261799, 2.8569700139],
      weights: [0.0112574113, 0.2220759220, 0.5333333333, 0.2220759220, 0.0112574113],
    },
    7: {
      nodes: [-3.7504397177, -2.3667594107, -1.1544053948, 0, 1.1544053948, 2.3667594107, 3.7504397177],
      weights: [0.0005482688, 0.0307571240, 0.2401231786, 0.4571428572, 0.2401231786, 0.0307571240, 0.0005482688],
    },
    10: {
      nodes: [-4.8594628283, -3.5818234835, -2.4843258417, -1.4659890943, -0.4849357075,
               0.4849357075, 1.4659890943, 2.4843258417, 3.5818234835, 4.8594628283],
      weights: [4.310652630718287e-6, 7.580709343122156e-4, 1.911158050077e-2, 1.354837029802e-1, 3.446423349321e-1,
                3.446423349321e-1, 1.354837029802e-1, 1.911158050077e-2, 7.580709343122156e-4, 4.310652630718287e-6],
    },
  };
  if (!(order in rules)) {
    throw new Error(`gauss-hermite: rule order ${order} not implemented (supported: ${Object.keys(rules).join(',')})`);
  }
  return rules[order];
}

/**
 * Compute PCE coefficients α_n = E[g(ξ) H_n(ξ)] / E[H_n²] using Gauss-Hermite
 * quadrature.
 */
export function pceCoefficients(g, N, options = {}) {
  if (typeof g !== 'function') throw new Error('PCE: g must be a function');
  const order = options.quadratureOrder ?? Math.max(N + 3, 7);
  const rule = gaussHermiteRule(order);
  const He = hermitePolynomials(N);
  const norms = hermiteNormConstants(N);
  const alpha = new Array(N + 1).fill(0);
  for (let i = 0; i < rule.nodes.length; i++) {
    const xi = rule.nodes[i];
    const w = rule.weights[i];
    const gVal = g(xi);
    for (let n = 0; n <= N; n++) {
      alpha[n] += w * gVal * He[n](xi);
    }
  }
  for (let n = 0; n <= N; n++) alpha[n] /= norms[n];
  return alpha;
}

/**
 * Compute mean and variance from PCE coefficients.
 */
export function pceMeanVariance(alpha) {
  const mean = alpha[0];
  let variance = 0;
  const norms = hermiteNormConstants(alpha.length - 1);
  for (let n = 1; n < alpha.length; n++) variance += alpha[n] * alpha[n] * norms[n];
  return { mean, variance };
}
