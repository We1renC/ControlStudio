/**
 * milp.js - Tier D4: deterministic small MILP utilities.
 */

function objectiveValue(c, x) {
  return c.reduce((sum, value, i) => sum + value * x[i], 0);
}

function feasible(A, b, x) {
  return A.every((row, i) => row.reduce((sum, value, j) => sum + value * x[j], 0) <= b[i] + 1e-9);
}

export function solveBinaryMILP({ c, A = [], b = [], maximize = false } = {}) {
  if (!c) throw new Error('solveBinaryMILP requires c');
  const n = c.length;
  if (n > 24) throw new Error('solveBinaryMILP baseline supports up to 24 binary variables');
  let best = null;
  const total = 1 << n;
  for (let mask = 0; mask < total; mask++) {
    const x = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
    if (!feasible(A, b, x)) continue;
    const value = objectiveValue(c, x);
    if (!best || (maximize ? value > best.objective : value < best.objective)) best = { x, objective: value };
  }
  if (!best) return { status: 'infeasible', x: null, objective: maximize ? -Infinity : Infinity };
  return { status: 'optimal', ...best, nodes: total };
}

export function solveKnapsack({ values, weights, capacity } = {}) {
  const c = values.map((value) => value);
  const result = solveBinaryMILP({ c, A: [weights], b: [capacity], maximize: true });
  return { ...result, selected: result.x?.map((value, i) => value ? i : -1).filter((i) => i >= 0) ?? [] };
}

export function solveTSPHeldKarp(dist) {
  const n = dist.length;
  const dp = new Map();
  dp.set('1|0', { cost: 0, prev: -1 });
  for (let mask = 1; mask < (1 << n); mask++) {
    if (!(mask & 1)) continue;
    for (let j = 1; j < n; j++) {
      if (!(mask & (1 << j))) continue;
      const pmask = mask ^ (1 << j);
      let best = null;
      for (let i = 0; i < n; i++) {
        const prev = dp.get(`${pmask}|${i}`);
        if (!prev) continue;
        const cost = prev.cost + dist[i][j];
        if (!best || cost < best.cost) best = { cost, prev: i };
      }
      if (best) dp.set(`${mask}|${j}`, best);
    }
  }
  const full = (1 << n) - 1;
  let bestEnd = null;
  for (let j = 1; j < n; j++) {
    const entry = dp.get(`${full}|${j}`);
    if (!entry) continue;
    const cost = entry.cost + dist[j][0];
    if (!bestEnd || cost < bestEnd.cost) bestEnd = { cost, end: j };
  }
  const tour = [0];
  let mask = full;
  let cur = bestEnd.end;
  const rev = [];
  while (cur > 0) {
    rev.push(cur);
    const entry = dp.get(`${mask}|${cur}`);
    mask ^= 1 << cur;
    cur = entry.prev;
  }
  tour.push(...rev.reverse(), 0);
  return { status: 'optimal', objective: bestEnd.cost, tour };
}

export default { solveBinaryMILP, solveKnapsack, solveTSPHeldKarp };
