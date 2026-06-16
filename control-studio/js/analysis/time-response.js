/**
 * time-response.js — Stable time-domain analysis using RK4
 */

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`);
  return number;
}

function positiveNumber(value, name) {
  const number = finiteNumber(value, name);
  if (number <= 0) throw new Error(`${name} must be > 0`);
  return number;
}

function nonNegativeNumber(value, name) {
  const number = finiteNumber(value, name);
  if (number < 0) throw new Error(`${name} must be >= 0`);
  return number;
}

function sampleCount(value, fallback, minimum, name = 'sampleCount') {
  const number = positiveNumber(value ?? fallback, name);
  return Math.max(minimum, Math.floor(number));
}

function finiteOrDefault(value, fallback, name) {
  if (value == null) return fallback;
  return finiteNumber(value, name);
}

function optionalPositive(value, name) {
  if (value == null) return null;
  return positiveNumber(value, name);
}

function optionalInitialState(value) {
  if (!Array.isArray(value)) return null;
  return value.map((entry, idx) => finiteNumber(entry, `initialState[${idx}]`));
}

function normalizeOptions(durationOrOptions) {
  if (durationOrOptions == null) {
    return normalizeOptions({});
  }
  if (typeof durationOrOptions === 'number') {
    return normalizeOptions({ duration: durationOrOptions });
  }
  return {
    duration: optionalPositive(durationOrOptions.duration, 'duration'),
    sampleCount: sampleCount(durationOrOptions.sampleCount, 1000, 10),
    amplitude: finiteNumber(durationOrOptions.amplitude ?? 1, 'amplitude'),
    frequency: positiveNumber(durationOrOptions.frequency ?? 1, 'frequency'),
    pulseWidth: positiveNumber(durationOrOptions.pulseWidth ?? 1, 'pulseWidth'),
    disturbanceAmplitude: finiteNumber(durationOrOptions.disturbanceAmplitude ?? 0, 'disturbanceAmplitude'),
    disturbanceStart: nonNegativeNumber(durationOrOptions.disturbanceStart ?? 0, 'disturbanceStart'),
    disturbanceType: durationOrOptions.disturbanceType ?? 'none',
    initialState: optionalInitialState(durationOrOptions.initialState),
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
  const maxInternalStep = Math.min(0.02, Math.max(0.002, tEnd / 500));
  const integrationSteps = Math.max(1, Math.ceil(dt / maxInternalStep));
  const internalDt = dt / integrationSteps;
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

    for (let step = 0; step < integrationSteps; step++) {
      const subTime = t + step * internalDt;
      const subInput = responseInput(type, subTime, options);
      const subDisturbance = disturbanceInput(subTime, options);
      const netInput = subInput + subDisturbance;
      const k1 = getDx(curX, netInput);
      const k2 = getDx(curX.map((v, j) => v + k1[j] * internalDt / 2), netInput);
      const k3 = getDx(curX.map((v, j) => v + k2[j] * internalDt / 2), netInput);
      const k4 = getDx(curX.map((v, j) => v + k3[j] * internalDt), netInput);

      for (let j = 0; j < n; j++) {
        curX[j] += (internalDt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
      }
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

/**
 * Simulate PID controller + plant in open-loop feedback with actuator saturation
 * and back-calculation anti-windup.
 *
 * Anti-windup law:  dxi/dt = e + (u_sat - u_unsat) / Tt
 * When u_unsat is within [uMin, uMax], the correction term is zero (normal integral).
 * When saturated, the correction pulls the integrator state back, preventing wind-up.
 *
 * @param {TransferFunction} plant - strictly proper plant G(s)
 * @param {{ Kp:number, Ki:number, Kd:number, N?:number }} pid - PID gains
 * @param {object} [options]
 * @param {number} [options.uMin=-Infinity]  - lower actuator limit
 * @param {number} [options.uMax=+Infinity]  - upper actuator limit
 * @param {number} [options.Tt]              - anti-windup tracking time constant (default: 1/Ki)
 * @param {number} [options.amplitude=1]     - step reference amplitude
 * @param {number} [options.duration]        - simulation end time
 * @param {number} [options.sampleCount=500]
 * @returns {{ t: number[], y: number[], u: number[] }}
 */
export function simulatePIDAntiWindup(plant, pid, options = {}) {
  const { Kp: rawKp = 0, Ki: rawKi = 0, Kd: rawKd = 0, N: rawN = 100 } = pid || {};
  const Kp = finiteNumber(rawKp, 'Kp');
  const Ki = finiteNumber(rawKi, 'Ki');
  const Kd = finiteNumber(rawKd, 'Kd');
  const N = positiveNumber(rawN, 'N');
  const uMin = finiteOrDefault(options.uMin, -Infinity, 'uMin');
  const uMax = finiteOrDefault(options.uMax, Infinity, 'uMax');
  if (uMin > uMax) throw new Error('uMin must be <= uMax');
  const Tt = options.Tt == null
    ? (Math.abs(Ki) > 1e-12 ? Math.max(0.01, 1 / Math.abs(Ki)) : 10)
    : positiveNumber(options.Tt, 'Tt');

  // Plant CCF state-space
  const n = plant.den.length - 1;
  const den = plant.den;
  const num = plant.num;
  const paddedNum = new Array(n + 1).fill(0);
  for (let i = 0; i < num.length; i++) paddedNum[n - (num.length - 1) + i] = num[i];

  const plantDx = (xp, u) => {
    const dx = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) dx[i] = xp[i + 1];
    let last = u;
    for (let i = 0; i < n; i++) last -= den[n - i] * xp[i];
    dx[n - 1] = last;
    return dx;
  };
  // Assumes strictly proper (D=0)
  const plantOutput = (xp) => {
    let y = 0;
    for (let i = 0; i < n; i++) y += paddedNum[n - i] * xp[i];
    return y;
  };

  // Duration estimate
  const poles = plant.poles();
  const realParts = poles.map(p => Math.abs(p.re)).filter(re => re > 1e-6);
  const minReal = realParts.length > 0 ? Math.min(...realParts) : 0.1;
  const tEnd = optionalPositive(options.duration, 'duration') ?? Math.min(120, Math.max(5, 8 / minReal));
  const nPoints = sampleCount(options.sampleCount, 500, 20);
  const dt = tEnd / (nPoints - 1);
  const h = Math.min(dt, 0.005);
  const stepsPerOut = Math.max(1, Math.ceil(dt / h));
  const actualH = dt / stepsPerOut;

  const refAmp = finiteNumber(options.amplitude ?? 1, 'amplitude');
  let xp = new Array(n).fill(0);
  let xi = 0; // integral state
  let xd = 0; // derivative filter state

  const computeControl = (e, xi_, xd_) =>
    Kp * e + Ki * xi_ + Kd * N * (e - xd_);
  const saturate = (u) => Math.max(uMin, Math.min(uMax, u));

  const tArr = [], yArr = [], uArr = [];

  for (let i = 0; i < nPoints; i++) {
    const y = plantOutput(xp);
    const e = refAmp - y;
    const uRaw = computeControl(e, xi, xd);
    const uSat = saturate(uRaw);
    tArr.push(i * dt);
    yArr.push(y);
    uArr.push(uSat);

    // RK4 integration of [xp, xi, xd]
    for (let step = 0; step < stepsPerOut; step++) {
      const takeStep = (xp_, xi_, xd_, factor = 1) => {
        const y_ = plantOutput(xp_);
        const e_ = refAmp - y_;
        const uR_ = computeControl(e_, xi_, xd_);
        const uS_ = saturate(uR_);
        return {
          dxp: plantDx(xp_, uS_),
          dxi: e_ + (uS_ - uR_) / Tt,
          dxd: N * (e_ - xd_),
        };
      };

      const s1 = takeStep(xp, xi, xd);
      const xp2 = xp.map((v, j) => v + s1.dxp[j] * actualH / 2);
      const xi2 = xi + s1.dxi * actualH / 2;
      const xd2 = xd + s1.dxd * actualH / 2;

      const s2 = takeStep(xp2, xi2, xd2);
      const xp3 = xp.map((v, j) => v + s2.dxp[j] * actualH / 2);
      const xi3 = xi + s2.dxi * actualH / 2;
      const xd3 = xd + s2.dxd * actualH / 2;

      const s3 = takeStep(xp3, xi3, xd3);
      const xp4 = xp.map((v, j) => v + s3.dxp[j] * actualH);
      const xi4 = xi + s3.dxi * actualH;
      const xd4 = xd + s3.dxd * actualH;

      const s4 = takeStep(xp4, xi4, xd4);

      xp = xp.map((v, j) => v + (actualH / 6) * (s1.dxp[j] + 2 * s2.dxp[j] + 2 * s3.dxp[j] + s4.dxp[j]));
      xi += (actualH / 6) * (s1.dxi + 2 * s2.dxi + 2 * s3.dxi + s4.dxi);
      xd += (actualH / 6) * (s1.dxd + 2 * s2.dxd + 2 * s3.dxd + s4.dxd);
    }

    if (Math.abs(y) > 1e10) break; // safety
  }

  return { t: tArr, y: yArr, u: uArr };
}
