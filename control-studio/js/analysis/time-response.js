/**
 * time-response.js — Stable time-domain analysis using RK4
 */

function responseInput(type, t) {
  if (type === 'ramp') return t;
  return type === 'step' ? 1.0 : 0.0;
}

function initialStateForInput(order, type) {
  if (type !== 'impulse') return new Array(order).fill(0);
  const x = new Array(order).fill(0);
  if (order > 0) x[order - 1] = 1;
  return x;
}

export function simulateTimeResponse(sys, type = 'step', duration = null) {
  // 1. Convert TF to State-Space (Controllable Canonical Form)
  const n = sys.den.length - 1;
  const num = sys.num;
  const den = sys.den; // den[0] is 1

  // 2. Estimate Duration
  let tEnd = duration;
  if (!tEnd) {
    const poles = sys.poles();
    const realParts = poles.map(p => Math.abs(p.re)).filter(re => re > 1e-6);
    const minReal = realParts.length > 0 ? Math.min(...realParts) : 0.1;
    tEnd = Math.max(5, 7 / minReal);
    if (tEnd > 100) tEnd = 100;
    if (poles.some(p => p.re > 0.01)) tEnd = 5; // For unstable systems
  }

  const nPoints = 1000;
  const dt = tEnd / (nPoints - 1);
  const tArr = [];
  const yArr = [];

  // State-Space: x' = Ax + Bu; y = Cx + Du
  // Controllable Canonical Form
  const x = initialStateForInput(n, type);

  const getDx = (state, u) => {
    const dx = new Array(n).fill(0);
    // x1' = x2, x2' = x3...
    for (let i = 0; i < n - 1; i++) dx[i] = state[i+1];
    // xn' = -a_n*x1 - a_{n-1}*x2 ... + u
    let lastDx = u;
    for (let i = 0; i < n; i++) {
      lastDx -= den[n - i] * state[i];
    }
    dx[n - 1] = lastDx;
    return dx;
  };

  const getOutput = (state, u) => {
    // y = b_n*x1 + b_{n-1}*x2 ... + b0*u (if n=m)
    let y = 0;
    const paddedNum = new Array(n + 1).fill(0);
    for (let i = 0; i < num.length; i++) {
      paddedNum[n - (num.length - 1) + i] = num[i];
    }

    const D = paddedNum[0];
    y = D * u;
    for (let i = 0; i < n; i++) {
      y += (paddedNum[n - i] - D * den[n - i]) * state[i];
    }
    return y;
  };

  let curX = [...x];
  for (let i = 0; i < nPoints; i++) {
    const u = responseInput(type, i * dt);
    tArr.push(i * dt);
    const curY = getOutput(curX, u);
    yArr.push(curY);

    // RK4 Integration step
    const k1 = getDx(curX, u);
    const k2 = getDx(curX.map((v, j) => v + k1[j] * dt / 2), u);
    const k3 = getDx(curX.map((v, j) => v + k2[j] * dt / 2), u);
    const k4 = getDx(curX.map((v, j) => v + k3[j] * dt), u);

    for (let j = 0; j < n; j++) {
      curX[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    }

    if (Math.abs(curY) > 1e12) break; // Safety cutoff
  }

  return { t: tArr, y: yArr };
}

export function stepResponse(sys, duration = null) {
  return simulateTimeResponse(sys, 'step', duration);
}

export function impulseResponse(sys, duration = null) {
  return simulateTimeResponse(sys, 'impulse', duration);
}

export function rampResponse(sys, duration = null) {
  return simulateTimeResponse(sys, 'ramp', duration);
}
