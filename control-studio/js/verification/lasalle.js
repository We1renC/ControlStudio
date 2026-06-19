/**
 * lasalle.js — LaSalle's invariance principle certificate baseline.
 *
 * Loop 9 (Zero-Flaw) addition.
 *
 * Theorem (LaSalle 1960): For ẋ = f(x), let Ω be a compact, positively
 * invariant set, V: Ω → ℝ a C¹ function with V̇(x) ≤ 0 on Ω. Let
 *   E = { x ∈ Ω | V̇(x) = 0 },
 *   M = largest invariant subset of E.
 * Then every solution starting in Ω approaches M as t → ∞.
 *
 * Practical application: when V̇ ≤ 0 (semidefinite, not strict), LaSalle
 * gives the asymptotic limit set; in many cases M = {0} ⇒ asymptotic
 * stability of origin without strict V̇ < 0.
 *
 * This module provides a *numerical certificate-checker*: given a vector
 * field f(x), candidate Lyapunov V(x), and an invariant region Ω, sample
 * the zero-V̇ surface and verify that any trajectory starting on it stays
 * inside E only if x = 0 (or a user-specified invariant target). Uses a
 * short forward simulation.
 *
 * Reference:
 *   - LaSalle, "Some extensions of Liapunov's second method", IRE Trans.
 *     Circuit Theory, 1960.
 *   - Khalil, "Nonlinear Systems" §4.2, Prentice Hall.
 *   - Slotine, Li, "Applied Nonlinear Control" §3.4.
 */

function rk4Step(f, x, dt) {
  const k1 = f(x);
  const x2 = x.map((v, i) => v + 0.5 * dt * k1[i]);
  const k2 = f(x2);
  const x3 = x.map((v, i) => v + 0.5 * dt * k2[i]);
  const k3 = f(x3);
  const x4 = x.map((v, i) => v + dt * k3[i]);
  const k4 = f(x4);
  return x.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function vDotFn(V, f, x, eps = 1e-5) {
  // V̇(x) = ∇V · f(x). Numerical gradient via central differences.
  const n = x.length;
  const fx = f(x);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const xp = x.slice(); xp[i] += eps;
    const xm = x.slice(); xm[i] -= eps;
    const dVi = (V(xp) - V(xm)) / (2 * eps);
    acc += dVi * fx[i];
  }
  return acc;
}

/**
 * Certify LaSalle on a polynomial 2-D field with candidate V(x).
 *
 * Procedure:
 *   1. Sample a grid in Ω, compute V̇.
 *   2. Identify the V̇ ≈ 0 set E.
 *   3. For each sample on E, simulate forward for a short duration; check
 *      whether the trajectory leaves the zero-V̇ surface.
 *   4. If all on-E trajectories leave E except those that stay near the
 *      target invariant set M (default: origin), the certificate holds.
 *
 * @param {(x:number[])=>number[]} f
 * @param {(x:number[])=>number} V
 * @param {object} options - { radius, gridSize, eps, simulationT, simulationDt, targetTol }
 * @returns {{ certificate: boolean, witness?: number[], samplesOnE: number }}
 */
export function certifyLaSalle(f, V, options = {}) {
  const radius = options.radius ?? 1.0;
  const gridSize = options.gridSize ?? 11;
  const eps = options.eps ?? 1e-4;
  const T = options.simulationT ?? 1.0;
  const dt = options.simulationDt ?? 1e-3;
  const targetTol = options.targetTol ?? 1e-2;
  // 2-D only for the baseline
  let samplesOnE = 0;
  let witness = null;
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const x0 = [
        -radius + 2 * radius * (i / (gridSize - 1)),
        -radius + 2 * radius * (j / (gridSize - 1)),
      ];
      if (Math.hypot(x0[0], x0[1]) < 1e-3) continue;     // skip origin sample
      const vd = vDotFn(V, f, x0);
      if (Math.abs(vd) < eps) {
        samplesOnE++;
        // Simulate forward and check if it leaves E or stays at origin.
        let x = x0.slice();
        const steps = Math.floor(T / dt);
        let leftE = false;
        for (let s = 0; s < steps; s++) {
          x = rk4Step(f, x, dt);
          const vdNow = vDotFn(V, f, x);
          if (Math.abs(vdNow) > eps * 5) { leftE = true; break; }
        }
        const norm = Math.hypot(x[0], x[1]);
        if (!leftE && norm > targetTol) {
          witness = x0;
          return { certificate: false, witness, samplesOnE };
        }
      }
    }
  }
  return { certificate: true, samplesOnE };
}
