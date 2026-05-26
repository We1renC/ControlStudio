/**
 * formal.js - Tier F3: small finite-trace LTL/CTL-style specification checker.
 */

function holds(trace, idx, atom) {
  const state = trace[idx] ?? {};
  if (atom.startsWith('!')) return !state[atom.slice(1)];
  return !!state[atom];
}

export function checkLTL(trace, formula) {
  const text = formula.replace(/\s+/g, '');
  if (text === 'G(!unsafe)' || text === 'G(¬unsafe)') {
    const bad = trace.findIndex((_, i) => !holds(trace, i, '!unsafe'));
    return { satisfied: bad < 0, counterexample: bad < 0 ? null : trace.slice(0, bad + 1) };
  }
  const eventually = text.match(/^F\((\w+)\)$/);
  if (eventually) {
    const ok = trace.some((_, i) => holds(trace, i, eventually[1]));
    return { satisfied: ok, counterexample: ok ? null : trace };
  }
  const response = text.match(/^G\((\w+)->F\((\w+)\)\)$/);
  if (response) {
    const [, req, resp] = response;
    for (let i = 0; i < trace.length; i++) {
      if (holds(trace, i, req) && !trace.slice(i).some((_, j) => holds(trace, i + j, resp))) {
        return { satisfied: false, counterexample: trace.slice(i) };
      }
    }
    return { satisfied: true, counterexample: null };
  }
  throw new Error(`unsupported finite-trace LTL formula: ${formula}`);
}

export function checkCTL(graph, formula) {
  if (formula !== 'AG(!unsafe)') throw new Error(`unsupported CTL formula: ${formula}`);
  const visited = new Set();
  const stack = [graph.initial ?? 0];
  while (stack.length) {
    const node = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    if (graph.labels?.[node]?.unsafe) return { satisfied: false, counterexampleNode: node };
    for (const next of graph.edges?.[node] ?? []) stack.push(next);
  }
  return { satisfied: true, counterexampleNode: null };
}

export default { checkLTL, checkCTL };
