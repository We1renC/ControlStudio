/**
 * time-response.js — Stable time-domain analysis using RK4
 */

function normalizeOptions(durationOrOptions) {
  if (durationOrOptions == null) {
    return {
      duration: null,
      sampleCount: 1000,
      amplitude: 1,
      disturbanceAmplitude: 0,
      disturbanceStart: 0,
      initialState: null,
    };
  }
  if (typeof durationOrOptions === 'number') {
    return normalizeOptions({ duration: durationOrOptions });
  }
  return {
    duration: durationOrOptions.duration ?? null,
    sampleCount: Math.max(10, Math.floor(durationOrOptions.sampleCount ?? 1000)),
    amplitude: Number(durationOrOptions.amplitude ?? 1),
    frequency: Math.max(0.01, Number(durationOrOptions.frequency ?? 1)),
    pulseWidth: Math.max(0.01, Number(durationOrOptions.pulseWidth ?? 1)),
    disturbanceAmplitude: Number(durationOrOptions.disturbanceAmplitude ?? 0),
    disturbanceStart: Number(durationOrOptions.disturbanceStart ?? 0),
    disturbanceType: durationOrOptions.disturbanceType ?? 'none',
    initialState: Array.isArray(durationOrOptions.initialState) ? durationOrOptions.initialState.map(Number) : null,
  };
}

function responseInput(type, t, options) {
  if (type === 'ramp') return options.amplitude * t;
  if (type === 'sine') return options.amplitude * Math.sin(2 * Math.PI * options.frequency * t);
  if (type === 'square') return options.amplitude * Math.sign(Math.sin(2 * Math.PI * options.frequency * t) || 1);
  if (type === 'pulse') return t <= options.pulseWidth ? options.amplitude : 0;
  return type === 'step' ? options.amplitude : 0.0;
}

function disturbanceInput(t, options) {
  if (!options.disturbanceAmplitude || options.disturbanceType === 'none' || t < options.disturbanceStart) return 0;
  const shiftedTime = t - options.disturbanceStart;
  const disturbanceOptions = {
    ...options,
    amplitude: options.disturbanceAmplitude,
  };
  return responseInput(options.disturbanceType, shiftedTime, disturbanceOptions);
}

function initialStateForInput(order, type, options) {
  if (options.initialState && options.initialState.length > 0) {
    const state = new Array(order).fill(0);
    options.initialState.slice(0, order).forEach((value, idx) => {
      state[idx] = Number.isFinite(value) ? value : 0;
    });
    return state;
  }
  if (type !== 'impulse') return new Array(order).fill(0);
  const x = new Array(order).fill(0);
  if (order > 0) x[order - 1] = options.amplitude;
  return x;
}

export function simulateTimeResponse(sys, type = 'step', durationOrOptions = null) {
  const options = normalizeOptions(durationOrOptions);
  // 1. Convert TF to State-Space (Controllable Canonical Form)
  const n = sys.den.length - 1;
  const num = sys.num;
  const den = sys.den; // den[0] is 1

  // 2. Estimate Duration
  let tEnd = options.duration;
  if (!tEnd) {
    const poles = sys.poles();
    const realParts = poles.map(p => Math.abs(p.re)).filter(re => re > 1e-6);
    const minReal = realParts.length > 0 ? Math.min(...realParts) : 0.1;
    tEnd = Math.max(5, 7 / minReal);
    if (tEnd > 100) tEnd = 100;
    if (poles.some(p => p.re > 0.01)) tEnd = 5; // For unstable systems
  }

  const nPoints = options.sampleCount;
  const dt = tEnd / (nPoints - 1);
  const tArr = [];
  const yArr = [];

  // State-Space: x' = Ax + Bu; y = Cx + Du
  // Controllable Canonical Form
  const x = initialStateForInput(n, type, options);

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
    const t = i * dt;
    const u = responseInput(type, t, options);
    const disturbance = disturbanceInput(t, options);
    tArr.push(i * dt);
    const curY = getOutput(curX, u);
    yArr.push(curY);

    // RK4 Integration step
    const netInput = u + disturbance;
    const k1 = getDx(curX, netInput);
    const k2 = getDx(curX.map((v, j) => v + k1[j] * dt / 2), netInput);
    const k3 = getDx(curX.map((v, j) => v + k2[j] * dt / 2), netInput);
    const k4 = getDx(curX.map((v, j) => v + k3[j] * dt), netInput);

    for (let j = 0; j < n; j++) {
      curX[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    }

    if (Math.abs(curY) > 1e12) break; // Safety cutoff
  }

  return { t: tArr, y: yArr, options };
}

export function stepResponse(sys, durationOrOptions = null) {
  return simulateTimeResponse(sys, 'step', durationOrOptions);
}

export function impulseResponse(sys, durationOrOptions = null) {
  return simulateTimeResponse(sys, 'impulse', durationOrOptions);
}

export function rampResponse(sys, durationOrOptions = null) {
  return simulateTimeResponse(sys, 'ramp', durationOrOptions);
}
