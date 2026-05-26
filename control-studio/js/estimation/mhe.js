/**
 * mhe.js - Tier C1: Moving Horizon Estimation API wrapper.
 */

import { movingHorizonEstimation } from '../control/estimation.js';

function clampState(x, constraints = {}) {
  return x.map((value, i) => {
    let out = value;
    if (constraints.xMin) out = Math.max(out, constraints.xMin[i]);
    if (constraints.xMax) out = Math.min(out, constraints.xMax[i]);
    return out;
  });
}

function scoreTrajectory(x0, plant, yWindow, uWindow, arrival, constraints) {
  let x = clampState([x0], constraints);
  let cost = arrival == null ? 0 : 0.05 * (x0 - arrival) ** 2;
  const states = [];
  const residuals = [];
  for (let k = 0; k < yWindow.length; k++) {
    const yhat = plant.h(x, uWindow[k] ?? [0]);
    const res = yWindow[k].map((value, i) => value - yhat[i]);
    residuals.push(res);
    cost += res.reduce((sum, value) => sum + value * value, 0);
    states.push([...x]);
    if (k < yWindow.length - 1) x = clampState(plant.f(x, uWindow[k] ?? [0]), constraints);
  }
  return { cost, x, states, residuals };
}

function nonlinearGridMHE(config) {
  const { plant, horizon, constraints = {} } = config;
  const yBuf = [];
  const uBuf = [];
  let xHat = config.x0 ? [...config.x0] : [0];

  return {
    step(y, u = [0]) {
      yBuf.push([...y]);
      uBuf.push([...u]);
      if (yBuf.length > horizon) { yBuf.shift(); uBuf.shift(); }

      const center = xHat[0];
      const span = config.searchSpan ?? 4;
      const min = constraints.xMin?.[0] ?? center - span;
      const max = constraints.xMax?.[0] ?? center + span;
      let best = null;
      for (let i = 0; i <= 160; i++) {
        const x0 = min + (max - min) * i / 160;
        const candidate = scoreTrajectory(x0, plant, yBuf, uBuf, center, constraints);
        if (!best || candidate.cost < best.cost) best = { ...candidate, x0 };
      }
      xHat = [...best.x];
      const yhat = plant.h(xHat, u);
      return {
        x_hat: [...xHat],
        w_seq: new Array(Math.max(0, yBuf.length - 1)).fill([0]),
        v_seq: y.map((value, i) => value - yhat[i]),
        residuals: best.residuals,
      };
    },
    get state() { return { x_hat: [...xHat], horizon }; },
  };
}

export function designMHE({ plant, horizon = 10, Q, R, P0, constraints = {} } = {}) {
  if (!plant) throw new Error('designMHE requires a plant');
  if (plant.A && plant.B && plant.C) {
    const core = movingHorizonEstimation(plant.A, plant.B, plant.C, {
      horizon,
      Q,
      R,
      P0,
      xMin: constraints.xMin,
      xMax: constraints.xMax,
    });
    return {
      step(yWindow, uWindow = [[0]]) {
        const ys = Array.isArray(yWindow[0]) ? yWindow : [yWindow];
        const us = Array.isArray(uWindow[0]) ? uWindow : [uWindow];
        let result = null;
        for (let i = 0; i < ys.length; i++) result = core.update(ys[i], us[i] ?? us[us.length - 1] ?? [0]);
        const lastResidual = result.residuals[result.residuals.length - 1] ?? [];
        return { x_hat: result.xEst, w_seq: [], v_seq: lastResidual, residuals: result.residuals };
      },
      get state() { return { x_hat: core.state.xEst, horizon }; },
      reset(x0) { core.reset(x0); },
    };
  }
  if (typeof plant.f === 'function' && typeof plant.h === 'function') {
    return nonlinearGridMHE({ plant, horizon, constraints, x0: plant.x0, searchSpan: plant.searchSpan });
  }
  throw new Error('designMHE requires either linear {A,B,C} or nonlinear {f,h} plant');
}

export function stepMHE(mhe, y_window, u_window) {
  return mhe.step(y_window, u_window);
}

export default { designMHE, stepMHE };
