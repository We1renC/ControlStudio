/**
 * sqp.js - Tier D3: SQP / multiple-shooting baseline.
 */

function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function norm(a) { return Math.sqrt(dot(a, a)); }
function add(a, b) { return a.map((value, i) => value + b[i]); }
function sub(a, b) { return a.map((value, i) => value - b[i]); }
function scale(a, s) { return a.map((value) => value * s); }

function gradient(fn, x, eps = 1e-6) {
  return x.map((_, i) => {
    const xp = x.slice();
    const xm = x.slice();
    xp[i] += eps;
    xm[i] -= eps;
    return (fn(xp) - fn(xm)) / (2 * eps);
  });
}

function twoLoop(g, pairs) {
  const q = g.slice();
  const alpha = [];
  for (let i = pairs.length - 1; i >= 0; i--) {
    const { s, y, rho } = pairs[i];
    alpha[i] = rho * dot(s, q);
    for (let j = 0; j < q.length; j++) q[j] -= alpha[i] * y[j];
  }
  let gamma = 1;
  if (pairs.length) {
    const last = pairs[pairs.length - 1];
    gamma = dot(last.s, last.y) / Math.max(1e-12, dot(last.y, last.y));
  }
  let r = scale(q, gamma);
  for (let i = 0; i < pairs.length; i++) {
    const { s, y, rho } = pairs[i];
    const beta = rho * dot(y, r);
    for (let j = 0; j < r.length; j++) r[j] += s[j] * (alpha[i] - beta);
  }
  return scale(r, -1);
}

export function solveSQP({ objective, x0, constraints = [], maxIter = 80, tol = 1e-6 } = {}) {
  if (!objective || !x0) throw new Error('solveSQP requires objective and x0');
  let x = x0.slice();
  const pairs = [];
  const penalty = (z) => constraints.reduce((sum, c) => {
    const value = c(z);
    return sum + Math.max(0, value) ** 2 * 1e3;
  }, 0);
  const merit = (z) => objective(z) + penalty(z);
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const g = gradient(merit, x);
    if (norm(g) < tol) break;
    const p = pairs.length ? twoLoop(g, pairs) : scale(g, -1);
    let alpha = 1;
    const f0 = merit(x);
    while (alpha > 1e-6 && merit(add(x, scale(p, alpha))) > f0 - 1e-4 * alpha * dot(g, p)) alpha *= 0.5;
    const xNext = add(x, scale(p, alpha));
    const gNext = gradient(merit, xNext);
    const s = sub(xNext, x);
    const y = sub(gNext, g);
    const sy = dot(s, y);
    if (sy > 1e-10) {
      pairs.push({ s, y, rho: 1 / sy });
      if (pairs.length > 8) pairs.shift();
    }
    x = xNext;
  }
  return { x, fval: objective(x), iter, converged: iter < maxIter, method: 'sqp-lbfgs-merit' };
}

export function multipleShooting({ dynamics, x0, controls, dt = 1 }) {
  const states = [x0.slice()];
  let x = x0.slice();
  for (const u of controls) {
    x = dynamics(x, u, dt);
    states.push(x.slice());
  }
  const continuityResidual = states.slice(1).map((state, i) => {
    const expected = dynamics(states[i], controls[i], dt);
    return state.map((value, j) => value - expected[j]);
  });
  return { states, continuityResidual };
}

export default { solveSQP, multipleShooting };
