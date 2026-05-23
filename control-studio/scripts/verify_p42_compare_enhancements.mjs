/**
 * verify_p42_compare_enhancements.mjs
 *
 * Verifies P42 — B1-1/B1-2/B1-3 compare mode enhancements:
 *   B1-1  Snapshot overlay (existing infrastructure verified)
 *   B1-2  Best-value ★ marking + sortable columns
 *   B1-3  Diff heat-map toggle + CSV export
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label) { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── B1-1: Existing snapshot infrastructure ────────────────────────────────────
console.log('\n▶ B1-1 Snapshot Infrastructure');

assert(appJs.includes('saveComparisonSnapshot'), 'saveComparisonSnapshot() function');
assert(appJs.includes('comparisonSnapshots'), 'comparisonSnapshots array in state');
assert(appJs.includes('btn-save-snapshot'), '#btn-save-snapshot wired');
assert(indexHtml.includes('compare-section'), '#compare-section overlay panel');
assert(indexHtml.includes('chart-compare'), '#chart-compare chart');

// ── B1-2: Best-value marking + sortable columns ───────────────────────────────
console.log('\n▶ B1-2 Metrics Table Best-Value + Sort');

assert(appJs.includes('function initCompareTableEnhancements()'), 'initCompareTableEnhancements()');
assert(appJs.includes('compare-metrics-enhanced'), 'compare-metrics-enhanced class');
assert(appJs.includes('compare-best'), 'compare-best class for best-value cells');
assert(appJs.includes('compare-sort-arrow'), 'sort arrow indicator');
assert(appJs.includes('_sortCol'), '_sortCol state variable');
assert(appJs.includes('_sortDir'), '_sortDir state variable (asc/desc)');
assert(appJs.includes('bestIdx'), 'bestIdx computed per column');
assert(appJs.includes("' ★'") || appJs.includes("\" ★\"") || appJs.includes("star = isBest"), 'star ★ marking added');
assert(appJs.includes("'click'") || appJs.includes('"click"'), 'sort click handler on headers');
assert(appJs.includes('higherIsBetter') || appJs.includes('dir: 1') || appJs.includes('dir:1'), 'column sort direction defined');

assert(indexHtml.includes('.compare-metrics-enhanced th'), '.compare-metrics-enhanced th sortable CSS');
assert(indexHtml.includes('.compare-sort-arrow'), '.compare-sort-arrow CSS');
assert(indexHtml.includes('.compare-best'), '.compare-best CSS');

// ── B1-3: Diff highlight toggle + CSV ────────────────────────────────────────
console.log('\n▶ B1-3 Diff Highlight + CSV Export');

assert(appJs.includes('_diffMode'), '_diffMode state variable');
assert(appJs.includes('b1-diff-toggle'), '#b1-diff-toggle button referenced');
assert(appJs.includes('compare-diff-warn'), 'compare-diff-warn class for 5-15% diff');
assert(appJs.includes('compare-diff-bad'), 'compare-diff-bad class for >15% diff');
assert(appJs.includes('btn-b1-csv'), '#btn-b1-csv button referenced');
assert(appJs.includes('compare_metrics.csv'), 'CSV filename');
assert(appJs.includes('text/csv'), 'CSV MIME type');
assert(appJs.includes('URL.createObjectURL'), 'Blob URL for CSV download');
assert(appJs.includes('_refreshB1Table'), '_refreshB1Table exposed globally');

assert(indexHtml.includes('b1-toolbar'), '#b1-toolbar container in HTML');
assert(indexHtml.includes('b1-diff-toggle'), '#b1-diff-toggle button in HTML');
assert(indexHtml.includes('btn-b1-csv'), '#btn-b1-csv button in HTML');
assert(indexHtml.includes('.b1-toolbar'), '.b1-toolbar CSS defined');
assert(indexHtml.includes('.b1-diff-toggle'), '.b1-diff-toggle CSS defined');
assert(indexHtml.includes('.b1-diff-toggle.active'), '.b1-diff-toggle.active CSS defined');
assert(indexHtml.includes('.compare-diff-warn'), '.compare-diff-warn CSS');
assert(indexHtml.includes('.compare-diff-bad'), '.compare-diff-bad CSS');

// ── P42 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P42 DOMContentLoaded init');

assert(appJs.includes('initCompareTableEnhancements()'), 'initCompareTableEnhancements called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P42 B1 Compare Enhancements — all checks passed');
