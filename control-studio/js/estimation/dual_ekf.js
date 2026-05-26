/**
 * dual_ekf.js - Tier C3: joint state-parameter EKF.
 */

import { matAdd, matIdentity, matInverse, matMul, matSub, matTranspose, matVecMul } from '../math/matrix.js';

function diag(values) {
  return values.map((value, i) => values.map((_, j) => (i === j ? value : 0)));
}

function numericJacobian(fn, z, eps = 1e-5) {
  const base = fn(z);
  return base.map((_, r) => z.map((__, c) => {
    const zp = z.slice();
    const zm = z.slice();
    zp[c] += eps;
    zm[c] -= eps;
    return (fn(zp)[r] - fn(zm)[r]) / (2 * eps);
  }));
}

function rank2(A, tol = 1e-9) {
  const M = A.map((row) => row.slice());
  let rank = 0;
  for (let c = 0; c < M[0].length; c++) {
    if (rank >= M.length) break;
    let pivot = rank;
    for (let r = rank + 1; r < M.length; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    if (Math.abs(M[pivot][c]) <= tol) continue;
    [M[rank], M[pivot]] = [M[pivot], M[rank]];
    const p = M[rank][c];
    for (let j = c; j < M[0].length; j++) M[rank][j] /= p;
    for (let r = 0; r < M.length; r++) {
      if (r === rank) continue;
      const f = M[r][c];
      for (let j = c; j < M[0].length; j++) M[r][j] -= f * M[rank][j];
    }
    rank++;
  }
  return rank;
}

export function designDualEKF({ f, h, x0, theta0, θ0, Q_x, Q_theta, Q_θ, R, dt = 1 } = {}) {
  const thetaInit = theta0 ?? θ0;
  if (!f || !h || !x0 || !thetaInit) throw new Error('designDualEKF requires f, h, x0, and theta0');
  let x = x0.slice();
  let theta = thetaInit.slice();
  const nx = x.length;
  const nt = theta.length;
  let P = matIdentity(nx + nt);
  const Q = diag([...(Q_x ?? new Array(nx).fill(1e-4)), ...(Q_theta ?? Q_θ ?? new Array(nt).fill(1e-5))]);
  const Rm = diag(R ?? new Array(h(x, theta).length).fill(1e-2));

  return {
    step(u, y) {
      const z = [...x, ...theta];
      const dyn = (zz) => {
        const xs = zz.slice(0, nx);
        const ts = zz.slice(nx);
        return [...f(xs, u, ts, dt), ...ts];
      };
      const meas = (zz) => h(zz.slice(0, nx), zz.slice(nx), u);
      const zPred = dyn(z);
      const F = numericJacobian(dyn, z);
      const H = numericJacobian(meas, zPred);
      const PPred = matAdd(matMul(matMul(F, P), matTranspose(F)), Q);
      const innovation = y.map((value, i) => value - meas(zPred)[i]);
      const S = matAdd(matMul(matMul(H, PPred), matTranspose(H)), Rm);
      const K = matMul(matMul(PPred, matTranspose(H)), matInverse(S));
      const dz = matVecMul(K, innovation);
      const zNext = zPred.map((value, i) => value + dz[i]);
      const I = matIdentity(z.length);
      P = matMul(matSub(I, matMul(K, H)), PPred);
      x = zNext.slice(0, nx);
      theta = zNext.slice(nx);
      const observabilityRank = rank2(H);
      return {
        x_hat: x.slice(),
        theta_hat: theta.slice(),
        θ_hat: theta.slice(),
        P,
        warning: observabilityRank < Math.min(H[0].length, H.length) ? 'rank deficient measurement Jacobian' : null,
      };
    },
    get state() { return { x_hat: x.slice(), theta_hat: theta.slice(), P }; },
  };
}

export function stepDualEKF(d, u, y) {
  return d.step(u, y);
}

export default { designDualEKF, stepDualEKF };
