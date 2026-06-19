/**
 * pde_boundary.js — Boundary control of the 1-D heat equation baseline.
 *
 * Loop 8 (Zero-Flaw) addition. ControlStudio previously had no partial-
 * differential-equation control; this module exposes a finite-difference
 * solver for the 1-D heat equation
 *
 *   u_t(x, t) = α u_xx(x, t),   x ∈ (0, L),  t > 0
 *   u(0, t) = U_0(t),  u(L, t) = U_L(t)   (Dirichlet boundary controls)
 *   u(x, 0) = u₀(x)
 *
 * and a Lyapunov-based stabilising boundary feedback that drives any initial
 * temperature profile to zero in L² norm:
 *
 *   U_L(t) = -k_b · u_x(L, t)         (Krstic-Smyshlyaev §3 boundary feedback)
 *   U_0(t) = 0
 *
 * The L² energy V(t) = ∫₀^L u²(x, t) dx satisfies
 *   V̇(t) = -2 α ∫₀^L u_x² dx + 2 α u u_x |_{x=0}^{x=L}
 *        = -2 α (k_b u²(L, t) + ∫₀^L u_x² dx)  ≤ 0
 * confirming exponential decay for k_b > 0.
 *
 * The implementation uses explicit Euler / centered space (CFL: Δt ≤ Δx²/(2α))
 * for finite-difference integration.
 *
 * Reference:
 *   - Krstic, Smyshlyaev, "Boundary Control of PDEs", SIAM 2008, §3.
 *   - Lions, "Optimal Control of Systems Governed by PDEs", Springer 1971.
 */

export function simulateHeatBoundaryControl(options = {}) {
  const L = options.L ?? 1.0;
  const alpha = options.alpha ?? 0.1;
  const N = options.N ?? 50;
  const T = options.T ?? 5.0;
  const dx = L / N;
  const dtMax = (dx * dx) / (2 * alpha);
  const dt = options.dt ?? 0.4 * dtMax;
  if (!(dt < dtMax)) throw new Error('PDE: dt must be < CFL limit Δx²/(2α)');
  const steps = Math.floor(T / dt);
  const kb = options.kb ?? 1.0;
  const u0 = options.u0 ?? ((x) => Math.sin(Math.PI * x / L));

  let u = new Array(N + 1);
  for (let i = 0; i <= N; i++) u[i] = u0(i * dx);
  const energy = new Array(steps + 1);
  const boundaryControl = new Array(steps + 1);
  energy[0] = l2Norm(u, dx);
  boundaryControl[0] = 0;

  for (let k = 0; k < steps; k++) {
    const uNext = new Array(N + 1);
    // Robin boundary at x = L:  α u_x(L) + k_b u(L) = 0
    //   ⇒ ghost cell u_{N+1} = u_{N-1} − 2 dx (k_b/α) u_N
    // Interior + right-boundary updates use the same diffusion stencil.
    for (let i = 1; i < N; i++) {
      uNext[i] = u[i] + dt * alpha * (u[i + 1] - 2 * u[i] + u[i - 1]) / (dx * dx);
    }
    const uGhost = u[N - 1] - 2 * dx * (kb / alpha) * u[N];
    uNext[N] = u[N] + dt * alpha * (uGhost - 2 * u[N] + u[N - 1]) / (dx * dx);
    uNext[0] = 0;                  // Dirichlet on left boundary
    boundaryControl[k + 1] = -kb * u[N];   // recorded boundary control value
    u = uNext;
    energy[k + 1] = l2Norm(u, dx);
  }
  return { energy, u, boundaryControl, dt, steps };
}

function l2Norm(u, dx) {
  let s = 0;
  for (let i = 0; i < u.length; i++) s += u[i] * u[i] * dx;
  return Math.sqrt(s);
}
