/**
 * pontryagin_max_principle.js — Pontryagin Maximum Principle / single-
 * shooting solver for two-point boundary value problems.
 *
 * Loop 14 (Zero-Flaw) addition.
 *
 * Optimal control problem:
 *   minimise  φ(x(T)) + ∫₀ᵀ L(x, u) dt
 *   subject to  ẋ = f(x, u),   x(0) = x_0
 *
 * Pontryagin's Maximum Principle (Pontryagin et al. 1962):
 *   Define Hamiltonian H(x, u, λ) = L(x, u) + λ^T f(x, u).
 *   Then along the optimal trajectory:
 *     ẋ = ∂H/∂λ = f(x, u*)
 *     λ̇ = − ∂H/∂x
 *     u* = argmin_u H(x, u, λ)
 *     λ(T) = ∂φ/∂x(x(T))   (transversality)
 *
 * Single-shooting: guess λ(0), integrate (x, λ) forward, check terminal
 * costate; iterate with Newton or secant updates on λ(0) until the
 * transversality condition holds.
 *
 * For the verification harness we provide the standard SISO scalar LQR
 * problem with analytic solution as the canonical fixture:
 *
 *   ẋ = a x + b u,    L = (q/2) x² + (r/2) u²,   φ = (s/2) x(T)²
 *   ⇒ u*(t) = −(b/r) λ(t),   λ̇ = −q x − a λ,  λ(T) = s x(T)
 *
 * Reference:
 *   - Pontryagin, Boltyanskii, Gamkrelidze, Mishchenko, "The Mathematical
 *     Theory of Optimal Processes", Wiley 1962.
 *   - Bryson, Ho, "Applied Optimal Control", Hemisphere 1975.
 *   - Bertsekas, "Dynamic Programming and Optimal Control", Athena 2017.
 */

function rk4Step(odefn, xc, dt) {
  const k1 = odefn(xc);
  const x2 = xc.map((v, i) => v + 0.5 * dt * k1[i]);
  const k2 = odefn(x2);
  const x3 = xc.map((v, i) => v + 0.5 * dt * k2[i]);
  const k3 = odefn(x3);
  const x4 = xc.map((v, i) => v + dt * k3[i]);
  const k4 = odefn(x4);
  return xc.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/**
 * Solve the LQR-style PMP problem via single shooting with secant updates.
 *
 * @param {object} problem - { a, b, q, r, s, T, x0 }  scalar problem
 * @param {object} options - { lambda0Init, dt, maxIter, tol }
 * @returns { lambda0, trajectory: { t, x, lambda, u, cost } }
 */
export function pmpScalarShooting(problem, options = {}) {
  const { a, b, q, r, s, T, x0 } = problem;
  if (![a, b, q, r, s, T, x0].every(Number.isFinite)) {
    throw new Error('PMP: scalar problem parameters required');
  }
  if (!(r > 0)) throw new Error('PMP: r must be > 0');
  if (!(T > 0)) throw new Error('PMP: T must be > 0');
  const dt = options.dt ?? 1e-3;
  const maxIter = options.maxIter ?? 30;
  const tol = options.tol ?? 1e-8;

  const integrate = (lambda0) => {
    // State z = [x, λ]; dynamics
    //   ẋ = a x + b u = a x - b² λ / r
    //   λ̇ = -q x - a λ
    const steps = Math.round(T / dt);
    let z = [x0, lambda0];
    const t = new Array(steps + 1), x = new Array(steps + 1), lambdaArr = new Array(steps + 1), u = new Array(steps + 1);
    t[0] = 0; x[0] = z[0]; lambdaArr[0] = z[1]; u[0] = -(b * z[1]) / r;
    const ode = (zc) => [a * zc[0] - (b * b) * zc[1] / r, -q * zc[0] - a * zc[1]];
    for (let k = 0; k < steps; k++) {
      z = rk4Step(ode, z, dt);
      t[k + 1] = (k + 1) * dt;
      x[k + 1] = z[0];
      lambdaArr[k + 1] = z[1];
      u[k + 1] = -(b * z[1]) / r;
    }
    return { t, x, lambda: lambdaArr, u };
  };

  // Secant iteration on the transversality residual g(λ_0) = λ(T) - s x(T).
  let lambda0 = options.lambda0Init ?? 0;
  let traj = integrate(lambda0);
  let g0 = traj.lambda[traj.lambda.length - 1] - s * traj.x[traj.x.length - 1];
  let lambda1 = lambda0 + 1;
  let traj1 = integrate(lambda1);
  let g1 = traj1.lambda[traj1.lambda.length - 1] - s * traj1.x[traj1.x.length - 1];

  let iter = 0;
  for (; iter < maxIter; iter++) {
    if (Math.abs(g1) < tol) break;
    const denom = g1 - g0;
    if (Math.abs(denom) < 1e-14) break;
    const lambda2 = lambda1 - g1 * (lambda1 - lambda0) / denom;
    const traj2 = integrate(lambda2);
    const g2 = traj2.lambda[traj2.lambda.length - 1] - s * traj2.x[traj2.x.length - 1];
    lambda0 = lambda1; g0 = g1;
    lambda1 = lambda2; g1 = g2; traj1 = traj2;
  }
  // Cost
  let cost = 0.5 * s * traj1.x[traj1.x.length - 1] * traj1.x[traj1.x.length - 1];
  for (let k = 0; k < traj1.t.length - 1; k++) {
    const dt2 = traj1.t[k + 1] - traj1.t[k];
    const integrand = 0.5 * (
      0.5 * (q * traj1.x[k] * traj1.x[k] + r * traj1.u[k] * traj1.u[k]) +
      0.5 * (q * traj1.x[k + 1] * traj1.x[k + 1] + r * traj1.u[k + 1] * traj1.u[k + 1])
    );
    cost += dt2 * integrand;
  }
  return {
    lambda0: lambda1,
    transversalityResidual: g1,
    iterations: iter,
    trajectory: { ...traj1, cost },
  };
}
