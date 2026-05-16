/**
 * discrete-response.js — Difference-equation responses for z-domain systems.
 */

function normalizeDiscreteOptions(options = {}) {
  return {
    sampleCount: Math.max(2, Math.floor(options.sampleCount ?? 100)),
    amplitude: Number(options.amplitude ?? 1),
  };
}

export function discreteStepResponse(sys, options = {}) {
  const config = normalizeDiscreteOptions(options);
  const t = [];
  const y = [];
  const u = new Array(config.sampleCount).fill(config.amplitude);

  for (let k = 0; k < config.sampleCount; k += 1) {
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

  return { t, y, options: config };
}
