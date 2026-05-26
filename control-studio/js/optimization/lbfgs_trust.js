/**
 * lbfgs_trust.js - Tier D5: L-BFGS and trust-region baselines.
 */

function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function norm(a) { return Math.sqrt(dot(a, a)); }
function add(a, b) { return a.map((value, i) => value + b[i]); }
function sub(a, b) { return a.map((value, i) => value - b[i]); }
function scale(a, s) { return a.map((value) => value * s); }
function eye(n) { return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))); }
function matVec(A, x) { return A.map((row) => dot(row, x)); }
function outer(a, b) { return a.map((av) => b.map((bv) => av * bv)); }
function matSub(A, B) { return A.map((row, i) => row.map((value, j) => value - B[i][j])); }
function matAdd(A, B) { return A.map((row, i) => row.map((value, j) => value + B[i][j])); }
function matMul(A, B) {
  return A.map((row) => B[0].map((_, j) => row.reduce((sum, value, k) => sum + value * B[k][j], 0)));
}
function matScale(A, s) { return A.map((row) => row.map((value) => value * s)); }

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
    alpha[i] = pairs[i].rho * dot(pairs[i].s, q);
    for (let j = 0; j < q.length; j++) q[j] -= alpha[i] * pairs[i].y[j];
  }
  let gamma = 1;
  if (pairs.length) {
    const last = pairs[pairs.length - 1];
    gamma = dot(last.s, last.y) / Math.max(1e-12, dot(last.y, last.y));
  }
  let r = scale(q, gamma);
  for (let i = 0; i < pairs.length; i++) {
    const beta = pairs[i].rho * dot(pairs[i].y, r);
    for (let j = 0; j < r.length; j++) r[j] += pairs[i].s[j] * (alpha[i] - beta);
  }
  return scale(r, -1);
}

export function minimizeLBFGS({ f, x0, m = 10, maxIter = 100, tol = 1e-6 } = {}) {
  let x = x0.slice();
  let g = gradient(f, x);
  const pairs = [];
  let Hinv = eye(x.length);
  let iter = 0;
  for (; iter < maxIter && norm(g) > tol; iter++) {
    const p = x.length <= 8 ? scale(matVec(Hinv, g), -1) : (pairs.length ? twoLoop(g, pairs) : scale(g, -1));
    let alpha = 1;
    const f0 = f(x);
    while (alpha > 1e-12 && f(add(x, scale(p, alpha))) > f0 + 1e-4 * alpha * dot(g, p)) alpha *= 0.5;
    const xNext = add(x, scale(p, alpha));
    const gNext = gradient(f, xNext);
    const s = sub(xNext, x);
    const y = sub(gNext, g);
    const sy = dot(s, y);
    if (sy > 1e-10) {
      pairs.push({ s, y, rho: 1 / sy });
      if (pairs.length > m) pairs.shift();
      if (x.length <= 8) {
        const rho = 1 / sy;
        const I = eye(x.length);
        const syT = matScale(outer(s, y), rho);
        const ysT = matScale(outer(y, s), rho);
        const ssT = matScale(outer(s, s), rho);
        Hinv = matAdd(matMul(matMul(matSub(I, syT), Hinv), matSub(I, ysT)), ssT);
      }
    }
    x = xNext;
    g = gNext;
  }
  return { x, fval: f(x), iter, converged: norm(g) <= tol, memoryVectors: pairs.length * 2 };
}

export function trustRegion({ f, x0, maxIter = 80, delta0 = 1, tol = 1e-6 } = {}) {
  let x = x0.slice();
  let delta = delta0;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const g = gradient(f, x);
    const ng = norm(g);
    if (ng < tol) break;
    const d = scale(g, -Math.min(delta / Math.max(ng, 1e-12), 1));
    const f0 = f(x);
    const f1 = f(add(x, d));
    const predicted = -dot(g, d);
    const rho = (f0 - f1) / Math.max(1e-12, predicted);
    if (rho > 0.1) x = add(x, d);
    if (rho > 0.75) delta *= 2;
    else if (rho < 0.25) delta *= 0.25;
  }
  return { x, fval: f(x), iter, delta, converged: iter < maxIter };
}

export default { minimizeLBFGS, trustRegion };
