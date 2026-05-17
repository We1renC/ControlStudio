/**
 * ode.js — ODE solvers for time-domain simulation
 * Provides RK4 fixed-step and RK45 adaptive-step integrators.
 */

/**
 * RK4 fixed-step solver.
 * @param {Function} f - Derivative function f(t, y) → dy/dt (array)
 * @param {number[]} y0 - Initial state vector
 * @param {number} t0 - Start time
 * @param {number} tEnd - End time
 * @param {number} dt - Step size
 * @returns {{ t: number[], y: number[][] }} - Time points and state history
 */
export function rk4(f, y0, t0, tEnd, dt) {
  const tArr = [t0];
  const yArr = [y0.slice()];
  let t = t0;
  let y = y0.slice();
  const n = y0.length;

  while (t < tEnd - dt * 0.01) {
    const h = Math.min(dt, tEnd - t);
    const k1 = f(t, y);
    const k2 = f(t + h / 2, y.map((v, i) => v + h / 2 * k1[i]));
    const k3 = f(t + h / 2, y.map((v, i) => v + h / 2 * k2[i]));
    const k4 = f(t + h, y.map((v, i) => v + h * k3[i]));

    for (let i = 0; i < n; i++) {
      y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    t += h;
    tArr.push(t);
    yArr.push(y.slice());
  }

  return { t: tArr, y: yArr };
}

/**
 * RK45 (Dormand-Prince) adaptive step solver.
 * @param {Function} f - f(t, y) → dy/dt
 * @param {number[]} y0 - Initial state
 * @param {number} t0 - Start time
 * @param {number} tEnd - End time
 * @param {object} opts - { rtol, atol, maxStep, minStep }
 */
export function rk45(f, y0, t0, tEnd, opts = {}) {
  const rtol = opts.rtol || 1e-6;
  const atol = opts.atol || 1e-9;
  const maxStep = opts.maxStep || (tEnd - t0) / 10;
  const minStep = opts.minStep || 1e-12;

  // Dormand-Prince coefficients
  const a = [0, 1/5, 3/10, 4/5, 8/9, 1, 1];
  const b = [
    [],
    [1/5],
    [3/40, 9/40],
    [44/45, -56/15, 32/9],
    [19372/6561, -25360/2187, 64448/6561, -212/729],
    [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
    [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84, 0]
  ];
  const e = [71/57600, 0, -71/16695, 71/1920, -17253/339200, 22/525, -1/40];

  const tArr = [t0];
  const yArr = [y0.slice()];
  let t = t0, y = y0.slice();
  let h = Math.min(maxStep, (tEnd - t0) / 100);
  const n = y0.length;
  let guard = 0;
  const maxAcceptedOrRejectedSteps = opts.maxSteps || 100000;

  while (t < tEnd - 1e-14) {
    guard++;
    if (guard > maxAcceptedOrRejectedSteps) {
      throw new Error('rk45 exceeded maximum step count');
    }
    h = Math.min(h, tEnd - t);
    const k = [f(t, y)];

    for (let s = 1; s <= 6; s++) {
      const ys = y.slice();
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < s; j++) sum += b[s][j] * k[j][i];
        ys[i] = y[i] + h * sum;
      }
      k.push(f(t + a[s] * h, ys));
    }

    // Error estimate
    let errMax = 0;
    const yNew = y.slice();
    for (let i = 0; i < n; i++) {
      yNew[i] = y[i];
      for (let j = 0; j < 7; j++) yNew[i] += h * b[6][j] * k[j][i];
      let errI = 0;
      for (let j = 0; j < 7; j++) errI += h * e[j] * k[j][i];
      const scale = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
      errMax = Math.max(errMax, Math.abs(errI) / scale);
    }
    if (!Number.isFinite(errMax) || yNew.some((value) => !Number.isFinite(value))) {
      throw new Error('rk45 produced non-finite integration state');
    }

    if (errMax <= 1) {
      t += h;
      y = yNew;
      tArr.push(t);
      yArr.push(y.slice());
      h = Math.min(maxStep, h * Math.min(5, 0.9 * Math.pow(errMax, -0.2)));
    } else {
      h = Math.max(minStep, h * Math.max(0.1, 0.9 * Math.pow(errMax, -0.25)));
    }

    if (h < minStep) { h = minStep; }
  }

  return { t: tArr, y: yArr };
}

/**
 * Linear interpolation of ODE output at uniform time points.
 */
export function interpolateUniform(sol, nPoints) {
  const { t, y } = sol;
  const tMin = t[0], tMax = t[t.length - 1];
  const dt = (tMax - tMin) / (nPoints - 1);
  const tUniform = [], yUniform = [];
  let idx = 0;

  for (let i = 0; i < nPoints; i++) {
    const ti = tMin + i * dt;
    while (idx < t.length - 2 && t[idx + 1] < ti) idx++;
    const frac = (t[idx + 1] - t[idx]) < 1e-30 ? 0 : (ti - t[idx]) / (t[idx + 1] - t[idx]);
    const yi = y[idx].map((v, k) => v + frac * (y[idx + 1][k] - v));
    tUniform.push(ti);
    yUniform.push(yi);
  }

  return { t: tUniform, y: yUniform };
}
