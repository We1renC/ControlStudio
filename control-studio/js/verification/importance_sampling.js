/**
 * importance_sampling.js - Tier F5: importance-sampling Monte Carlo baseline.
 */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randn(r) {
  const u1 = Math.max(r(), 1e-12);
  const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function normalPdf(x, mu = 0, sigma = 1) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export function estimateNormalTail({ threshold = 5, samples = 20000, proposalMean = threshold, seed = 1 } = {}) {
  const r = rng(seed);
  let weighted = 0;
  let weighted2 = 0;
  for (let i = 0; i < samples; i++) {
    const x = proposalMean + randn(r);
    const w = normalPdf(x, 0, 1) / normalPdf(x, proposalMean, 1);
    const value = x > threshold ? w : 0;
    weighted += value;
    weighted2 += value * value;
  }
  const estimate = weighted / samples;
  const variance = Math.max(0, weighted2 / samples - estimate * estimate) / samples;
  return { estimate, variance, samples, proposalMean };
}

export function naiveNormalTail({ threshold = 5, samples = 20000, seed = 1 } = {}) {
  const r = rng(seed);
  let count = 0;
  for (let i = 0; i < samples; i++) if (randn(r) > threshold) count++;
  const p = count / samples;
  const variance = count === 0
    ? (1 / (samples + 1)) * (1 - 1 / (samples + 1)) / samples
    : p * (1 - p) / samples;
  return { estimate: p, variance, samples };
}

export default { estimateNormalTail, naiveNormalTail };
