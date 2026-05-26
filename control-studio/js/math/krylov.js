/**
 * krylov.js - Tier E6: Arnoldi and restarted GMRES baselines.
 */

function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function norm(a) { return Math.sqrt(dot(a, a)); }
function sub(a, b) { return a.map((value, i) => value - b[i]); }
function add(a, b) { return a.map((value, i) => value + b[i]); }
function scale(a, s) { return a.map((value) => value * s); }
function matVec(A, x) { return A.map((row) => dot(row, x)); }

function solveNormal(B, rhs) {
  const n = B[0].length;
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const g = new Array(n).fill(0);
  for (let r = 0; r < B.length; r++) {
    for (let i = 0; i < n; i++) {
      g[i] += B[r][i] * rhs[r];
      for (let j = 0; j < n; j++) G[i][j] += B[r][i] * B[r][j];
    }
  }
  const M = G.map((row, i) => [...row, g[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    const piv = Math.abs(M[i][i]) < 1e-14 ? 1e-14 : M[i][i];
    for (let c = i; c <= n; c++) M[i][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
}

export function arnoldi(A, b, m = 20) {
  const beta = norm(b);
  if (beta === 0) throw new Error('arnoldi requires non-zero b');
  const V = [scale(b, 1 / beta)];
  const H = Array.from({ length: m + 1 }, () => new Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    let w = matVec(A, V[j]);
    for (let i = 0; i <= j; i++) {
      H[i][j] = dot(w, V[i]);
      w = sub(w, scale(V[i], H[i][j]));
    }
    H[j + 1][j] = norm(w);
    if (H[j + 1][j] < 1e-12) break;
    V.push(scale(w, 1 / H[j + 1][j]));
  }
  return { V, H, beta };
}

export function gmres(A, b, { restart = 30, maxIter = 200, tol = 1e-8, x0 = null } = {}) {
  let x = x0 ? x0.slice() : new Array(b.length).fill(0);
  let residual = sub(b, matVec(A, x));
  let resNorm = norm(residual);
  let iter = 0;
  while (resNorm > tol && iter < maxIter) {
    const k = Math.min(restart, maxIter - iter);
    const { V, H, beta } = arnoldi(A, residual, k);
    const rows = Math.min(V.length, k + 1);
    const cols = Math.min(k, V.length - 1);
    const Hk = H.slice(0, rows).map((row) => row.slice(0, cols));
    const e1 = new Array(rows).fill(0);
    e1[0] = beta;
    const y = solveNormal(Hk, e1);
    let dx = new Array(b.length).fill(0);
    for (let j = 0; j < y.length; j++) dx = add(dx, scale(V[j], y[j]));
    x = add(x, dx);
    residual = sub(b, matVec(A, x));
    resNorm = norm(residual);
    iter += cols;
  }
  return { x, residualNorm: resNorm, iter, converged: resNorm <= tol };
}

export default { arnoldi, gmres };
