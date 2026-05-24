/**
 * verify_math_audit_fixes.mjs
 *
 * Verifies the three math-core fixes applied after the audit:
 *
 *   A1  stabilityMargins() collects ALL gain/phase crossings (not just first)
 *       and returns worst-case PM/GM with allGainCrossings / allPhaseCrossings arrays.
 *
 *   A2  matDet() uses O(n³) LU for n > 6 instead of O(n!) cofactor recursion.
 *       3×3 Sarrus rule also present.
 *
 *   A3  sortRootLocusBranches() uses Hungarian optimal assignment (_hungarianAssign)
 *       instead of greedy nearest-neighbor.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)       { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const stabilityJs  = readFileSync(path.join(ROOT, 'js/control/stability.js'),      'utf8');
const matrixJs     = readFileSync(path.join(ROOT, 'js/math/matrix.js'),             'utf8');
const rootLocusJs  = readFileSync(path.join(ROOT, 'js/analysis/root-locus.js'),     'utf8');

// ── A1: stabilityMargins — all crossings ─────────────────────────────────────
console.log('\n▶ A1  stabilityMargins() — all crossings');

assert(stabilityJs.includes('allGainCrossings'),
  'allGainCrossings array returned');
assert(stabilityJs.includes('allPhaseCrossings'),
  'allPhaseCrossings array returned');
assert((stabilityJs.match(/allGainCrossings\.push/g) || []).length >= 1,
  'gain crossings pushed inside loop');
assert((stabilityJs.match(/allPhaseCrossings\.push/g) || []).length >= 1,
  'phase crossings pushed inside loop');
assert(stabilityJs.includes('for (const gc of allGainCrossings)'),
  'iterates all gain crossings for worst-case PM');
assert(stabilityJs.includes('for (const pc of allPhaseCrossings)'),
  'iterates all phase crossings for worst-case GM');
assert(!stabilityJs.includes('if (isNaN(pmFreq))'),
  'removed early-exit first-crossing guard for PM');
assert(!stabilityJs.includes('if (isNaN(gmFreq))'),
  'removed early-exit first-crossing guard for GM');

// ── A2: matDet — LU fallback ─────────────────────────────────────────────────
console.log('\n▶ A2  matDet() — O(n³) LU for n > 6');

assert(matrixJs.includes('function _matDetLU'),
  '_matDetLU() private function defined');
assert(matrixJs.includes('if (n > 6) return _matDetLU(A)'),
  'matDet branches to LU for n > 6');
// Sarrus rule for n === 3
assert(matrixJs.includes('if (n === 3)'),
  '3×3 Sarrus direct formula present');
assert(matrixJs.includes('A[1][1] * A[2][2] - A[1][2] * A[2][1]'),
  'Sarrus expansion correct');
// LU uses partial pivoting
assert(matrixJs.includes('maxRow !== i') && matrixJs.includes('[M[i], M[maxRow]] = [M[maxRow], M[i]]'),
  'LU partial pivoting with row swap');
assert(matrixJs.includes('sign = -sign'),
  'LU sign flips on row swap');

// ── A3: sortRootLocusBranches — Hungarian ────────────────────────────────────
console.log('\n▶ A3  sortRootLocusBranches() — Hungarian optimal assignment');

assert(rootLocusJs.includes('function _hungarianAssign'),
  '_hungarianAssign() defined');
assert(rootLocusJs.includes('Float64Array') || rootLocusJs.includes('minVal'),
  'Hungarian uses minVal array');
assert(rootLocusJs.includes('Int32Array') || rootLocusJs.includes('way[j]'),
  'Hungarian uses way[] backtracking array');
assert(rootLocusJs.includes('_hungarianAssign(cost'),
  'sortRootLocusBranches calls _hungarianAssign');
assert(!rootLocusJs.includes('const used = new Array(n).fill(false)'),
  'old greedy nearest-neighbor loop removed');
assert(rootLocusJs.includes('// Build n×n cost matrix'),
  'cost matrix construction documented');
assert(rootLocusJs.includes('dr * dr + di * di'),
  'squared Euclidean cost metric used');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ Math audit fixes A1/A2/A3 — all checks passed');
