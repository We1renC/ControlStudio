/**
 * ilqr.js — iterative LQR / Differential Dynamic Programming (DDP).
 *
 * Loop 12 (Zero-Flaw) addition. Tassa-Erez-Todorov 2012 nonlinear trajectory
 * optimisation. Complements existing NMPC, flatness, and computed-torque
 * tools by providing the optimal-control workhorse for general nonlinear
 * dynamics.
 *
 * Problem (discrete-time):
 *   minimise  ℓ_f(x_N) + Σ_{k=0}^{N-1} ℓ(x_k, u_k)
 *   subject to  x_{k+1} = f(x_k, u_k),   x_0 given
 *
 * iLQR algorithm:
 *   1. Forward roll-out of nominal (x̄, ū).
 *   2. Backward Riccati-like recursion on linearised dynamics around the
 *      nominal trajectory, producing feedback gains K_k and feed-forward
 *      corrections k_k.
 *   3. Forward line-search using α ∈ (0, 1]:
 *        u_k ← ū_k + α k_k + K_k (x_k − x̄_k)
 *   4. Iterate until ‖k‖ shrinks below tolerance.
 *
 * DDP differs from iLQR by including second-order dynamics derivatives in
 * the Q-function expansion; this implementation provides the first-order
 * (iLQR) variant which is sufficient for most engineering verification.
 *
 * Reference:
 *   - Tassa, Erez, Todorov, "Synthesis and stabilization of complex
 *     behaviors through online trajectory optimization", IROS 2012.
 *   - Jacobson, Mayne, "Differential Dynamic Programming", Elsevier 1970.
 *   - Li, Todorov, "Iterative linear quadratic regulator design for
 *     nonlinear biological movement systems", ICINCO 2004.
 */

import {
  matCreate, matAdd, matSub, matMul, matInverse, matTranspose, matIdentity,
  matVecMul,
} from '../math/matrix.js';

function numericalJacobian(f, x, eps = 1e-5) {
  const baseline = f(x);
  const n = baseline.length;
  const m = x.length;
  const J = matCreate(n, m, 0);
  for (let j = 0; j < m; j++) {
    const xp = x.slice(); xp[j] += eps;
    const xm = x.slice(); xm[j] -= eps;
    const fp = f(xp);
    const fm = f(xm);
    for (let i = 0; i < n; i++) J[i][j] = (fp[i] - fm[i]) / (2 * eps);
  }
  return J;
}

/**
 * Solve the discrete iLQR problem.
 *
 * @param {object} dynamics - { f(x,u)->x_next, n, m }
 * @param {object} cost - { stage(x,u)->scalar, terminal(x)->scalar }
 * @param {number[]} x0 - initial state
 * @param {number[][]} uInit - N × m initial input trajectory
 * @param {object} options - { iterations, regularisation, lineSearchSteps }
 * @returns { x, u, costHistory, gains, feedforward }
 */
export function ilqrSolve(dynamics, cost, x0, uInit, options = {}) {
  const iterations = options.iterations ?? 30;
  const reg = options.regularisation ?? 1e-3;
  const lsAlphas = options.lineSearchAlphas ?? [1, 0.5, 0.25, 0.125, 0.0625];
  const tol = options.tol ?? 1e-7;
  const n = x0.length;
  const N = uInit.length;
  const m = uInit[0].length;

  let u = uInit.map((row) => row.slice());
  let x = rollout(dynamics.f, x0, u);
  let prevCost = trajectoryCost(cost, x, u);
  const costHistory = [prevCost];

  let K = null, k = null;
  for (let it = 0; it < iterations; it++) {
    // Backward pass: compute Q-function expansion at each timestep.
    const fxList = new Array(N), fuList = new Array(N);
    const lxList = new Array(N), luList = new Array(N);
    const lxxList = new Array(N), luuList = new Array(N), luxList = new Array(N);
    for (let i = 0; i < N; i++) {
      const xi = x[i], ui = u[i];
      fxList[i] = numericalJacobian((xx) => dynamics.f(xx, ui), xi);
      fuList[i] = numericalJacobian((uu) => dynamics.f(xi, uu), ui);
      const stageX = numericalJacobian((xx) => [cost.stage(xx, ui)], xi);
      const stageU = numericalJacobian((uu) => [cost.stage(xi, uu)], ui);
      lxList[i] = stageX[0];
      luList[i] = stageU[0];
      // Hessians via finite differences of the gradient
      lxxList[i] = numericalHessian((xx) => cost.stage(xx, ui), xi);
      luuList[i] = numericalHessian((uu) => cost.stage(xi, uu), ui);
      luxList[i] = numericalCrossHessian(cost.stage, xi, ui);
    }
    // Terminal cost gradient/Hessian
    let Vx = numericalJacobian((xx) => [cost.terminal(xx)], x[N])[0];
    let Vxx = numericalHessian(cost.terminal, x[N]);

    K = new Array(N);
    k = new Array(N);
    let backwardOK = true;
    for (let i = N - 1; i >= 0 && backwardOK; i--) {
      const fx = fxList[i], fu = fuList[i];
      const lx = lxList[i], lu = luList[i];
      const lxx = lxxList[i], luu = luuList[i], lux = luxList[i];

      // Q-derivatives
      const Qx = vecAdd(lx, matVecMul(matTranspose(fx), Vx));
      const Qu = vecAdd(lu, matVecMul(matTranspose(fu), Vx));
      const Qxx = matAdd(lxx, matMul(matMul(matTranspose(fx), Vxx), fx));
      const Quu = matAdd(luu, matMul(matMul(matTranspose(fu), Vxx), fu));
      const Qux = matAdd(lux, matMul(matMul(matTranspose(fu), Vxx), fx));

      // Regularised Quu
      const Quuregged = matCreate(Quu.length, Quu.length, 0);
      for (let r = 0; r < Quu.length; r++) {
        for (let c = 0; c < Quu.length; c++) {
          Quuregged[r][c] = Quu[r][c];
        }
        Quuregged[r][r] += reg;
      }
      let QuuInv;
      try { QuuInv = matInverse(Quuregged); }
      catch (e) { backwardOK = false; break; }

      const ki = matVecMul(QuuInv, Qu).map((v) => -v);
      const Ki = scaleMatrix(matMul(QuuInv, Qux), -1);
      k[i] = ki;
      K[i] = Ki;

      // Standard iLQR value-function update (Tassa-Erez-Todorov 2012 eq. 5):
      //   V'_x  = Q_x  + K^T Q_uu k + K^T Q_u + Q_ux^T k
      //   V'_xx = Q_xx + K^T Q_uu K + K^T Q_ux + Q_ux^T K
      const QuxT = matTranspose(Qux);
      const KT = matTranspose(Ki);
      const Quuki = matVecMul(Quu, ki);
      Vx = vecAdd(Qx,
            vecAdd(matVecMul(QuxT, ki),
              vecAdd(matVecMul(KT, Quuki), matVecMul(KT, Qu))));
      const KTQuu = matMul(KT, Quu);
      const KTQuuK = matMul(KTQuu, Ki);
      const KTQux = matMul(KT, Qux);
      const QuxTK = matMul(QuxT, Ki);
      Vxx = matAdd(Qxx, matAdd(KTQuuK, matAdd(KTQux, QuxTK)));
      Vxx = symmetrise(Vxx);
    }
    if (!backwardOK) break;

    // Forward line search
    let accepted = false;
    let newCost = prevCost;
    let newU = u, newX = x;
    for (const alpha of lsAlphas) {
      const candU = new Array(N);
      const candX = new Array(N + 1);
      candX[0] = x0.slice();
      for (let i = 0; i < N; i++) {
        const dx = vecSub(candX[i], x[i]);
        const du = vecAdd(u[i], vecAdd(scaleVec(k[i], alpha), matVecMul(K[i], dx)));
        candU[i] = du;
        candX[i + 1] = dynamics.f(candX[i], du);
      }
      const cCost = trajectoryCost(cost, candX, candU);
      if (cCost < prevCost - 1e-12) {
        newCost = cCost;
        newU = candU;
        newX = candX;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
    u = newU;
    x = newX;
    costHistory.push(newCost);
    if (Math.abs(prevCost - newCost) < tol) { prevCost = newCost; break; }
    prevCost = newCost;
  }
  return { x, u, costHistory, gains: K, feedforward: k };
}

// ── helpers ────────────────────────────────────────────────────────────────

function rollout(f, x0, u) {
  const N = u.length;
  const x = new Array(N + 1);
  x[0] = x0.slice();
  for (let i = 0; i < N; i++) x[i + 1] = f(x[i], u[i]);
  return x;
}

function trajectoryCost(cost, x, u) {
  let total = cost.terminal(x[x.length - 1]);
  for (let i = 0; i < u.length; i++) total += cost.stage(x[i], u[i]);
  return total;
}

function vecAdd(a, b) { return a.map((v, i) => v + b[i]); }
function vecSub(a, b) { return a.map((v, i) => v - b[i]); }
function scaleVec(v, s) { return v.map((x) => x * s); }
function scaleMatrix(M, s) { return M.map((row) => row.map((v) => v * s)); }
function symmetrise(M) { return M.map((row, i) => row.map((v, j) => 0.5 * (v + M[j][i]))); }

function numericalHessian(f, x, eps = 1e-4) {
  const n = x.length;
  const H = matCreate(n, n, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const xpp = x.slice(); xpp[i] += eps; xpp[j] += eps;
      const xpm = x.slice(); xpm[i] += eps; xpm[j] -= eps;
      const xmp = x.slice(); xmp[i] -= eps; xmp[j] += eps;
      const xmm = x.slice(); xmm[i] -= eps; xmm[j] -= eps;
      H[i][j] = (f(xpp) - f(xpm) - f(xmp) + f(xmm)) / (4 * eps * eps);
    }
  }
  return H;
}

function numericalCrossHessian(f, x, u, eps = 1e-4) {
  const n = x.length, m = u.length;
  const H = matCreate(m, n, 0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const upp = u.slice(); upp[i] += eps;
      const upm = u.slice(); upm[i] -= eps;
      const xpp = x.slice(); xpp[j] += eps;
      const xpm = x.slice(); xpm[j] -= eps;
      H[i][j] = (f(xpp, upp) - f(xpm, upp) - f(xpp, upm) + f(xpm, upm)) / (4 * eps * eps);
    }
  }
  return H;
}
