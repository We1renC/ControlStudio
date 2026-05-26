/**
 * falsification.js - Tier F4: STL robustness and falsification search.
 *
 * The implementation intentionally starts with the engineering core needed by
 * ControlStudio workflows: bounded always/eventually formulas over scalar
 * signal predicates and deterministic black-box input search.
 */

import { mulberry32 } from '../math/rng.js';

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function parseTimeWindow(text) {
  const match = text.match(/^\s*(alw|always|ev|eventually|F|G)_\[\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\]\s+(.+)\s*$/i);
  if (!match) return null;
  const op = match[1].toLowerCase();
  const t0 = Number(match[2]);
  const t1 = Number(match[3]);
  assertFinite(t0, 'window start');
  assertFinite(t1, 'window end');
  if (t1 < t0) throw new Error('STL time window end must be >= start');
  return {
    temporal: op === 'ev' || op === 'eventually' || op === 'f' ? 'eventually' : 'always',
    t0,
    t1,
    predicateText: match[4].trim(),
  };
}

function parsePredicate(text) {
  const match = text.match(/^\s*([A-Za-z_]\w*)\s*(<=|<|>=|>)\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*$/i);
  if (!match) {
    throw new Error(`unsupported STL predicate: ${text}`);
  }
  const bound = Number(match[3]);
  assertFinite(bound, 'predicate bound');
  return { signal: match[1], relation: match[2], bound };
}

function normalizeTrajectory(trajectory) {
  if (Array.isArray(trajectory)) {
    return trajectory.map((point, i) => ({
      t: Number(point.t ?? point.time ?? i),
      point,
    }));
  }
  if (!trajectory || typeof trajectory !== 'object') {
    throw new Error('trajectory must be an array or {t, signals} object');
  }
  const t = trajectory.t ?? trajectory.time;
  const signals = trajectory.signals ?? trajectory;
  if (!Array.isArray(t)) throw new Error('trajectory.t must be an array');
  return t.map((time, i) => ({
    t: Number(time),
    point: new Proxy({}, {
      get(_, key) {
        const series = signals[key];
        return Array.isArray(series) ? series[i] : undefined;
      },
    }),
  }));
}

function signalAt(point, signal) {
  const value = point[signal];
  if (!Number.isFinite(value)) {
    throw new Error(`trajectory signal "${signal}" is missing or non-finite`);
  }
  return value;
}

function predicateRobustness(predicate, point) {
  const value = signalAt(point, predicate.signal);
  switch (predicate.relation) {
    case '<':
    case '<=':
      return predicate.bound - value;
    case '>':
    case '>=':
      return value - predicate.bound;
    default:
      throw new Error(`unsupported predicate relation: ${predicate.relation}`);
  }
}

/**
 * Parse a small STL subset:
 *   - `alw_[a,b] x < c`
 *   - `ev_[a,b] x >= c`
 *   - bare scalar predicates such as `x < c`
 *
 * Robust semantics:
 *   - always:     min rho(predicate, t) over the window
 *   - eventually: max rho(predicate, t) over the window
 */
export function defineSTL(formula) {
  if (typeof formula !== 'string' || !formula.trim()) {
    throw new Error('defineSTL expects a non-empty formula string');
  }
  const temporal = parseTimeWindow(formula);
  const spec = temporal ?? {
    temporal: 'always',
    t0: -Infinity,
    t1: Infinity,
    predicateText: formula.trim(),
  };
  const predicate = parsePredicate(spec.predicateText);

  function robustness(trajectory) {
    const rows = normalizeTrajectory(trajectory)
      .filter((row) => row.t >= spec.t0 && row.t <= spec.t1);
    if (!rows.length) {
      throw new Error('trajectory has no samples inside the STL time window');
    }
    const values = rows.map((row) => predicateRobustness(predicate, row.point));
    return spec.temporal === 'eventually'
      ? Math.max(...values)
      : Math.min(...values);
  }

  return {
    formula,
    temporal: spec.temporal,
    interval: [spec.t0, spec.t1],
    predicate,
    robustness,
    evaluate: robustness,
  };
}

function normalizeInputSpace(inputSpace) {
  if (Array.isArray(inputSpace)) {
    return inputSpace.map((entry, index) => {
      const name = entry.name ?? `u${index}`;
      const min = Number(entry.min);
      const max = Number(entry.max);
      assertFinite(min, `${name}.min`);
      assertFinite(max, `${name}.max`);
      if (max < min) throw new Error(`${name}.max must be >= min`);
      return { name, min, max };
    });
  }
  if (inputSpace && typeof inputSpace === 'object') {
    return Object.entries(inputSpace).map(([name, range]) => {
      const min = Number(range.min ?? range[0]);
      const max = Number(range.max ?? range[1]);
      assertFinite(min, `${name}.min`);
      assertFinite(max, `${name}.max`);
      if (max < min) throw new Error(`${name}.max must be >= min`);
      return { name, min, max };
    });
  }
  throw new Error('inputSpace must be an array or object');
}

function sampleInput(space, rng) {
  const input = {};
  for (const dim of space) {
    input[dim.name] = dim.min + (dim.max - dim.min) * rng();
  }
  return input;
}

function clampInput(input, space) {
  const out = {};
  for (const dim of space) {
    const value = Number(input[dim.name]);
    out[dim.name] = Math.min(dim.max, Math.max(dim.min, Number.isFinite(value) ? value : dim.min));
  }
  return out;
}

function normalSample(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function perturbInput(input, space, rng, temperature) {
  const out = {};
  for (const dim of space) {
    const span = Math.max(dim.max - dim.min, 1e-12);
    out[dim.name] = input[dim.name] + normalSample(rng) * span * 0.25 * temperature;
  }
  return clampInput(out, space);
}

function simulate(system, input) {
  if (typeof system === 'function') return system(input);
  if (system && typeof system.simulate === 'function') return system.simulate(input);
  throw new Error('system must be a function or object with simulate(input)');
}

function scoreCandidate(system, spec, input) {
  const trajectory = simulate(system, input);
  const rho = spec.robustness(trajectory);
  if (!Number.isFinite(rho)) throw new Error('STL robustness returned a non-finite value');
  return { rho, input, trajectory };
}

/**
 * Search for an input trajectory that violates an STL spec. A negative
 * robustness is a counterexample.
 *
 * @param {object} args
 * @param {Function|{simulate:Function}} args.system
 * @param {string|object} args.spec
 * @param {Array|object} args.inputSpace
 * @param {number} [args.budget=1000]
 * @param {'random'|'anneal'} [args.method='anneal']
 * @param {number} [args.seed=1]
 */
export function falsify(args = {}) {
  const {
    system,
    spec: rawSpec,
    inputSpace,
    budget = 1000,
    method = 'anneal',
    seed = 1,
  } = args;
  if (!system) throw new Error('falsify requires system');
  const spec = typeof rawSpec === 'string' ? defineSTL(rawSpec) : rawSpec;
  if (!spec || typeof spec.robustness !== 'function') {
    throw new Error('falsify requires an STL spec or robustness-capable spec object');
  }
  if (!Number.isInteger(budget) || budget <= 0) throw new Error('budget must be a positive integer');
  const space = normalizeInputSpace(inputSpace);
  const rng = mulberry32(seed);

  let current = scoreCandidate(system, spec, sampleInput(space, rng));
  let best = current;
  const history = [best.rho];

  for (let iter = 1; iter < budget; iter++) {
    const temperature = Math.max(0.02, 1 - iter / Math.max(1, budget - 1));
    const candidateInput = method === 'random'
      ? sampleInput(space, rng)
      : perturbInput(current.input, space, rng, temperature);
    const candidate = scoreCandidate(system, spec, candidateInput);
    const delta = candidate.rho - current.rho;
    const accept = candidate.rho < current.rho || (method === 'anneal' && rng() < Math.exp(-delta / Math.max(temperature, 1e-6)));
    if (accept) current = candidate;
    if (candidate.rho < best.rho) best = candidate;
    history.push(best.rho);
    if (best.rho < 0) break;
  }

  return {
    rhoMin: best.rho,
    'rho_min': best.rho,
    worstInput: best.input,
    worstTrajectory: best.trajectory,
    falsified: best.rho < 0,
    budget,
    method,
    seed,
    history,
    spec,
  };
}
