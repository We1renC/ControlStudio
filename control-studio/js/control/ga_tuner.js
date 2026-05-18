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
