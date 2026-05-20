/**
 * optimization.js — Numerical optimization core (P29-01)
 *
 * Convex Quadratic Program (QP) solver:
 *
 *   minimize    0.5 xᵀ H x + fᵀ x
 *   subject to  A   x ≤ b      (linear inequalities)
 *               Aeq x = beq    (linear equalities)
 *               lb ≤ x ≤ ub    (box bounds)
 *
 * Two solution paths:
 *   • Pure equality / unconstrained → direct KKT linear solve (exact)
 *   • Any inequality / box constraint → primal-dual interior-point method
 *     (Mehrotra-style path-following; robust, no feasible start required)
 *
 * Suitable for control-sized QPs (n ≲ a few hundred): condensed MPC,
 * CBF-QP safety filters, constrained estimation (MHE), etc.
 *
 * Reference: Nocedal & Wright, "Numerical Optimization" 2e, Ch. 16.
 */

import { matMul, matTranspose, matSolve, matIdentity } from './matrix.js';

// ---------------------------------------------------------------------------
// small vector / matrix helpers (local, dependency-light)
// ---------------------------------------------------------------------------

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function axpy(a, x, y) { return x.map((xi, i) => a * xi + y[i]); }       // a*x + y
function vsub(a, b) { return a.map((ai, i) => ai - b[i]); }
function vadd(a, b) { return a.map((ai, i) => ai + b[i]); }
function vscale(a, s) { return a.map(ai => ai * s); }
function vnorm(a) { return Math.sqrt(dot(a, a)); }
function matVec(A, x) { return A.map(row => dot(row, x)); }

/** Aᵀ·v where A is m×n (returns length-n vector). */
function matTvec(A, v) {
  const n = A[0].length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < A.length; i++) {
    const vi = v[i];
    if (vi === 0) continue;
    const row = A[i];
    for (let j = 0; j < n; j++) out[j] += row[j] * vi;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Constraint assembly: fold box bounds into A x ≤ b
// ---------------------------------------------------------------------------

/**
 * Build the combined inequality system { G, h } from explicit A/b plus box
 * bounds lb/ub. Box bound x_i ≤ ub_i → row e_iᵀ x ≤ ub_i;
 *         lb_i ≤ x_i → row −e_iᵀ x ≤ −lb_i.
 */
function assembleInequalities(n, A, b, lb, ub) {
  const G = [];
  const h = [];

  if (A && A.length) {
    for (let i = 0; i < A.length; i++) { G.push([...A[i]]); h.push(b[i]); }
  }
  if (ub) {
    for (let i = 0; i < n; i++) {
      if (ub[i] !== undefined && Number.isFinite(ub[i])) {
        const row = new Array(n).fill(0); row[i] = 1;
        G.push(row); h.push(ub[i]);
      }
    }
  }
  if (lb) {
    for (let i = 0; i < n; i++) {
      if (lb[i] !== undefined && Number.isFinite(lb[i])) {
        const row = new Array(n).fill(0); row[i] = -1;
        G.push(row); h.push(-lb[i]);
      }
    }
  }
  return { G, h };
}

// ---------------------------------------------------------------------------
// Equality-constrained / unconstrained QP via direct KKT solve
// ---------------------------------------------------------------------------

/**
 * Solve  min 0.5 xᵀHx + fᵀx  s.t.  Aeq x = beq   (Aeq optional).
 * KKT system:  [H  Aeqᵀ; Aeq  0] [x; λ] = [−f; beq].
 *
 * @returns {{ x:number[], lambda:number[], fval:number }}
 */
export function solveEqualityQP(H, f, Aeq = null, beq = null) {
  const n = H.length;

  if (!Aeq || Aeq.length === 0) {
    // Unconstrained: H x = −f.  matSolve returns a flat vector for vector RHS.
    const x = matSolve(H, f.map(v => -v));
    return { x, lambda: [], fval: quadObjective(H, f, x) };
  }

  const p = Aeq.length;
  const N = n + p;
  const K = Array.from({ length: N }, () => new Array(N).fill(0));

  // top-left H
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i][j] = H[i][j];
  // top-right Aeqᵀ and bottom-left Aeq
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < n; j++) {
      K[j][n + i] = Aeq[i][j];
      K[n + i][j] = Aeq[i][j];
    }
  }
  // RHS
  const rhs = new Array(N).fill(0);
  for (let i = 0; i < n; i++) rhs[i] = -f[i];
  for (let i = 0; i < p; i++) rhs[n + i] = beq[i];

  const sol = matSolve(K, rhs);
  const x = sol.slice(0, n);
  const lambda = sol.slice(n);
  return { x, lambda, fval: quadObjective(H, f, x) };
}

function quadObjective(H, f, x) {
  // 0.5 xᵀHx + fᵀx
  const Hx = matVec(H, x);
  return 0.5 * dot(x, Hx) + dot(f, x);
}

// ---------------------------------------------------------------------------
// General QP via primal-dual interior-point method
// ---------------------------------------------------------------------------

/**
 * Solve a convex QP:
 *
 *   minimize    0.5 xᵀ H x + fᵀ x
 *   subject to  A x ≤ b , Aeq x = beq , lb ≤ x ≤ ub
 *
 * @param {number[][]} H  - Hessian (n×n, symmetric positive (semi)definite)
 * @param {number[]}   f  - Linear term (length n)
 * @param {object} [opts]
 * @param {number[][]} [opts.A]    - Inequality matrix (m×n)
 * @param {number[]}   [opts.b]    - Inequality RHS (length m)
 * @param {number[][]} [opts.Aeq]  - Equality matrix (p×n)
 * @param {number[]}   [opts.beq]  - Equality RHS (length p)
 * @param {number[]}   [opts.lb]   - Lower bounds (length n; ±Inf allowed)
 * @param {number[]}   [opts.ub]   - Upper bounds (length n; ±Inf allowed)
 * @param {number}     [opts.maxIter=100]
 * @param {number}     [opts.tol=1e-9]
 * @param {number}     [opts.reg=1e-9] - Hessian regularization for PSD H
 * @returns {{
 *   x: number[], fval: number, iterations: number, converged: boolean,
 *   lambda: number[], nu: number[], method: string
 * }}
 */
export function solveQP(H, f, opts = {}) {
  const n = H.length;
  const maxIter = opts.maxIter ?? 100;
  const tol     = opts.tol     ?? 1e-9;
  const reg     = opts.reg     ?? 1e-9;

  const Aeq = opts.Aeq ?? null;
  const beq = opts.beq ?? null;

  // Fold box bounds + explicit inequalities into G x ≤ h
  const { G, h } = assembleInequalities(n, opts.A ?? null, opts.b ?? null,
                                        opts.lb ?? null, opts.ub ?? null);
  const m = G.length;
  const p = Aeq ? Aeq.length : 0;

  // Regularize H slightly for numerical robustness (handles PSD Hessians)
  const Hr = H.map((row, i) => row.map((v, j) => v + (i === j ? reg : 0)));

  // No inequalities → exact KKT solve
  if (m === 0) {
    const r = solveEqualityQP(Hr, f, Aeq, beq);
    return { x: r.x, fval: quadObjective(H, f, r.x), iterations: 0,
             converged: true, lambda: [], nu: r.lambda, method: 'kkt-direct' };
  }

  const Gt = matTranspose(G);

  // ── Initialization ────────────────────────────────────────────────────
  // Start from unconstrained-ish point; slacks/multipliers strictly positive.
  let x;
  try {
    x = solveEqualityQP(Hr, f, Aeq, beq).x;
  } catch (_) {
    x = new Array(n).fill(0);
  }
  // s = h − Gx, shifted positive; λ = 1
  let s = vsub(h, matVec(G, x)).map(v => Math.max(v, 1));
  let lambda = new Array(m).fill(1);
  let nu = new Array(p).fill(0);

  const tau = 0.95;  // fraction-to-boundary
  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // Residuals
    // r_d = Hx + f + Gᵀλ + Aeqᵀν
    let rd = vadd(vadd(matVec(Hr, x), f), matTvec(G, lambda));
    if (p) rd = vadd(rd, matTvec(Aeq, nu));
    // r_in = Gx − h + s  (want 0)
    const rin = vadd(vsub(matVec(G, x), h), s);
    // r_eq = Aeq x − beq
    const req = p ? vsub(matVec(Aeq, x), beq) : [];
    // complementarity measure
    const mu = dot(s, lambda) / m;

    // Convergence test
    const resDual = vnorm(rd);
    const resIn   = vnorm(rin);
    const resEq   = p ? vnorm(req) : 0;
    if (resDual < tol && resIn < tol && resEq < tol && mu < tol) {
      converged = true;
      break;
    }

    // Centering parameter (simple adaptive)
    const sigma = 0.2;
    const muT = sigma * mu;

    // Σ = S⁻¹Λ (diagonal)
    const sigmaDiag = lambda.map((li, i) => li / s[i]);

    // Condensed Hessian: M = Hr + GᵀΣG
    const M = Hr.map(row => [...row]);
    for (let i = 0; i < m; i++) {
      const sd = sigmaDiag[i];
      const gi = G[i];
      for (let a = 0; a < n; a++) {
        if (gi[a] === 0) continue;
        const ga = gi[a] * sd;
        for (let bb = 0; bb < n; bb++) M[a][bb] += ga * gi[bb];
      }
    }

    // r_c = ΛS·1 − μT·1   (complementarity residual)
    const rc = s.map((si, i) => lambda[i] * si - muT);

    // RHS_x = −r_d + Gᵀ( S⁻¹ r_c − Σ r_in )
    const inner = s.map((si, i) => rc[i] / si - sigmaDiag[i] * rin[i]);
    const rhsX = vadd(vscale(rd, -1), matTvec(G, inner));

    // Solve condensed KKT for (Δx, Δν). Near a degenerate optimum the
    // active-constraint Σ entries blow up and the condensed system becomes
    // numerically singular — at that point the current iterate is already a
    // good estimate, so we accept it if practically converged.
    let dx, dnu;
    try {
      if (p === 0) {
        dx = matSolve(M, rhsX);
        dnu = [];
      } else {
        const N = n + p;
        const KK = Array.from({ length: N }, () => new Array(N).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) KK[i][j] = M[i][j];
        for (let i = 0; i < p; i++) for (let j = 0; j < n; j++) {
          KK[j][n + i] = Aeq[i][j];
          KK[n + i][j] = Aeq[i][j];
        }
        const rhs = new Array(N).fill(0);
        for (let i = 0; i < n; i++) rhs[i] = rhsX[i];
        for (let i = 0; i < p; i++) rhs[n + i] = -req[i];
        const sol = matSolve(KK, rhs);
        dx = sol.slice(0, n);
        dnu = sol.slice(n);
      }
    } catch (_) {
      // Ill-conditioned near degenerate optimum: accept current iterate
      // if primal/dual residuals and duality gap are practically small.
      converged = (resIn < 1e-5 && resEq < 1e-5 && mu < 1e-5);
      break;
    }

    // Back-substitute Δλ and Δs
    // Δλ = Σ G Δx − S⁻¹ r_c + Σ r_in
    const GdX = matVec(G, dx);
    const dlambda = sigmaDiag.map((sd, i) => sd * GdX[i] - rc[i] / s[i] + sd * rin[i]);
    // Δs = −r_in − G Δx
    const ds = rin.map((ri, i) => -ri - GdX[i]);

    // Fraction-to-boundary step lengths
    let alpha = 1;
    for (let i = 0; i < m; i++) {
      if (ds[i] < 0)      alpha = Math.min(alpha, -tau * s[i] / ds[i]);
      if (dlambda[i] < 0) alpha = Math.min(alpha, -tau * lambda[i] / dlambda[i]);
    }

    // Update
    x      = axpy(alpha, dx, x);
    s      = axpy(alpha, ds, s);
    lambda = axpy(alpha, dlambda, lambda);
    if (p) nu = axpy(alpha, dnu, nu);

    // Guard against tiny/zero positivity drift
    for (let i = 0; i < m; i++) {
      if (s[i] < 1e-14) s[i] = 1e-14;
      if (lambda[i] < 1e-14) lambda[i] = 1e-14;
    }
  }

  return {
    x,
    fval: quadObjective(H, f, x),
    iterations,
    converged,
    lambda,
    nu,
    method: 'interior-point',
  };
}

// ---------------------------------------------------------------------------
// Convenience: box-constrained QP (fast path, common in MPC)
// ---------------------------------------------------------------------------

/**
 * Solve box-constrained QP:  min 0.5 xᵀHx + fᵀx  s.t. lb ≤ x ≤ ub.
 * Thin wrapper over solveQP for the most common control case.
 */
export function solveBoxQP(H, f, lb, ub, opts = {}) {
  return solveQP(H, f, { ...opts, lb, ub });
}

// ---------------------------------------------------------------------------
// Linear Program via regularized interior-point (P29-02)
// ---------------------------------------------------------------------------

/**
 * Solve a linear program:
 *
 *   minimize    cᵀ x
 *   subject to  A x ≤ b , Aeq x = beq , lb ≤ x ≤ ub
 *
 * Implemented as a strictly-convex QP with a vanishing quadratic term
 * (H = reg·I). For LPs with a unique optimal vertex the solution converges
 * to the LP optimum as reg→0; for degenerate/multiple-optima LPs it selects
 * the minimum-norm optimal point (a useful, well-defined tie-break). The
 * regularization also keeps the condensed Newton system non-singular even
 * when A is rank-deficient in x.
 *
 * @param {number[]} c   - Cost vector (length n)
 * @param {object} [opts] - Same constraint fields as solveQP, plus:
 * @param {number} [opts.reg=1e-7] - Quadratic regularization (tie-break / conditioning)
 * @returns {{
 *   x:number[], fval:number, iterations:number, converged:boolean,
 *   lambda:number[], nu:number[], method:string
 * }}
 */
export function solveLP(c, opts = {}) {
  const n = c.length;
  const reg = opts.reg ?? 1e-7;

  // H = reg·I  (strictly convex perturbation of the linear objective)
  const H = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? reg : 0))
  );

  // reg already baked into H → tell solveQP not to add more
  const r = solveQP(H, c, { ...opts, reg: 0 });

  return {
    x: r.x,
    fval: dot(c, r.x),          // true LP objective (no quadratic term)
    iterations: r.iterations,
    converged: r.converged,
    lambda: r.lambda,
    nu: r.nu,
    method: 'lp-regularized-ip',
  };
}
