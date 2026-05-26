/**
 * cross_method.js - Tier I5: cross-method numerical verification table.
 */

export function crossCheck(name, methods, testProblems, { tol = 1e-9 } = {}) {
  const rows = [];
  for (const problem of testProblems) {
    const results = methods.map((method) => ({ name: method.name, value: method.solve(problem) }));
    const ref = Number(results[0].value);
    const diffs = results.map((r) => Math.abs(Number(r.value) - ref));
    rows.push({
      name,
      problem: problem.name ?? `case_${rows.length}`,
      results,
      maxDiff: Math.max(...diffs),
      pass: Math.max(...diffs) <= tol,
    });
  }
  return { name, tol, rows, pass: rows.every((row) => row.pass) };
}

export default { crossCheck };
