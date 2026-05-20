/**
 * nmpc.js — Nonlinear Model Predictive Control via Successive Linearization (P24-01)
 *
 * Method: Sequential Linear Quadratic (SLQ / iLQR-lite)
 *   At each sampling instant k:
 *     1. Linearize f(x,u) around current state x[k] and previous u[k-1]
 *        using numerical Jacobians: A_k = ∂f/∂x, B_k = ∂f/∂u
 *     2. Solve a finite-horizon LQR (via backward Riccati recursion) on the
 *        linearised system to obtain the optimal control sequence
 *     3. Apply only the first control u*[k], update the true nonlinear state,
 *        repeat
 *
 * Suitable for: slowly-varying nonlinear systems where the Jacobian does
 * not change drastically within a horizon.
 *
 * Limitations: no constraint handling (use the existing constrainedMPC for
 * that); for fast nonlinearities a full NLP solver is needed.
 */

// ---------------------------------------------------------------------------
// Internal: numerical Jacobian
// ---------------------------------------------------------------------------

/**
 * Compute ∂f/∂x and ∂f/∂u at (x0, u0) using central differences.
 * f: (x[n], u[m]) → x_next[n]
 */
function numericalJacobians(f, x0, u0, h = 1e-5) {
  const n = x0.length;
  const m = u0.length;
  const x0arr = [...x0];
  const u0arr = [...u0];

  // ∂f/∂x  (n×n)
  const Ak = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const xp = [...x0arr]; xp[j] += h;
    const xm = [...x0arr]; xm[j] -= h;
    const fp = f(xp, u0arr);
    const fm = f(xm, u0arr);
    for (let i = 0; i < n; i++) Ak[i][j] = (fp[i] - fm[i]) / (2 * h);
  }

  // ∂f/∂u  (n×m)
  const Bk = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    const up = [...u0arr]; up[j] += h;
    const um = [...u0arr]; um[j] -= h;
    const fp = f(x0arr, up);
    const fm = f(x0arr, um);
    for (let i = 0; i < n; i++) Bk[i][j] = (fp[i] - fm[i]) / (2 * h);
  }

  return { Ak, Bk };
}

// ---------------------------------------------------------------------------
// Internal: finite-horizon LQR via backward Riccati recursion (unconstrained)
// ---------------------------------------------------------------------------

function matMulSq(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) if (A[i][k]) for (let j = 0; j < m; j++) C[i][j] += A[i][k] * B[k][j];
  return C;
}

function matT(A) {
  return Array.from({ length: A[0].length }, (_, j) => A.map(row => row[j]));
}

function matAdd2(A, B) {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

function matScale2(A, s) {
  return A.map(row => row.map(v => v * s));
}

function matSolveSmall(A, b) {
  // Solve A·x = b via Gaussian elimination (small matrices only)
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-14) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col] / piv;
      for (let c = col; c <= n; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  return aug.map((row, i) => Math.abs(row[i]) > 1e-14 ? row[n] / row[i] : 0);
}

function matInvSmall(A) {
  // Invert small square matrix via Gauss-Jordan
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-14) { aug[col][n + col] = 0; continue; }
    for (let j = col; j < 2 * n; j++) aug[col][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let j = col; j < 2 * n; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map(row => row.slice(n));
}

/**
 * Backward Riccati recursion for finite-horizon LQR.
 * Returns optimal first-step gain K0 and feedforward d0.
 *
 * min  Σ_{t=0}^{N-1} (x'Qx + u'Ru) + x_N'Qf x_N
 *
 * @param {number[][]} A  - Linearised A (n×n)
 * @param {number[][]} B  - Linearised B (n×m)
 * @param {number[][]} Q  - State cost (n×n)
 * @param {number[][]} R  - Input cost (m×m)
 * @param {number}     N  - Horizon
 * @param {number[][]} Qf - Terminal cost (n×n, default Q)
 * @returns {{ K: number[][], gains: number[][][] }} K = optimal first-step gain
 */
function backwardRiccati(A, B, Q, R, N, Qf = null) {
  const n = A.length, m = B[0].length;
  const Pf = Qf ?? Q;
  let P = Pf.map(row => [...row]);

  for (let t = N - 1; t >= 0; t--) {
    // S = R + B'PB  (m×m)
    const BtP  = matMulSq(matT(B), P);    // m×n
    const BtPB = matMulSq(BtP, B);        // m×m
    const S    = matAdd2(R, BtPB);
    // K = S⁻¹ B'PA  (m×n)
    const Sinv = matInvSmall(S);
    const BtPA = matMulSq(BtP, A);        // m×n
    const K    = matMulSq(Sinv, BtPA);    // m×n
    // P ← Q + A'PA - K'SK  ← standard discrete Riccati
    const AtP  = matMulSq(matT(A), P);    // n×n
    const AtPA = matMulSq(AtP, A);        // n×n
    const KtSK = matMulSq(matMulSq(matT(K), S), K); // n×n
    P = matAdd2(matAdd2(Q, AtPA), matScale2(KtSK, -1));
    if (t === 0) return { K };
  }
  return { K: Array.from({ length: m }, () => new Array(n).fill(0)) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Simulate NMPC via successive linearization on a discrete nonlinear system.
 *
 * @param {function} f          - Discrete state transition: f(x, u) → x_next
 *                                  x: number[n], u: number[m], returns number[n]
 * @param {number[][]} Q        - State tracking cost (n×n, positive semi-definite)
 * @param {number[][]} R        - Input cost (m×m, positive definite)
 * @param {number}     horizon  - Prediction horizon N
 * @param {number[]}   x0       - Initial state (length n)
 * @param {number}     steps    - Number of closed-loop steps to simulate
 * @param {object}     [opts]
 * @param {number[][]} [opts.Qf]            - Terminal cost (default: Q)
 * @param {number[]|number[][]} [opts.ref]  - Reference state(s) (default: zeros)
 * @param {number[]}   [opts.uPrev]         - Previous control (default: zeros)
 * @param {number}     [opts.jacH=1e-5]     - Jacobian finite-difference step
 * @param {function}   [opts.constraintFn]  - (u) → u_clamped (optional)
 * @returns {{
 *   x:     number[][],  // state trajectory (steps+1 × n)
 *   u:     number[][],  // control sequence (steps × m)
 *   cost:  number[],    // stage cost at each step
 * }}
 */
export function simulateNMPC(f, Q, R, horizon, x0, steps, opts = {}) {
  const n  = x0.length;
  const m  = R.length;
  const Qf = opts.Qf ?? Q;
  const jacH = opts.jacH ?? 1e-5;
  const constraintFn = opts.constraintFn ?? null;

  // Reference: support scalar, array per step, or constant state vector
  function getRef(k) {
    if (!opts.ref) return new Array(n).fill(0);
    if (Array.isArray(opts.ref[0])) return opts.ref[Math.min(k, opts.ref.length - 1)];
    return opts.ref;
  }

  const xTraj = [x0.slice()];
  const uTraj = [];
  const cost  = [];
  let uPrev   = opts.uPrev ?? new Array(m).fill(0);

  for (let k = 0; k < steps; k++) {
    const xk  = xTraj[k];
    const ref = getRef(k);

    // Error state: deviation from reference
    const ex = xk.map((v, i) => v - ref[i]);

    // Linearise at (xk, uPrev)
    const { Ak, Bk } = numericalJacobians(f, xk, uPrev, jacH);

    // Solve finite-horizon LQR on error dynamics
    const { K } = backwardRiccati(Ak, Bk, Q, R, horizon, Qf);

    // Optimal control increment: du = -K·ex
    const du = new Array(m).fill(0);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) du[j] -= K[j][i] * ex[i];
    }
    let uk = uPrev.map((v, j) => v + du[j]);
    if (constraintFn) uk = constraintFn(uk);

    // Simulate true nonlinear dynamics
    const xNext = f(xk, uk);

    // Stage cost
    let stageCost = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) stageCost += ex[i] * Q[i][j] * ex[j];
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) stageCost += uk[i] * R[i][j] * uk[j];

    xTraj.push(xNext);
    uTraj.push(uk);
    cost.push(stageCost);
    uPrev = uk;
  }

  return { x: xTraj, u: uTraj, cost };
}
