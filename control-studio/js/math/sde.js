/**
 * sde.js — Itô SDE integrators (Euler-Maruyama, Milstein) baseline.
 *
 * Loop 3 (Zero-Flaw) addition. ControlStudio had no stochastic differential
 * equation integrator; without these, Åström, Kushner-Yin, Øksendal and any
 * stochastic-control or estimation literature using continuous-time Brownian
 * noise cannot be replicated.
 *
 * SDE:   dX_t = f(t, X_t) dt + g(t, X_t) dW_t
 *
 * Schemes implemented:
 *   Euler-Maruyama (strong order 0.5, weak order 1)
 *     X_{k+1} = X_k + f(t_k, X_k) Δt + g(t_k, X_k) ΔW_k
 *   Milstein (strong order 1) for diagonal noise (g is a function of X only):
 *     X_{k+1} = X_k + f Δt + g ΔW + 0.5 g g'(ΔW^2 − Δt)
 *
 * References:
 *   - Kloeden & Platen, "Numerical Solution of SDEs", Springer 1992.
 *   - Higham, "An Algorithmic Introduction to Numerical Simulation of SDEs",
 *     SIAM Review 43(3), 2001.
 */

// Self-contained PRNG below; no external dependency required.

function ensureFn(f, label) {
  if (typeof f !== 'function') throw new Error(`${label}: function required`);
}

/**
 * Euler-Maruyama integrator.
 *
 * @param {(t:number, x:number[]) => number[]} drift     - f(t, x)
 * @param {(t:number, x:number[]) => number[][]} diffusion - g(t, x), m_x × m_w
 *   For scalar Brownian increment input the diffusion may be returned as a
 *   1-D vector and we wrap it into a single-column matrix automatically.
 * @param {number[]} x0 - initial state
 * @param {object} options - { T, dt, dW (optional pre-sampled Brownian increments), seed }
 * @returns {{ t: number[], x: number[][] }}
 */
export function eulerMaruyama(drift, diffusion, x0, options = {}) {
  ensureFn(drift, 'EM: drift');
  ensureFn(diffusion, 'EM: diffusion');
  const T = options.T ?? 1;
  const dt = options.dt ?? 1e-3;
  if (!(T > 0 && dt > 0 && dt < T)) throw new Error('EM: invalid T/dt');
  const steps = Math.floor(T / dt);
  const rng = options.rng ?? makeRng(options.seed ?? 42);
  const n = x0.length;
  const sqrtDt = Math.sqrt(dt);
  const t = new Array(steps + 1);
  const x = new Array(steps + 1);
  x[0] = x0.slice();
  t[0] = 0;
  for (let k = 0; k < steps; k++) {
    const xc = x[k];
    const tc = t[k];
    const f = drift(tc, xc);
    let g = diffusion(tc, xc);
    g = ensureMatrix(g, n);
    const m = g[0].length;
    let dW;
    if (options.dW && options.dW[k]) {
      dW = options.dW[k];
    } else {
      dW = new Array(m);
      for (let j = 0; j < m; j++) dW[j] = sqrtDt * rng();
    }
    const xn = new Array(n);
    for (let i = 0; i < n; i++) {
      let acc = xc[i] + f[i] * dt;
      for (let j = 0; j < m; j++) acc += g[i][j] * dW[j];
      xn[i] = acc;
    }
    x[k + 1] = xn;
    t[k + 1] = tc + dt;
  }
  return { t, x };
}

/**
 * Milstein integrator (diagonal-noise case): g[i] depends on x[i] only.
 *
 * @param {(t:number, x:number[]) => number[]} drift
 * @param {(t:number, x:number[]) => number[]} diagDiffusion  - g_i(x)
 * @param {(t:number, x:number[]) => number[]} diagDiffusionPrime - ∂g_i/∂x_i
 */
export function milsteinDiagonal(drift, diagDiffusion, diagDiffusionPrime, x0, options = {}) {
  ensureFn(drift, 'Milstein: drift');
  ensureFn(diagDiffusion, 'Milstein: diagDiffusion');
  ensureFn(diagDiffusionPrime, 'Milstein: diagDiffusionPrime');
  const T = options.T ?? 1;
  const dt = options.dt ?? 1e-3;
  const steps = Math.floor(T / dt);
  const rng = options.rng ?? makeRng(options.seed ?? 42);
  const n = x0.length;
  const sqrtDt = Math.sqrt(dt);
  const t = new Array(steps + 1);
  const x = new Array(steps + 1);
  x[0] = x0.slice(); t[0] = 0;
  for (let k = 0; k < steps; k++) {
    const xc = x[k];
    const tc = t[k];
    const f = drift(tc, xc);
    const g = diagDiffusion(tc, xc);
    const gp = diagDiffusionPrime(tc, xc);
    const dW = new Array(n);
    for (let i = 0; i < n; i++) dW[i] = sqrtDt * rng();
    const xn = new Array(n);
    for (let i = 0; i < n; i++) {
      const corr = 0.5 * g[i] * gp[i] * (dW[i] * dW[i] - dt);
      xn[i] = xc[i] + f[i] * dt + g[i] * dW[i] + corr;
    }
    x[k + 1] = xn;
    t[k + 1] = tc + dt;
  }
  return { t, x };
}

// ── helpers ────────────────────────────────────────────────────────────────

function ensureMatrix(g, n) {
  if (Array.isArray(g) && Array.isArray(g[0])) {
    if (g.length !== n) throw new Error('SDE: diffusion row count must equal n');
    return g;
  }
  if (Array.isArray(g)) {
    if (g.length !== n) throw new Error('SDE: diffusion length must equal n');
    return g.map((v) => [v]);
  }
  throw new Error('SDE: diffusion must return number[] or number[][]');
}

function makeRng(seed) {
  // Minimal Mulberry32 PRNG returning standard normal via Box-Muller.
  let s = seed >>> 0;
  function uniform() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let spare = null;
  return function standardNormal() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u, v, s2;
    do {
      u = 2 * uniform() - 1;
      v = 2 * uniform() - 1;
      s2 = u * u + v * v;
    } while (s2 === 0 || s2 >= 1);
    const factor = Math.sqrt((-2 * Math.log(s2)) / s2);
    spare = v * factor;
    return u * factor;
  };
}
