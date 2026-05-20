/**
 * empc.js — Economic MPC (P24-03)
 *
 * Method: Differential Evolution (DE/rand/1/bin) for open-loop optimisation
 *   at each sampling instant, minimising a user-supplied (possibly non-quadratic)
 *   stage cost over a finite prediction horizon.
 *
 * Approach:
 *   min_{U}  Σ_{t=0}^{N-1} stageCost(x_t, u_t)  +  termCost(x_N)
 *   s.t.  x_{t+1} = Ad·x_t + Bd·u_t        (linear time-invariant model)
 *         uMin ≤ u_t ≤ uMax                  (optional box constraints)
 *
 * Suitable for: energy optimisation, economic objectives (throughput, profit),
 * any cost function that is non-quadratic or non-convex.
 *
 * Limitations:
 *   - Uses an LTI model for prediction (nonlinear dynamics → use NMPC)
 *   - DE is a metaheuristic: may not find the global optimum for very complex
 *     landscapes; increase population/generations for better accuracy
 *   - O(popSize × generations × horizon) calls to stageCost per MPC step
 */

// ---------------------------------------------------------------------------
// Internal: Differential Evolution
// ---------------------------------------------------------------------------

/**
 * Minimise fn(x) over x ∈ [lb, lb+range]^d using DE/rand/1/bin.
 *
 * @param {function} fn       - Objective: x (number[d]) → number
 * @param {number[]} lb       - Lower bounds (length d)
 * @param {number[]} ub       - Upper bounds (length d)
 * @param {object}   opts
 * @param {number}   [opts.popSize=10*d]   - Population size
 * @param {number}   [opts.maxGen=200]     - Max generations
 * @param {number}   [opts.F=0.8]         - Mutation scale factor
 * @param {number}   [opts.CR=0.9]        - Crossover rate
 * @param {number}   [opts.seed=null]     - PRNG seed (null = Math.random)
 * @param {number}   [opts.tol=1e-8]      - Convergence tolerance on cost spread
 * @returns {{ x: number[], fx: number, generations: number }}
 */
export function differentialEvolution(fn, lb, ub, opts = {}) {
  const d       = lb.length;
  const popSize = opts.popSize ?? Math.max(10, 5 * d);
  const maxGen  = opts.maxGen  ?? 200;
  const F       = opts.F       ?? 0.8;
  const CR      = opts.CR      ?? 0.9;
  const tol     = opts.tol     ?? 1e-8;

  // Simple seeded LCG (if seed provided), else Math.random
  let rng;
  if (opts.seed != null) {
    let s = opts.seed >>> 0;
    rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  } else {
    rng = Math.random.bind(Math);
  }

  function randInt(n) { return Math.floor(rng() * n); }

  if (d === 0) throw new Error('Differential evolution dimension must be positive');
  if (lb.length !== ub.length) throw new Error('Differential evolution bounds must have matching dimensions');
  for (let i = 0; i < d; i++) {
    if (!Number.isFinite(lb[i]) || !Number.isFinite(ub[i])) {
      throw new Error('Differential evolution requires finite lower and upper bounds');
    }
    if (lb[i] > ub[i]) {
      throw new Error(`Differential evolution bound conflict at index ${i}: lb > ub`);
    }
  }

  // Initialise population.
  const pop = Array.from({ length: popSize }, () =>
    lb.map((lo, i) => lo + rng() * (ub[i] - lo))
  );
  if (opts.initialCandidate) {
    if (!Array.isArray(opts.initialCandidate) || opts.initialCandidate.length !== d) {
      throw new Error('initialCandidate must match optimisation dimension');
    }
    pop[0] = opts.initialCandidate.map((value, i) => Math.min(ub[i], Math.max(lb[i], value)));
  }
  const costs = pop.map(fn);

  let bestIdx = 0;
  for (let i = 1; i < popSize; i++) if (costs[i] < costs[bestIdx]) bestIdx = i;

  let gen = 0;
  for (; gen < maxGen; gen++) {
    for (let i = 0; i < popSize; i++) {
      // Mutation: pick 3 distinct indices ≠ i
      let a = i, b = i, c = i;
      while (a === i) a = randInt(popSize);
      while (b === i || b === a) b = randInt(popSize);
      while (c === i || c === a || c === b) c = randInt(popSize);

      const jRand = randInt(d);
      const trial = pop[i].map((xi, j) => {
        if (rng() < CR || j === jRand) {
          return Math.min(ub[j], Math.max(lb[j], pop[a][j] + F * (pop[b][j] - pop[c][j])));
        }
        return xi;
      });

      const fTrial = fn(trial);
      if (fTrial <= costs[i]) {
        pop[i] = trial;
        costs[i] = fTrial;
        if (fTrial < costs[bestIdx]) bestIdx = i;
      }
    }

    // Convergence: cost range < tol
    let cMax = -Infinity, cMin = Infinity;
    for (const c of costs) { if (c > cMax) cMax = c; if (c < cMin) cMin = c; }
    if (cMax - cMin < tol) break;
  }

  return { x: [...pop[bestIdx]], fx: costs[bestIdx], generations: gen };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Simulate Economic MPC via Differential Evolution open-loop optimisation.
 *
 * @param {number[][]} Ad        - Discrete-time A matrix (n×n)
 * @param {number[][]} Bd        - Discrete-time B matrix (n×m)
 * @param {function}   stageCost - (x: number[n], u: number[m]) → number
 *                                   Must return a finite scalar for any (x,u).
 * @param {number}     horizon   - Prediction horizon N (≥1)
 * @param {number[]}   x0        - Initial state (length n)
 * @param {number}     steps     - Number of closed-loop steps to simulate
 * @param {object}    [opts]
 * @param {function}  [opts.termCost]  - (x: number[n]) → number  (default: 0)
 * @param {number[]}  [opts.uMin]      - Lower bounds on u (default: -Inf each)
 * @param {number[]}  [opts.uMax]      - Upper bounds on u (default: +Inf each)
 * @param {number}    [opts.popSize]   - DE population size (default: max(10,5·m·N))
 * @param {number}    [opts.maxGen]    - DE max generations (default: 200)
 * @param {number}    [opts.F=0.8]     - DE mutation factor
 * @param {number}    [opts.CR=0.9]    - DE crossover rate
 * @param {number}    [opts.seed]      - Random seed for DE (for reproducibility)
 * @param {number[]}  [opts.uInit]     - Warm-start initial u sequence (length m*N)
 * @returns {{
 *   x:          number[][],   // closed-loop state trajectory (steps+1 × n)
 *   u:          number[][],   // applied control sequence (steps × m)
 *   stageCosts: number[],     // stage cost at each closed-loop step
 *   totalCost:  number,       // sum of stage costs
 *   deInfo:     object[],     // DE diagnostics per step { fx, generations }
 * }}
 */
export function simulateEMPC(Ad, Bd, stageCost, horizon, x0, steps, opts = {}) {
  const n = Ad.length;
  const m = Bd[0].length;
  if (!Array.isArray(Ad) || !Array.isArray(Bd) || !Array.isArray(Bd[0])) {
    throw new Error('EMPC requires dense Ad and Bd matrices');
  }
  if (!Number.isInteger(horizon) || horizon <= 0) {
    throw new Error('EMPC horizon must be a positive integer');
  }
  if (!Number.isInteger(steps) || steps <= 0) {
    throw new Error('EMPC steps must be a positive integer');
  }
  if (!Array.isArray(x0) || x0.length !== n) {
    throw new Error(`EMPC x0 must be a vector of length ${n}`);
  }
  if (Ad.some((row) => !Array.isArray(row) || row.length !== n)) {
    throw new Error(`EMPC Ad must be ${n}×${n}`);
  }
  if (Bd.some((row) => !Array.isArray(row) || row.length !== m)) {
    throw new Error(`EMPC Bd must be ${n}×${m}`);
  }
  if (typeof stageCost !== 'function') {
    throw new Error('EMPC stageCost must be a function');
  }

  const termCost   = opts.termCost   ?? (() => 0);
  const uMinRaw    = opts.uMin       ?? new Array(m).fill(-1e6);
  const uMaxRaw    = opts.uMax       ?? new Array(m).fill( 1e6);
  const popSize    = opts.popSize    ?? Math.max(10, 5 * m * horizon);
  const maxGen     = opts.maxGen     ?? 200;
  const F          = opts.F          ?? 0.8;
  const CR         = opts.CR         ?? 0.9;
  const seed       = opts.seed       ?? null;

  // Dimension of the optimisation variable: u_0, …, u_{N-1} stacked
  const dOpt = m * horizon;

  // Bounds: repeat uMin/uMax across horizon
  const lb = Array.from({ length: dOpt }, (_, k) => uMinRaw[k % m]);
  const ub = Array.from({ length: dOpt }, (_, k) => uMaxRaw[k % m]);
  for (let i = 0; i < dOpt; i++) {
    if (!Number.isFinite(lb[i]) || !Number.isFinite(ub[i])) {
      throw new Error('EMPC requires finite uMin/uMax bounds for Differential Evolution');
    }
    if (lb[i] > ub[i]) throw new Error(`EMPC input bound conflict at horizon index ${i}`);
  }

  // Build trajectory cost function given a candidate control sequence vector
  function trajectoryCost(uVec, xStart) {
    let x = [...xStart];
    let cost = 0;
    for (let t = 0; t < horizon; t++) {
      const u = uVec.slice(t * m, t * m + m);
      cost += stageCost(x, u);
      // x_next = Ad·x + Bd·u
      const xNext = Ad.map((row, i) =>
        row.reduce((s, a, j) => s + a * x[j], 0) + Bd[i].reduce((s, b, j) => s + b * u[j], 0)
      );
      x = xNext;
    }
    cost += termCost(x);
    if (!Number.isFinite(cost)) return 1e18;
    return cost;
  }

  // Closed-loop simulation
  const xTraj      = [x0.slice()];
  const uTraj      = [];
  const stageCosts = [];
  const deInfo     = [];

  // Warm-start buffer: shift-and-append previous optimal sequence
  let uWarm = opts.uInit
    ? [...opts.uInit.slice(0, dOpt)]
    : new Array(dOpt).fill(0);

  for (let k = 0; k < steps; k++) {
    const xk = xTraj[k];

    // Solve open-loop optimisation
    const deOpts = {
      popSize, maxGen, F, CR, tol: 1e-10,
      seed: seed != null ? (seed + k * 997) : null,
      initialCandidate: uWarm,
    };

    // Inject warm-start individual into initial population
    const fn = (uVec) => trajectoryCost(uVec, xk);
    const result = differentialEvolution(fn, lb, ub, deOpts);

    // Extract first control action
    const uOpt = result.x.slice(0, m);

    // Apply to true system
    const xNext = Ad.map((row, i) =>
      row.reduce((s, a, j) => s + a * xk[j], 0) + Bd[i].reduce((s, b, j) => s + b * uOpt[j], 0)
    );

    xTraj.push(xNext);
    uTraj.push(uOpt);
    stageCosts.push(stageCost(xk, uOpt));
    deInfo.push({ fx: result.fx, generations: result.generations });

    // Warm-start: shift optimal sequence by one step, append zeros
    uWarm = [...result.x.slice(m), ...new Array(m).fill(0)];
  }

  return {
    x: xTraj,
    u: uTraj,
    stageCosts,
    totalCost: stageCosts.reduce((s, c) => s + c, 0),
    deInfo,
  };
}
