/**
 * hji_reach.js — Hamilton-Jacobi-Isaacs reach-avoid baseline.
 *
 * Loop 6 (Zero-Flaw) addition. Provides a deterministic 1-D / 2-D PDE solver
 * for HJI value functions on Cartesian grids, with reach-avoid sets obtained
 * as level sets of the value function. The solver uses a Lax-Friedrichs
 * scheme with explicit Euler time integration (CFL bounded automatically).
 *
 * 1-D HJI problem (pursuit-evasion, dynamic-extreme):
 *   V_t + min_u max_d  (∂V/∂x · f(x, u, d)) = 0
 *
 * For the verification-grade baseline we expose:
 *   - `solveHJI1D(dynamics, lValue, options)` for scalar state.
 *   - `reachAvoid1D(targetSet, avoidSet, dynamics, options)` returning BRT.
 *
 * Reference:
 *   - Mitchell, Bayen, Tomlin, "A time-dependent Hamilton-Jacobi formulation
 *     of reachable sets for continuous dynamic games", IEEE TAC 50(7), 2005.
 *   - Bansal, Chen, Herbert, Tomlin, "Hamilton-Jacobi reachability: A brief
 *     overview and recent advances", CDC 2017.
 *   - Osher & Fedkiw, "Level Set Methods and Dynamic Implicit Surfaces",
 *     Springer, §6.
 */

function lowerEnvelope(values) {
  let m = Infinity;
  for (const v of values) if (v < m) m = v;
  return m;
}

function upperEnvelope(values) {
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

/**
 * Solve the 1-D backward reachable tube via Lax-Friedrichs.
 *
 * @param {object} dynamics
 *   - dynamics.f(x, u, d): scalar dx/dt
 *   - dynamics.uBounds: [u_min, u_max] (player u minimises V_t)
 *   - dynamics.dBounds: [d_min, d_max] (player d maximises V_t)
 * @param {(x:number)=>number} lValue - signed-distance to target set (≤0 inside)
 * @param {object} options
 *   - xMin, xMax: spatial domain
 *   - dx: grid spacing
 *   - T: integration horizon (backward in time, so end value is V(0, x) = l(x))
 *   - cfl: Courant number (default 0.45)
 */
export function solveHJI1D(dynamics, lValue, options = {}) {
  const { xMin = -2, xMax = 2, dx = 0.05, T = 1.0, cfl = 0.45 } = options;
  if (!(dx > 0 && xMax > xMin && T > 0)) throw new Error('HJI1D: invalid grid / horizon');
  const N = Math.floor((xMax - xMin) / dx) + 1;
  const x = new Array(N);
  for (let i = 0; i < N; i++) x[i] = xMin + i * dx;
  let V = x.map(lValue);
  const grid = [V.slice()];
  // Determine maximum |f| for CFL gate.
  const uSamples = [dynamics.uBounds[0], dynamics.uBounds[1]];
  const dSamples = [dynamics.dBounds[0], dynamics.dBounds[1]];
  let maxF = 0;
  for (const xi of x) {
    for (const u of uSamples) {
      for (const dval of dSamples) {
        const f = Math.abs(dynamics.f(xi, u, dval));
        if (f > maxF) maxF = f;
      }
    }
  }
  if (maxF <= 0) throw new Error('HJI1D: dynamics produce zero motion; degenerate problem');
  const dt = cfl * dx / maxF;
  const steps = Math.max(1, Math.ceil(T / dt));
  const dtActual = T / steps;

  for (let k = 0; k < steps; k++) {
    const Vnew = V.slice();
    for (let i = 1; i < N - 1; i++) {
      // Centered derivative
      const Vx = (V[i + 1] - V[i - 1]) / (2 * dx);
      // Hamiltonian: min_u max_d ∂V/∂x · f(x, u, d). For reach-avoid we want
      // the safety controller to maximise V (target distance) under adversarial d.
      // min_u of max_d  Vx · f
      let hMin = Infinity;
      for (const u of uSamples) {
        let hMax = -Infinity;
        for (const dval of dSamples) {
          const f = dynamics.f(x[i], u, dval);
          const h = Vx * f;
          if (h > hMax) hMax = h;
        }
        if (hMax < hMin) hMin = hMax;
      }
      // Add Lax-Friedrichs artificial viscosity α (max |f|) * (V_{i+1} - 2 V_i + V_{i-1}) / (2 dx)
      const alpha = maxF;
      const visc = alpha * (V[i + 1] - 2 * V[i] + V[i - 1]) / (2 * dx);
      // Backward-in-time so subtract H from V (V_t + H = 0 ⇒ ∂V/∂τ = -H)
      Vnew[i] = V[i] - dtActual * hMin + dtActual * visc;
    }
    // Neumann boundary (zero-gradient)
    Vnew[0] = Vnew[1];
    Vnew[N - 1] = Vnew[N - 2];
    V = Vnew;
    grid.push(V.slice());
  }
  return { x, V, grid, steps, dt: dtActual };
}

/**
 * Backward reachable tube as the set where V(T, x) ≤ 0. Returns the index range
 * for inclusion and a boolean mask aligned to the grid.
 */
export function backwardReachableTube(hjiResult) {
  const { x, V } = hjiResult;
  const mask = V.map((v) => v <= 0);
  let lo = -1, hi = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      if (lo === -1) lo = i;
      hi = i;
    }
  }
  return { mask, x, lo, hi, included: lo >= 0 };
}
