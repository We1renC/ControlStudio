/**
 * mixed_integer_mpc.js - Tier D6: small switched-system MIMPC baseline.
 */

function matVec(A, x) {
  return A.map((row) => row.reduce((sum, value, i) => sum + value * x[i], 0));
}

function add(a, b) {
  return a.map((value, i) => value + b[i]);
}

function modeStep(mode, x, u) {
  return add(matVec(mode.A, x), matVec(mode.B, u));
}

export function solveMixedIntegerMPC({ modes, x0, ref, horizon = 3, inputs = [[0]], Q = 1, R = 0.01 } = {}) {
  if (!modes?.length) throw new Error('solveMixedIntegerMPC requires modes');
  let best = null;
  function dfs(k, x, modeSeq, inputSeq, cost) {
    if (k === horizon) {
      if (!best || cost < best.cost) best = { cost, modeSeq: modeSeq.slice(), inputSeq: inputSeq.slice(), terminal: x.slice() };
      return;
    }
    for (let mi = 0; mi < modes.length; mi++) {
      for (const u of inputs) {
        const xn = modeStep(modes[mi], x, u);
        const tracking = xn.reduce((sum, value, i) => sum + Q * (value - (ref[i] ?? 0)) ** 2, 0);
        const effort = u.reduce((sum, value) => sum + R * value * value, 0);
        dfs(k + 1, xn, [...modeSeq, mi], [...inputSeq, u], cost + tracking + effort);
      }
    }
  }
  dfs(0, x0, [], [], 0);
  if (!best) return { status: 'infeasible' };
  return { status: 'optimal', ...best };
}

export default { solveMixedIntegerMPC };
