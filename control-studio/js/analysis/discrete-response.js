/**
 * discrete-response.js — Difference-equation responses for z-domain systems.
 */

function normalizeDiscreteOptions(options = {}) {
  return {
    sampleCount: Math.max(2, Math.floor(options.sampleCount ?? 100)),
    amplitude: Number(options.amplitude ?? 1),
  };
}

function runDifferenceEquation(sys, u, sampleCount) {
  const t = [];
  const y = [];
  for (let k = 0; k < sampleCount; k += 1) {
    let yk = 0;
    for (let i = 0; i < sys.num.length; i += 1) {
      if (k - i >= 0) yk += sys.num[i] * u[k - i];
    }
    for (let i = 1; i < sys.den.length; i += 1) {
      if (k - i >= 0) yk -= sys.den[i] * y[k - i];
    }
    t.push(k * sys.sampleTime);
    y.push(yk);
  }
  return { t, y };
}

export function discreteStepResponse(sys, options = {}) {
  const config = normalizeDiscreteOptions(options);
  const u = new Array(config.sampleCount).fill(config.amplitude);
  const { t, y } = runDifferenceEquation(sys, u, config.sampleCount);
  return { t, y, options: config };
}

export function discreteImpulseResponse(sys, options = {}) {
  const config = normalizeDiscreteOptions(options);
  const u = new Array(config.sampleCount).fill(0);
  u[0] = config.amplitude;
  const { t, y } = runDifferenceEquation(sys, u, config.sampleCount);
  return { t, y, options: config };
}
