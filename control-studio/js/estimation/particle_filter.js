/**
 * particle_filter.js - Tier C2: Bootstrap / SIR / auxiliary particle filters.
 */

function makeRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randn(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function weightedStats(particles, weights) {
  const n = particles[0].length;
  const mean = new Array(n).fill(0);
  for (let i = 0; i < particles.length; i++) {
    for (let j = 0; j < n; j++) mean[j] += weights[i] * particles[i][j];
  }
  const cov = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < particles.length; i++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) cov[r][c] += weights[i] * (particles[i][r] - mean[r]) * (particles[i][c] - mean[c]);
    }
  }
  return { mean, cov };
}

export function resample(pf, method = 'systematic') {
  const { rng } = pf._internal;
  const particles = pf.particles;
  const weights = pf.weights;
  const N = particles.length;
  const cumulative = [];
  weights.reduce((sum, value, i) => { cumulative[i] = sum + value; return cumulative[i]; }, 0);
  const out = [];

  if (method === 'multinomial') {
    for (let i = 0; i < N; i++) {
      const u = rng();
      let j = 0;
      while (j < N - 1 && cumulative[j] < u) j++;
      out.push([...particles[j]]);
    }
  } else {
    const offset = method === 'stratified' ? 0 : rng();
    let j = 0;
    for (let i = 0; i < N; i++) {
      const u = method === 'stratified' ? (i + rng()) / N : (offset + i) / N;
      while (j < N - 1 && cumulative[j] < u) j++;
      out.push([...particles[j]]);
    }
  }

  pf.particles = out;
  pf.weights = new Array(N).fill(1 / N);
  return pf;
}

export function initPF({ f, h, x0Sampler, N = 500, processNoise = [0.1], measNoise = [0.1], seed = 42 } = {}) {
  if (typeof f !== 'function' || typeof h !== 'function' || typeof x0Sampler !== 'function') {
    throw new Error('initPF requires f, h, and x0Sampler functions');
  }
  const rng = makeRng(seed);
  const pf = {
    f,
    h,
    N,
    processNoise,
    measNoise,
    particles: Array.from({ length: N }, () => x0Sampler(rng)),
    weights: new Array(N).fill(1 / N),
    _internal: { rng },
  };
  return pf;
}

export function stepPF(pf, u, y) {
  const { rng } = pf._internal;
  pf.particles = pf.particles.map((x) => {
    const xp = pf.f(x, u);
    return xp.map((value, i) => value + (pf.processNoise[i] ?? pf.processNoise[0] ?? 0) * randn(rng));
  });

  const logWeights = pf.particles.map((x) => {
    const yh = pf.h(x);
    return y.reduce((sum, value, i) => {
      const sigma = Math.max(1e-12, pf.measNoise[i] ?? pf.measNoise[0] ?? 1);
      const err = value - yh[i];
      return sum - 0.5 * err * err / (sigma * sigma) - Math.log(sigma);
    }, 0);
  });
  const maxLog = Math.max(...logWeights);
  const raw = logWeights.map((value) => Math.exp(value - maxLog));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  pf.weights = raw.map((value) => value / total);

  let ESS = 1 / pf.weights.reduce((sum, value) => sum + value * value, 0);
  if (ESS < pf.N / 2) {
    resample(pf, 'systematic');
    ESS = pf.N;
  }
  const { mean, cov } = weightedStats(pf.particles, pf.weights);
  return { x_mean: mean, x_cov: cov, ESS, particles: pf.particles.map((p) => [...p]) };
}

export default { initPF, stepPF, resample };
