/**
 * discrete-response.js — Difference-equation responses for z-domain systems.
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

function discreteSampleCount(value, fallback = 100) {
  return Math.max(2, Math.floor(positiveNumber(value ?? fallback, 'sampleCount')));
}

function normalizeDiscreteOptions(options = {}) {
  const source = options ?? {};
  return {
    sampleCount: discreteSampleCount(source.sampleCount),
    amplitude: finiteNumber(source.amplitude ?? 1, 'amplitude'),
  };
}

function validateDiscreteSystem(sys) {
  if (!sys || !Array.isArray(sys.num) || sys.num.length === 0) {
    throw new Error('discrete system numerator must be a non-empty array');
  }
  if (!Array.isArray(sys.den) || sys.den.length === 0) {
    throw new Error('discrete system denominator must be a non-empty array');
  }
  const num = sys.num.map((value, idx) => finiteNumber(value, `num[${idx}]`));
  const den = sys.den.map((value, idx) => finiteNumber(value, `den[${idx}]`));
  const den0 = den[0];
  if (Math.abs(den0) < 1e-15) throw new Error('discrete system denominator leading coefficient must be non-zero');
  return {
    num,
    den,
    sampleTime: positiveNumber(sys.sampleTime, 'sampleTime'),
  };
}

function runDifferenceEquation(sys, u, sampleCount) {
  const model = validateDiscreteSystem(sys);
  const den0 = model.den[0];
  const t = [];
  const y = [];
  for (let k = 0; k < sampleCount; k += 1) {
    let yk = 0;
    for (let i = 0; i < model.num.length; i += 1) {
      if (k - i >= 0) yk += model.num[i] * u[k - i];
    }
    for (let i = 1; i < model.den.length; i += 1) {
      if (k - i >= 0) yk -= model.den[i] * y[k - i];
    }
    yk /= den0;
    t.push(k * model.sampleTime);
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
