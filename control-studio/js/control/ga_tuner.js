// ga_tuner.js — Genetic algorithm-based PID auto-tuner.
//
// Minimises a weighted scalar cost (overshoot + settling-time + IAE) over
// (Kp, Ki, Kd) by simple GA: tournament selection, blend-crossover, gaussian
// mutation. Closed-loop instability is penalised heavily.

import { PIDController } from './pid.js';
import { stepResponse } from '../analysis/time-response.js';
import { stepInfo } from './stability.js';
import { rand, randn } from '../math/rng.js';

/**
 * Cost function for a single individual (Kp, Ki, Kd).
 * Returns +Infinity for unstable closed loops.
 */
function defaultCost(plant, individual, weights = {}) {
  const { Kp, Ki, Kd } = individual;
  const pid = new PIDController(Kp, Ki, Kd, 100);
  const C = pid.toTransferFunction();
  const cl = C.series(plant).feedback();
  if (!cl.isStable()) return 1e6;
  try {
    const resp = stepResponse(cl, { sampleCount: 200, amplitude: 1 });
    const info = stepInfo(resp.t, resp.y);
    const overshoot = Math.max(0, info.overshoot || 0);
    const settle = Number.isFinite(info.settlingTime) ? info.settlingTime : 100;
    // IAE = ∫|e(t)|dt approximated via trapezoid
    let iae = 0;
    for (let i = 1; i < resp.t.length; i++) {
      const e = 1 - resp.y[i];
      iae += Math.abs(e) * (resp.t[i] - resp.t[i - 1]);
    }
    const wO = weights.overshoot ?? 1;
    const wS = weights.settle ?? 0.5;
    const wI = weights.iae ?? 0.3;
    const wU = weights.effort ?? 0.05;
    const effortPenalty = wU * (Math.abs(Kp) + 0.5 * Math.abs(Kd));
    return wO * overshoot + wS * settle + wI * iae + effortPenalty;
  } catch { return 1e6; }
}

/**
 * Run the GA. Returns the best PID parameters and the convergence history.
 *
 * @param {TransferFunction} plant
 * @param {Object} options
 * @param {number} [options.populationSize=24]
 * @param {number} [options.generations=30]
 * @param {number} [options.kpRange=10] kpMax
 * @param {number} [options.kiRange=5]
 * @param {number} [options.kdRange=2]
 * @param {Object} [options.weights] overshoot/settle/iae/effort cost weights
 * @returns {{ best: {Kp,Ki,Kd,cost}, history: number[] }}
 */
export function gaTunePID(plant, options = {}) {
  const N = options.populationSize ?? 24;
  const G = options.generations ?? 30;
  const kpMax = options.kpRange ?? 10;
  const kiMax = options.kiRange ?? 5;
  const kdMax = options.kdRange ?? 2;
  const weights = options.weights || {};

  const randIndiv = () => ({
    Kp: rand() * kpMax,
    Ki: rand() * kiMax,
    Kd: rand() * kdMax,
  });

  let pop = Array.from({ length: N }, randIndiv);
  let scored = pop.map((p) => ({ ...p, cost: defaultCost(plant, p, weights) }));
  scored.sort((a, b) => a.cost - b.cost);

  const history = [scored[0].cost];
  for (let gen = 0; gen < G; gen++) {
    const elite = scored.slice(0, Math.max(2, Math.floor(N * 0.2)));
    const offspring = [];
    while (offspring.length < N - elite.length) {
      // tournament
      const a = scored[Math.floor(rand() * Math.min(N, 8))];
      const b = scored[Math.floor(rand() * Math.min(N, 8))];
      const p1 = a.cost < b.cost ? a : b;
      const c = scored[Math.floor(rand() * Math.min(N, 8))];
      const d = scored[Math.floor(rand() * Math.min(N, 8))];
      const p2 = c.cost < d.cost ? c : d;
      // blend crossover (BLX-α)
      const alpha = 0.3;
      const blend = (x, y) => {
        const lo = Math.min(x, y) - alpha * Math.abs(x - y);
        const hi = Math.max(x, y) + alpha * Math.abs(x - y);
        return lo + rand() * (hi - lo);
      };
      let child = { Kp: blend(p1.Kp, p2.Kp), Ki: blend(p1.Ki, p2.Ki), Kd: blend(p1.Kd, p2.Kd) };
      // mutation
      if (rand() < 0.3) child.Kp += 0.2 * kpMax * randn();
      if (rand() < 0.3) child.Ki += 0.2 * kiMax * randn();
      if (rand() < 0.3) child.Kd += 0.2 * kdMax * randn();
      // clamp non-negative gains
      child.Kp = Math.max(0, Math.min(kpMax * 1.5, child.Kp));
      child.Ki = Math.max(0, Math.min(kiMax * 1.5, child.Ki));
      child.Kd = Math.max(0, Math.min(kdMax * 1.5, child.Kd));
      offspring.push(child);
    }
    pop = [...elite, ...offspring];
    scored = pop.map((p) => ({ Kp: p.Kp, Ki: p.Ki, Kd: p.Kd, cost: defaultCost(plant, p, weights) }));
    scored.sort((a, b) => a.cost - b.cost);
    history.push(scored[0].cost);
  }
  return { best: scored[0], history };
}

// ---------------------------------------------------------------------------
// NSGA-II helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if individual a dominates b (all objectives ≤, at least one <).
 */
function _dominates(a, b) {
  const objA = a.objectives;
  const objB = b.objectives;
  let strictlyBetter = false;
  for (let i = 0; i < objA.length; i++) {
    if (objA[i] > objB[i]) return false;
    if (objA[i] < objB[i]) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * Non-dominated sorting — assigns a `.rank` (1 = Pareto optimal) to every individual.
 * Returns array of fronts (each front is an array of individuals).
 */
function _nonDominatedSort(population) {
  const n = population.length;
  // domination count and dominated set for each individual
  const dominated = population.map(() => []);
  const count = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (_dominates(population[i], population[j])) {
        dominated[i].push(j);
      } else if (_dominates(population[j], population[i])) {
        count[i]++;
      }
    }
  }

  const fronts = [];
  let currentFront = [];
  for (let i = 0; i < n; i++) {
    if (count[i] === 0) { population[i].rank = 1; currentFront.push(i); }
  }
  fronts.push(currentFront);

  let rankNum = 2;
  while (currentFront.length > 0) {
    const nextFront = [];
    for (const i of currentFront) {
      for (const j of dominated[i]) {
        count[j]--;
        if (count[j] === 0) { population[j].rank = rankNum; nextFront.push(j); }
      }
    }
    currentFront = nextFront;
    if (nextFront.length > 0) { fronts.push(nextFront); rankNum++; }
  }
  return fronts;
}

/**
 * Assign crowding distance to individuals in a single front (by index into population).
 */
function _crowdingDistance(population, frontIndices) {
  const l = frontIndices.length;
  for (const i of frontIndices) population[i].crowding = 0;
  if (l <= 2) { for (const i of frontIndices) population[i].crowding = Infinity; return; }

  const nObj = population[frontIndices[0]].objectives.length;
  for (let m = 0; m < nObj; m++) {
    const sorted = [...frontIndices].sort(
      (a, b) => population[a].objectives[m] - population[b].objectives[m]
    );
    population[sorted[0]].crowding = Infinity;
    population[sorted[l - 1]].crowding = Infinity;
    const fMin = population[sorted[0]].objectives[m];
    const fMax = population[sorted[l - 1]].objectives[m];
    const range = fMax - fMin || 1;
    for (let k = 1; k < l - 1; k++) {
      population[sorted[k]].crowding +=
        (population[sorted[k + 1]].objectives[m] - population[sorted[k - 1]].objectives[m]) / range;
    }
  }
}

/**
 * Evaluate multi-objective metrics for one individual.
 * Returns [overshoot%, settlingTime, iae, effort] (selected by objectiveKeys).
 */
function _evaluateObjectives(plant, individual) {
  const { Kp, Ki, Kd } = individual;
  const pid = new PIDController(Kp, Ki, Kd, 100);
  const C = pid.toTransferFunction();
  const cl = C.series(plant).feedback();
  if (!cl.isStable()) return [Infinity, Infinity, Infinity, Infinity];
  try {
    const resp = stepResponse(cl, { sampleCount: 200, amplitude: 1 });
    const info = stepInfo(resp.t, resp.y);
    const overshoot = Math.max(0, info.overshoot || 0);
    const settle = Number.isFinite(info.settlingTime) ? info.settlingTime : 100;
    let iae = 0;
    for (let i = 1; i < resp.t.length; i++) {
      iae += Math.abs(1 - resp.y[i]) * (resp.t[i] - resp.t[i - 1]);
    }
    const effort = Math.abs(Kp) + 0.5 * Math.abs(Kd);
    return [overshoot, settle, iae, effort];
  } catch { return [Infinity, Infinity, Infinity, Infinity]; }
}

/**
 * NSGA-II multi-objective PID tuner.
 * Objectives: [overshoot%, settlingTime] by default (optionally iae/effort).
 * Returns a Pareto front of non-dominated solutions sorted by first objective.
 *
 * @param {TransferFunction} plant
 * @param {object} [options]
 * @param {number} [options.populationSize=30]
 * @param {number} [options.generations=25]
 * @param {number} [options.kpRange=10]
 * @param {number} [options.kiRange=5]
 * @param {number} [options.kdRange=2]
 * @param {string[]} [options.objectives=['overshoot','settling']]
 * @returns {{ paretoFront: Array<{Kp,Ki,Kd,objectives,rank}>, history: number[][] }}
 */
export function nsga2TunePID(plant, options = {}) {
  const N = options.populationSize ?? 30;
  const G = options.generations ?? 25;
  const kpMax = options.kpRange ?? 10;
  const kiMax = options.kiRange ?? 5;
  const kdMax = options.kdRange ?? 2;
  const objKeys = options.objectives ?? ['overshoot', 'settling'];

  // Map objective key to index in _evaluateObjectives output
  const OBJ_IDX = { overshoot: 0, settling: 1, iae: 2, effort: 3 };
  const selectedIdx = objKeys.map((k) => OBJ_IDX[k] ?? 0);

  const makeIndiv = (Kp, Ki, Kd) => {
    const allObj = _evaluateObjectives(plant, { Kp, Ki, Kd });
    return { Kp, Ki, Kd, objectives: selectedIdx.map((i) => allObj[i]), rank: 0, crowding: 0 };
  };

  const randIndiv = () => makeIndiv(rand() * kpMax, rand() * kiMax, rand() * kdMax);

  // NSGA-II tournament: prefer lower rank, then higher crowding distance
  const tournament = (pop) => {
    const a = pop[Math.floor(rand() * pop.length)];
    const b = pop[Math.floor(rand() * pop.length)];
    if (a.rank !== b.rank) return a.rank < b.rank ? a : b;
    return a.crowding >= b.crowding ? a : b;
  };

  const blxAlpha = 0.3;
  const blend = (x, y) => {
    const lo = Math.min(x, y) - blxAlpha * Math.abs(x - y);
    const hi = Math.max(x, y) + blxAlpha * Math.abs(x - y);
    return lo + rand() * (hi - lo);
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // Initial population
  let pop = Array.from({ length: N }, randIndiv);
  const historyBestOS = [];

  for (let gen = 0; gen < G; gen++) {
    // Assign rank and crowding to current pop
    const fronts = _nonDominatedSort(pop);
    for (const frontIdx of fronts) _crowdingDistance(pop, frontIdx);

    // Track best overshoot on Pareto front
    const front1 = pop.filter((p) => p.rank === 1);
    const bestOS = Math.min(...front1.map((p) => p.objectives[0]));
    historyBestOS.push(bestOS);

    // Generate offspring
    const offspring = [];
    while (offspring.length < N) {
      const p1 = tournament(pop);
      const p2 = tournament(pop);
      let cKp = blend(p1.Kp, p2.Kp);
      let cKi = blend(p1.Ki, p2.Ki);
      let cKd = blend(p1.Kd, p2.Kd);
      if (rand() < 0.3) cKp += 0.2 * kpMax * randn();
      if (rand() < 0.3) cKi += 0.2 * kiMax * randn();
      if (rand() < 0.3) cKd += 0.2 * kdMax * randn();
      cKp = clamp(cKp, 0, kpMax * 1.5);
      cKi = clamp(cKi, 0, kiMax * 1.5);
      cKd = clamp(cKd, 0, kdMax * 1.5);
      offspring.push(makeIndiv(cKp, cKi, cKd));
    }

    // Combine parent + offspring
    const combined = [...pop, ...offspring];
    const allFronts = _nonDominatedSort(combined);
    for (const frontIdx of allFronts) _crowdingDistance(combined, frontIdx);

    // Select next generation: fill by fronts until we have N individuals
    const nextPop = [];
    for (const frontIdx of allFronts) {
      const front = frontIdx.map((i) => combined[i]);
      if (nextPop.length + front.length <= N) {
        nextPop.push(...front);
      } else {
        // Sort by crowding distance descending and fill remaining slots
        front.sort((a, b) => b.crowding - a.crowding);
        nextPop.push(...front.slice(0, N - nextPop.length));
        break;
      }
    }
    pop = nextPop;
  }

  // Final sort and Pareto extraction
  _nonDominatedSort(pop);
  const paretoFront = pop
    .filter((p) => p.rank === 1)
    .sort((a, b) => a.objectives[0] - b.objectives[0]);

  return { paretoFront, history: historyBestOS };
}
